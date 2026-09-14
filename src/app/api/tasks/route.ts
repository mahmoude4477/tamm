import {
  and,
  eq,
  or,
  sql,
  isNull,
  asc,
  desc,
  count,
  inArray,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { getIdentity, resolveMembership, apiError } from "@/lib/server-context";
import { DomainError } from "@/lib/commands";
import { today } from "@/lib/dates";
const schema = z.object({
  page: z.coerce.number().int().min(0).max(10000).default(0),
  size: z.coerce.number().int().min(1).max(100).default(25),
  sort: z
    .enum([
      "title",
      "priority",
      "dueDate",
      "estimatedHours",
      "actualHours",
      "status",
      "assignee",
      "project",
    ])
    .default("title"),
  desc: z.enum(["true", "false"]).default("false"),
  search: z.string().max(200).optional(),
  project: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
  priority: z.string().max(20).optional(),
  assignee: z.string().max(100).optional(),
  creator: z.string().max(100).optional(),
  team: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  tag: z.string().max(40).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  overdue: z.string().optional(),
  dependency: z.string().optional(),
  attachment: z.string().optional(),
  scope: z.string().optional(),
});
export async function GET(request: Request) {
  try {
    const identity = await getIdentity(request),
      member = await resolveMembership(
        request,
        identity.user.id,
        identity.session.activeOrganizationId,
      );
    if (!member) throw new DomainError("forbidden");
    const q = schema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const [workspace] = await db
      .select({ settings: s.workspaces.settings })
      .from(s.workspaces)
      .where(eq(s.workspaces.id, member.workspaceId));
    const date = today(workspace.settings.timezone),
      my = sql`(${s.tasks.assigneeId} = ${identity.user.id} or ${s.tasks.assigneeIds} @> ${JSON.stringify([identity.user.id])}::jsonb)`;
    const visibility = ["owner", "admin"].includes(member.role)
      ? undefined
      : or(
          eq(s.projects.visibility, "organization"),
          sql`exists(select 1 from ${s.projectMembers} where ${s.projectMembers.workspaceId}=${member.workspaceId} and ${s.projectMembers.projectId}=${s.tasks.projectId} and ${s.projectMembers.userId}=${identity.user.id})`,
        );
    const filters = and(
      eq(s.tasks.workspaceId, member.workspaceId),
      visibility,
      isNull(s.tasks.deletedAt),
      eq(s.tasks.archived, false),
      isNull(s.projects.deletedAt),
      eq(s.projects.archived, false),
      q.project ? eq(s.tasks.projectId, q.project) : undefined,
      q.status ? eq(s.tasks.statusId, q.status) : undefined,
      q.priority ? eq(s.tasks.priority, q.priority as "medium") : undefined,
      q.assignee
        ? sql`(${s.tasks.assigneeId}=${q.assignee} or ${s.tasks.assigneeIds} @> ${JSON.stringify([q.assignee])}::jsonb)`
        : undefined,
      q.creator ? eq(s.tasks.reporterId, q.creator) : undefined,
      q.search
        ? sql`position(lower(${q.search}) in lower(concat_ws(' ',${s.tasks.title},${s.tasks.description},${s.tasks.tags}::text,${s.projects.name},${s.tasks.number}::text,${s.user.name})))>0`
        : undefined,
      q.tag
        ? sql`exists(select 1 from jsonb_array_elements_text(${s.tasks.tags}) tag where position(lower(${q.tag}) in lower(tag))>0)`
        : undefined,
      q.from ? sql`${s.tasks.dueDate} >= ${q.from}` : undefined,
      q.to ? sql`${s.tasks.dueDate} <= ${q.to}` : undefined,
      q.overdue === "true"
        ? sql`${s.tasks.dueDate}<${date} and ${s.statuses.category} not in ('done','cancelled')`
        : undefined,
      q.attachment === "true"
        ? sql`exists(select 1 from ${s.attachments} where ${s.attachments.workspaceId}=${member.workspaceId} and ${s.attachments.taskId}=${s.tasks.id} and ${s.attachments.deletedAt} is null)`
        : undefined,
      q.dependency === "true"
        ? sql`exists(select 1 from ${s.taskDependencies} where ${s.taskDependencies.workspaceId}=${member.workspaceId} and ${s.taskDependencies.taskId}=${s.tasks.id})`
        : undefined,
      q.team || q.department
        ? sql`exists(select 1 from ${s.memberships} m where m.workspace_id=${member.workspaceId} and (m.user_id=${s.tasks.assigneeId} or ${s.tasks.assigneeIds} @> jsonb_build_array(m.user_id)) and exists(select 1 from ${s.teams} tm where tm.workspace_id=${member.workspaceId} and ${q.team ? sql`tm.id=${q.team}` : sql`tm.department_id=${q.department}`} and (m.team_id=tm.id or exists(select 1 from ${s.teamMember} link where link.user_id=m.user_id and link.team_id=tm.id))))`
        : undefined,
      q.scope === "created"
        ? eq(s.tasks.reporterId, identity.user.id)
        : q.scope
          ? and(
              my,
              q.scope === "today"
                ? eq(s.tasks.dueDate, date)
                : q.scope === "overdue"
                  ? sql`${s.tasks.dueDate}<${date} and ${s.statuses.category} not in ('done','cancelled')`
                  : q.scope === "upcoming"
                    ? sql`${s.tasks.dueDate}>${date} and ${s.statuses.category} not in ('done','cancelled')`
                    : q.scope === "review"
                      ? eq(s.statuses.category, "review")
                      : q.scope === "completed"
                        ? and(
                            eq(s.statuses.category, "done"),
                            sql`${s.tasks.completedAt} > ${new Date(Date.now() - 30 * 86400000).toISOString()}`,
                          )
                        : undefined,
            )
          : undefined,
    );
    const sortColumns = {
      title: s.tasks.title,
      priority: s.tasks.priority,
      dueDate: s.tasks.dueDate,
      estimatedHours: s.tasks.estimatedHours,
      actualHours: s.tasks.actualHours,
      status: s.statuses.name,
      assignee: s.user.name,
      project: s.projects.name,
    };
    const order =
      q.desc === "true" ? desc(sortColumns[q.sort]) : asc(sortColumns[q.sort]);
    const base = db
      .select({ task: s.tasks })
      .from(s.tasks)
      .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
      .innerJoin(s.statuses, eq(s.statuses.id, s.tasks.statusId))
      .leftJoin(s.user, eq(s.user.id, s.tasks.assigneeId));
    const [rows, total] = await Promise.all([
      base
        .where(filters)
        .orderBy(order, asc(s.tasks.id))
        .limit(q.size)
        .offset(q.page * q.size),
      db
        .select({ value: count() })
        .from(s.tasks)
        .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
        .innerJoin(s.statuses, eq(s.statuses.id, s.tasks.statusId))
        .leftJoin(s.user, eq(s.user.id, s.tasks.assigneeId))
        .where(filters),
    ]);
    const ids = rows.map((r) => r.task.id),
      dependencies = ids.length
        ? await db
            .select()
            .from(s.taskDependencies)
            .where(
              and(
                eq(s.taskDependencies.workspaceId, member.workspaceId),
                inArray(s.taskDependencies.taskId, ids),
              ),
            )
        : [];
    return Response.json(
      {
        items: rows.map(({ task: { workspaceId: _, ...task } }) => ({
          ...task,
          dependencyIds: dependencies
            .filter((d) => d.taskId === task.id)
            .map((d) => d.dependsOnId),
        })),
        total: total[0].value,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
