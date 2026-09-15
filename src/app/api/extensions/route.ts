import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import {
  lockedWorkspace,
  workspaceContext,
  checkOrigin,
  apiError,
} from "@/lib/server-context";
import { visibleWorkspace, DomainError } from "@/lib/commands";
import { can, canEditTask, canSeeProject } from "@/lib/permissions";
import {
  extensionCommand,
  validFieldValue,
  elapsedMinutes,
} from "@/lib/v2/model";
import {
  newToken,
  hashToken,
  seal,
  validateHookUrl,
} from "@/lib/v2/integrations";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const { workspace, actor } = await workspaceContext(request),
      w = visibleWorkspace(workspace),
      ids = w.tasks.filter((t) => !t.deletedAt).map((t) => t.id),
      q = new URL(request.url).searchParams;
    const from = z.iso
        .date()
        .parse(
          q.get("from") ||
            new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        ),
      to = z.iso
        .date()
        .parse(q.get("to") || new Date().toISOString().slice(0, 10));
    if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366)
      throw new DomainError("invalid");
    const scope = eq(s.customFields.workspaceId, w.id),
      fields = (await db.select().from(s.customFields).where(scope)).filter(
        (f) => !f.projectId || w.projects.some((p) => p.id === f.projectId),
      );
    const values = ids.length
      ? await db
          .select()
          .from(s.customValues)
          .where(
            and(
              eq(s.customValues.workspaceId, w.id),
              inArray(s.customValues.taskId, ids),
            ),
          )
      : [];
    const timeWhere = and(
      eq(s.timeEntries.workspaceId, w.id),
      ids.length ? inArray(s.timeEntries.taskId, ids) : sql`false`,
      sql`${s.timeEntries.deletedAt} is null`,
      can(actor.role, "report.view", actor.permissions)
        ? undefined
        : eq(s.timeEntries.userId, actor.id),
      sql`(${s.timeEntries.endedAt} is null or (${s.timeEntries.startedAt}>=${from}::date and ${s.timeEntries.startedAt}<${to}::date+interval '1 day'))`,
    );
    const entries = await db
      .select()
      .from(s.timeEntries)
      .where(timeWhere)
      .orderBy(sql`${s.timeEntries.startedAt} desc`)
      .limit(1000);
    const running = await db
      .select()
      .from(s.timeEntries)
      .where(
        and(
          eq(s.timeEntries.workspaceId, w.id),
          eq(s.timeEntries.userId, actor.id),
          sql`${s.timeEntries.endedAt} is null and ${s.timeEntries.deletedAt} is null`,
        ),
      );
    for (const entry of running)
      if (!entries.some((e) => e.id === entry.id)) entries.push(entry);
    const totals = await db
      .select({
        taskId: s.timeEntries.taskId,
        userId: s.timeEntries.userId,
        minutes: sql<number>`coalesce(sum(${s.timeEntries.minutes}),0)::float8`,
      })
      .from(s.timeEntries)
      .where(timeWhere)
      .groupBy(s.timeEntries.taskId, s.timeEntries.userId);
    const admin = can(actor.role, "user.manage", actor.permissions);
    const keys = (
      await db
        .select()
        .from(s.integrationKeys)
        .where(
          and(
            eq(s.integrationKeys.workspaceId, w.id),
            admin ? undefined : eq(s.integrationKeys.userId, actor.id),
          ),
        )
    ).map(({ hash, requests, windowAt, ...k }) => k);
    const hooks = admin
      ? (
          await db
            .select()
            .from(s.webhookEndpoints)
            .where(eq(s.webhookEndpoints.workspaceId, w.id))
        ).map(({ encryptedSecret, ...h }) => h)
      : [];
    const deliveries = admin
      ? await db
          .select({
            id: s.webhookDeliveries.id,
            endpointId: s.webhookDeliveries.endpointId,
            eventId: s.webhookDeliveries.eventId,
            attempts: s.webhookDeliveries.attempts,
            deliveredAt: s.webhookDeliveries.deliveredAt,
            lastStatus: s.webhookDeliveries.lastStatus,
          })
          .from(s.webhookDeliveries)
          .where(eq(s.webhookDeliveries.workspaceId, w.id))
          .orderBy(sql`${s.webhookDeliveries.nextAt} desc`)
          .limit(50)
      : [];
    return Response.json(
      {
        fields,
        values: values.filter((v) =>
          fields.some(
            (f) =>
              f.id === v.fieldId &&
              (!f.projectId ||
                w.tasks.find((t) => t.id === v.taskId)?.projectId ===
                  f.projectId),
          ),
        ),
        entries,
        totals,
        keys,
        hooks,
        deliveries,
        aiEnabled:
          process.env.AI_ENABLED === "true" &&
          !!process.env.AI_BASE_URL &&
          !!process.env.AI_MODEL,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { workspace, actor } = await workspaceContext(request);
    const raw = await request.text();
    if (raw.length > 20000) throw new DomainError("invalid");
    const c = extensionCommand.parse(JSON.parse(raw));
    const result = await db.transaction(async (tx) => {
      const w = await lockedWorkspace(tx, workspace.id, actor.id),
        a = w.members.find((m) => m.id === actor.id)!;
      const need = (p: Parameters<typeof can>[1]) => {
        if (!can(a.role, p, a.permissions)) throw new DomainError("forbidden");
      };
      const task = (id: string) => {
        const t = w.tasks.find(
          (t) => t.id === id && !t.deletedAt && !t.archived,
        );
        if (
          !t ||
          !canEditTask(w, t) ||
          w.projects.some(
            (p) => p.id === t.projectId && (p.archived || p.deletedAt),
          )
        )
          throw new DomainError("forbidden");
        return t;
      };
      let before: unknown = null;
      let secret: string | undefined,
        entityId = "id" in c ? c.id : undefined;
      if (c.type === "field.save") {
        need("project.manage");
        if (c.projectId && !canSeeProject(w, c.projectId))
          throw new DomainError("forbidden");
        const [old] = c.id
          ? await tx
              .select()
              .from(s.customFields)
              .where(
                and(
                  eq(s.customFields.id, c.id),
                  eq(s.customFields.workspaceId, w.id),
                ),
              )
          : [];
        before = old ?? null;
        if (c.id && !old) throw new DomainError("forbidden");
        if (old && (old.kind !== c.kind || old.projectId !== c.projectId))
          throw new DomainError("invalid");
        if (old && old.options.some((o) => !c.options.includes(o)))
          throw new DomainError("invalid");
        const id = c.id || crypto.randomUUID();
        entityId = id;
        const { type, ...f } = c;
        await tx
          .insert(s.customFields)
          .values({
            ...f,
            id,
            workspaceId: w.id,
            options: [...new Set(c.options)],
          })
          .onConflictDoUpdate({
            target: s.customFields.id,
            set: {
              name: c.name,
              options: [...new Set(c.options)],
              archived: c.archived,
            },
          });
      } else if (c.type === "field.value") {
        const t = task(c.taskId);
        const [f] = await tx
          .select()
          .from(s.customFields)
          .where(
            and(
              eq(s.customFields.id, c.fieldId),
              eq(s.customFields.workspaceId, w.id),
            ),
          );
        if (
          !f ||
          f.archived ||
          (f.projectId && f.projectId !== t.projectId) ||
          !validFieldValue(
            f,
            c.value,
            w.members.filter((m) => m.active !== false).map((m) => m.id),
          )
        )
          throw new DomainError("invalid");
        const [previous] = await tx
          .select()
          .from(s.customValues)
          .where(
            and(
              eq(s.customValues.taskId, t.id),
              eq(s.customValues.fieldId, f.id),
              eq(s.customValues.workspaceId, w.id),
            ),
          );
        before = previous?.value ?? null;
        await tx
          .insert(s.customValues)
          .values({
            id: crypto.randomUUID(),
            workspaceId: w.id,
            taskId: t.id,
            fieldId: f.id,
            value: c.value,
          })
          .onConflictDoUpdate({
            target: [s.customValues.taskId, s.customValues.fieldId],
            set: { value: c.value },
          });
        entityId = t.id;
      } else if (c.type.startsWith("time.")) {
        const [old] =
          "id" in c && c.id
            ? await tx
                .select()
                .from(s.timeEntries)
                .where(
                  and(
                    eq(s.timeEntries.id, c.id),
                    eq(s.timeEntries.workspaceId, w.id),
                  ),
                )
            : [];
        before = old ?? null;
        if ("id" in c && c.id && (!old || old.userId !== a.id || old.deletedAt))
          throw new DomainError("forbidden");
        if (c.type === "time.start" || c.type === "time.save") {
          const t = task(c.taskId);
          if (old && old.taskId !== c.taskId) throw new DomainError("invalid");
          if (c.type === "time.start") {
            const [active] = await tx
              .select()
              .from(s.timeEntries)
              .where(
                and(
                  eq(s.timeEntries.workspaceId, w.id),
                  eq(s.timeEntries.userId, a.id),
                  sql`${s.timeEntries.endedAt} is null and ${s.timeEntries.deletedAt} is null`,
                ),
              );
            if (active) throw new DomainError("conflict");
            entityId = crypto.randomUUID();
            await tx.insert(s.timeEntries).values({
              id: entityId,
              workspaceId: w.id,
              taskId: t.id,
              userId: a.id,
              startedAt: new Date(),
              note: c.note,
            });
          } else {
            if (old && !old.endedAt) throw new DomainError("conflict");
            const startedAt = new Date(c.startedAt),
              endedAt = new Date(startedAt.getTime() + c.minutes * 60000);
            if (endedAt.getTime() > Date.now() + 60000)
              throw new DomainError("invalid");
            entityId = c.id || crypto.randomUUID();
            await tx
              .insert(s.timeEntries)
              .values({
                id: entityId,
                workspaceId: w.id,
                taskId: t.id,
                userId: a.id,
                startedAt,
                endedAt,
                minutes: c.minutes,
                note: c.note,
              })
              .onConflictDoUpdate({
                target: s.timeEntries.id,
                set: { startedAt, endedAt, minutes: c.minutes, note: c.note },
              });
          }
        } else if (c.type === "time.stop") {
          if (!old || old.endedAt) throw new DomainError("conflict");
          // Stopping one's timer stays possible after a task is archived or reassigned.
          const end = new Date();
          await tx
            .update(s.timeEntries)
            .set({ endedAt: end, minutes: elapsedMinutes(old.startedAt, end) })
            .where(eq(s.timeEntries.id, old.id));
        } else if (c.type === "time.delete") {
          if (!old) throw new DomainError("invalid");
          await tx
            .update(s.timeEntries)
            .set({ deletedAt: new Date() })
            .where(eq(s.timeEntries.id, old.id));
        }
      } else if (c.type === "key.create") {
        if (c.scopes.some((x) => x !== "calendar:read")) need("user.manage");
        if (c.projectId && !canSeeProject(w, c.projectId))
          throw new DomainError("forbidden");
        secret = newToken();
        entityId = crypto.randomUUID();
        await tx.insert(s.integrationKeys).values({
          id: entityId,
          workspaceId: w.id,
          userId: a.id,
          name: c.name,
          projectId: c.projectId,
          scopes: c.scopes,
          hash: hashToken(secret),
          expiresAt: new Date(Date.now() + c.days * 86400000),
        });
      } else if (c.type === "key.revoke") {
        const [key] = await tx
          .select()
          .from(s.integrationKeys)
          .where(
            and(
              eq(s.integrationKeys.id, c.id),
              eq(s.integrationKeys.workspaceId, w.id),
            ),
          );
        if (
          !key ||
          (key.userId !== a.id && !can(a.role, "user.manage", a.permissions))
        )
          throw new DomainError("forbidden");
        await tx
          .update(s.integrationKeys)
          .set({ revokedAt: new Date() })
          .where(eq(s.integrationKeys.id, c.id));
      } else if (c.type === "hook.create") {
        need("user.manage");
        if (!canSeeProject(w, c.projectId)) throw new DomainError("forbidden");
        validateHookUrl(c.url);
        secret = newToken();
        entityId = crypto.randomUUID();
        await tx.insert(s.webhookEndpoints).values({
          id: entityId,
          workspaceId: w.id,
          userId: a.id,
          name: c.name,
          projectId: c.projectId,
          url: c.url,
          encryptedSecret: seal(secret),
        });
      } else if (c.type === "hook.toggle") {
        need("user.manage");
        await tx
          .update(s.webhookEndpoints)
          .set({ enabled: c.enabled })
          .where(
            and(
              eq(s.webhookEndpoints.id, c.id),
              eq(s.webhookEndpoints.workspaceId, w.id),
            ),
          );
      } else if (c.type === "hook.retry") {
        need("user.manage");
        await tx
          .update(s.webhookDeliveries)
          .set({ attempts: 0, nextAt: new Date() })
          .where(
            and(
              eq(s.webhookDeliveries.id, c.id),
              eq(s.webhookDeliveries.workspaceId, w.id),
              sql`${s.webhookDeliveries.deliveredAt} is null`,
            ),
          );
      }
      await tx.insert(s.auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: w.id,
        actorId: a.id,
        action: c.type,
        entityId: entityId ?? null,
        detail:
          c.type.startsWith("field.") || c.type.startsWith("time.")
            ? { command: c, before }
            : { type: c.type },
      });
      return { ok: true, id: entityId, secret };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
