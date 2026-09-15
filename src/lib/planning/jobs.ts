import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { generateOccurrence } from "./recurrence";
import { sendMail, mailConfigured } from "../email";
import en from "@/messages/en.json";
export async function runJobs() {
  return db.transaction(async (guard) => {
    const lock = await guard.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(742119501) as acquired`,
    );
    if (!lock.rows[0]?.acquired) return { busy: 1 };
    const result = {
      generated: 0,
      paused: 0,
      notified: 0,
      emailed: 0,
      retried: 0,
    };
    const id = crypto.randomUUID();
    await guard.insert(s.jobRuns).values({ id });
    // Bounded catch-up: process one occurrence per selected rule per invocation.
    const rules = await db
      .select({ id: s.recurringTasks.id })
      .from(s.recurringTasks)
      .where(
        sql`${s.recurringTasks.enabled} and ${s.recurringTasks.nextDate} <= to_char(now() at time zone (${s.recurringTasks.definition}->>'timezone'),'YYYY-MM-DD')`,
      )
      .orderBy(s.recurringTasks.nextDate, s.recurringTasks.id)
      .limit(20);
    for (const rule of rules) {
      try {
        if (await generateOccurrence(rule.id)) result.generated++;
      } catch (e) {
        const code =
          typeof e === "object" && e && "code" in e
            ? String(e.code)
            : "unavailable";
        await db
          .update(s.recurringTasks)
          .set({
            enabled: false,
            lastError: [
              "forbidden",
              "invalid",
              "conflict",
              "dependency",
              "review",
            ].includes(code)
              ? code
              : "unavailable",
          })
          .where(eq(s.recurringTasks.id, rule.id));
        result.paused++;
      }
    }
    // Database-side reminder creation: no full workspace snapshots or open inbox required.
    const inserted = await db.execute(sql`
      insert into notification (id,workspace_id,user_id,task_id,kind,actor_name,task_title,dedupe_key)
      select gen_random_uuid()::text,t.workspace_id,m.user_id,t.id,
        case when t.due_date < to_char(now() at time zone (w.settings->>'timezone'),'YYYY-MM-DD') then 'overdue' else 'due' end,
        '',t.title,concat(case when t.due_date < to_char(now() at time zone (w.settings->>'timezone'),'YYYY-MM-DD') then 'overdue' else 'due' end,':',t.id,':',t.due_date,':',m.user_id)
      from task t join workspace w on w.id=t.workspace_id join task_status st on st.id=t.status_id
      join project p on p.id=t.project_id join membership m on m.workspace_id=t.workspace_id and (m.user_id=t.assignee_id or t.assignee_ids @> jsonb_build_array(m.user_id))
      join "user" u on u.id=m.user_id left join notification_preferences pref on pref.workspace_id=m.workspace_id and pref.user_id=m.user_id
      where m.active and not u.banned and t.deleted_at is null and not t.archived and p.deleted_at is null and not p.archived and st.category not in ('done','cancelled')
      and t.due_date <= to_char((now() at time zone (w.settings->>'timezone'))+interval '3 days','YYYY-MM-DD')
      and (p.visibility='organization' or m.role in ('owner','admin') or exists(select 1 from project_member pm where pm.project_id=p.id and pm.user_id=m.user_id))
      and (pref.enabled_kinds is null or pref.enabled_kinds ? (case when t.due_date < to_char(now() at time zone (w.settings->>'timezone'),'YYYY-MM-DD') then 'overdue' else 'due' end))
      on conflict(dedupe_key) do nothing returning id`);
    result.notified = inserted.rowCount ?? 0;
    if (mailConfigured()) {
      const pending = await db.execute<{
        id: string;
        email: string;
        kind: string;
        workspace_id: string;
        task_id: string;
        task_title: string;
        email_attempts: number;
      }>(sql`
        select n.*,u.email from notification n join "user" u on u.id=n.user_id join membership m on m.workspace_id=n.workspace_id and m.user_id=n.user_id
        join notification_preferences pref on pref.workspace_id=m.workspace_id and pref.user_id=m.user_id
        join task t on t.id=n.task_id join project p on p.id=t.project_id
        where n.emailed_at is null and n.email_attempts<5 and (n.email_retry_at is null or n.email_retry_at<=now()) and pref.email_enabled and pref.enabled_kinds ? n.kind
        and m.active and not u.banned and t.deleted_at is null and p.deleted_at is null
        and (p.visibility='organization' or m.role in ('owner','admin') or exists(select 1 from project_member pm where pm.project_id=p.id and pm.user_id=m.user_id))
        order by n.created_at,n.id limit 20`);
      for (const n of pending.rows) {
        try {
          const label =
            en.collaboration[n.kind as keyof typeof en.collaboration] ??
            en.collaboration.inbox;
          await sendMail(
            n.email,
            en.planning.notificationSubject,
            `${label}: ${n.task_title}\n\n${process.env.BETTER_AUTH_URL}/workspace?task=${encodeURIComponent(n.task_id)}&workspaceId=${encodeURIComponent(n.workspace_id)}`,
          );
          await db
            .update(s.notifications)
            .set({ emailedAt: new Date(), emailRetryAt: null })
            .where(eq(s.notifications.id, n.id));
          result.emailed++;
        } catch {
          await db
            .update(s.notifications)
            .set({
              emailAttempts: n.email_attempts + 1,
              emailRetryAt: new Date(
                Date.now() + Math.min(3600, 60 * 2 ** n.email_attempts) * 1000,
              ),
            })
            .where(eq(s.notifications.id, n.id));
          result.retried++;
        }
      }
    }
    await guard
      .update(s.jobRuns)
      .set({ finishedAt: new Date(), result })
      .where(eq(s.jobRuns.id, id));
    return result;
  });
}
