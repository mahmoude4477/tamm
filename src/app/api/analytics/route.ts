import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { getIdentity, resolveMembership, apiError } from "@/lib/server-context";
import { can } from "@/lib/permissions";
import { DomainError } from "@/lib/commands";
import { today } from "@/lib/dates";
import { addDays, day, daysBetween, weekStart } from "@/lib/planning/model";
import { projectHealth, type ProjectAnalytics } from "@/lib/planning/analytics";
export async function GET(request: Request) {
  try {
    const identity = await getIdentity(request),
      m = await resolveMembership(
        request,
        identity.user.id,
        identity.session.activeOrganizationId,
      );
    if (!m) throw new DomainError("forbidden");
    const [role] = m.customRoleId
      ? await db
          .select()
          .from(s.customRoles)
          .where(
            and(
              eq(s.customRoles.id, m.customRoleId),
              eq(s.customRoles.workspaceId, m.workspaceId),
            ),
          )
      : [];
    if (
      !can(
        m.role,
        "report.view",
        m.customRoleId ? (role?.permissions ?? []) : undefined,
      )
    )
      throw new DomainError("forbidden");
    const [workspace] = await db
      .select()
      .from(s.workspaces)
      .where(eq(s.workspaces.id, m.workspaceId));
    const timezone = workspace.settings.timezone,
      date = today(timezone),
      q = new URL(request.url).searchParams;
    const from = day.parse(q.get("from") ?? addDays(date, -83)),
      to = day.parse(q.get("to") ?? date),
      project = q.get("project") || null;
    if (from > to || daysBetween(from, to) > 730)
      throw new DomainError("invalid");
    const visible = sql`p.workspace_id=${m.workspaceId} and p.deleted_at is null and not p.archived and (${project ?? null}::text is null or p.id=${project ?? null}) and (p.visibility='organization' or ${["owner", "admin"].includes(m.role)} or exists(select 1 from project_member pm where pm.project_id=p.id and pm.user_id=${identity.user.id}))`;
    const donePeriod = sql`st.category='done' and (t.completed_at::timestamptz at time zone ${timezone})::date between ${from}::date and ${to}::date`;
    const rows = await db.execute<
      Record<string, unknown>
    >(sql`select p.id,p.name,p.start_date,p.end_date,
 count(t.id) filter(where st.category<>'cancelled') as total,count(t.id) filter(where st.category='done') as completed,
 count(t.id) filter(where st.category not in ('done','cancelled')) as open,
 count(t.id) filter(where st.category not in ('done','cancelled') and t.due_date<${date}) as overdue,
 count(t.id) filter(where st.category not in ('done','cancelled') and exists(select 1 from task_dependency dep join task blocker on blocker.id=dep.depends_on_id join task_status bs on bs.id=blocker.status_id where dep.task_id=t.id and blocker.deleted_at is null and bs.category<>'done')) as blocked,
 count(t.id) filter(where ${donePeriod}) as period_completed,
 count(t.id) filter(where ${donePeriod} and t.due_date is not null) as dated_completed,
 count(t.id) filter(where ${donePeriod} and (t.completed_at::timestamptz at time zone ${timezone})::date<=t.due_date::date) as on_time,
 percentile_cont(0.5) within group(order by extract(epoch from(t.completed_at::timestamptz-t.created_at::timestamptz))/86400) filter(where ${donePeriod}) as median_days,
 percentile_cont(0.85) within group(order by extract(epoch from(t.completed_at::timestamptz-t.created_at::timestamptz))/86400) filter(where ${donePeriod}) as p85_days,
 (select count(*) from milestone ms where ms.project_id=p.id and not ms.archived and ms.due_date<${date} and (not exists(select 1 from milestone_task mt where mt.milestone_id=ms.id) or exists(select 1 from milestone_task mt join task tt on tt.id=mt.task_id join task_status ts on ts.id=tt.status_id where mt.milestone_id=ms.id and tt.deleted_at is null and ts.category<>'done'))) as late_milestones
 from project p left join task t on t.project_id=p.id and t.workspace_id=p.workspace_id and t.deleted_at is null and not t.archived left join task_status st on st.id=t.status_id where ${visible} group by p.id order by p.name`);
    const weekly = await db.execute<{ week: string; completed: string }>(
      sql`select to_char(date_trunc('week',t.completed_at::timestamptz at time zone ${timezone}),'YYYY-MM-DD') as week,count(*) as completed from task t join project p on p.id=t.project_id and p.workspace_id=t.workspace_id join task_status st on st.id=t.status_id where ${visible} and t.deleted_at is null and not t.archived and ${donePeriod} group by 1 order by 1`,
    );
    const aging = await db.execute<{ bucket: string; count: string }>(
      sql`select case when ${date}::date-(t.created_at::timestamptz at time zone ${timezone})::date<7 then 'under7' when ${date}::date-(t.created_at::timestamptz at time zone ${timezone})::date<30 then 'under30' else 'over30' end as bucket,count(*) as count from task t join project p on p.id=t.project_id and p.workspace_id=t.workspace_id join task_status st on st.id=t.status_id where ${visible} and t.deleted_at is null and not t.archived and st.category not in ('done','cancelled') group by 1`,
    );
    const projects = rows.rows.map((r) => {
      const p = {
        id: String(r.id),
        name: String(r.name),
        startDate: r.start_date as string | null,
        endDate: r.end_date as string | null,
        total: Number(r.total),
        completed: Number(r.completed),
        open: Number(r.open),
        overdue: Number(r.overdue),
        blocked: Number(r.blocked),
        periodCompleted: Number(r.period_completed),
        onTime: Number(r.on_time),
        datedCompleted: Number(r.dated_completed),
        medianDays: r.median_days == null ? null : Number(r.median_days),
        p85Days: r.p85_days == null ? null : Number(r.p85_days),
        lateMilestones: Number(r.late_milestones),
      };
      return {
        ...p,
        progress: p.total ? Math.round((p.completed / p.total) * 100) : 0,
        health: projectHealth(p, date),
        forecastWeeks:
          p.periodCompleted >= 3
            ? Math.ceil(
                p.open /
                  (p.periodCompleted / ((daysBetween(from, to) + 1) / 7)),
              )
            : null,
      } satisfies ProjectAnalytics;
    });
    return Response.json(
      {
        from,
        to,
        projects,
        weekly: Array.from(
          { length: Math.floor(daysBetween(weekStart(from), to) / 7) + 1 },
          (_, i) => {
            const week = addDays(weekStart(from), i * 7);
            return {
              week,
              completed: Number(
                weekly.rows.find((r) => r.week === week)?.completed ?? 0,
              ),
            };
          },
        ),
        aging: aging.rows.map((r) => ({ ...r, count: Number(r.count) })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
