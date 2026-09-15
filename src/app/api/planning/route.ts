import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import {
  workspaceContext,
  checkOrigin,
  apiError,
  lockedWorkspace,
} from "@/lib/server-context";
import { DomainError, visibleWorkspace } from "@/lib/commands";
import { can, canSeeProject } from "@/lib/permissions";
import {
  captureRecurring,
  day,
  schedule,
  weekStart,
} from "@/lib/planning/model";
import { capacityPlan } from "@/lib/planning/capacity";
import { today } from "@/lib/dates";
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(120);
const input = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("capacity.calendar"),
    workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
  z.object({
    type: z.literal("milestone.save"),
    id: id.optional(),
    projectId: id,
    name,
    dueDate: day,
    taskIds: z.array(id).max(500),
    archived: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("capacity.save"),
    userId: id,
    week: day,
    hours: z.number().min(0).max(168),
  }),
  z.object({
    type: z.literal("recurrence.create"),
    taskId: id,
    name,
    schedule,
  }),
  z.object({ type: z.literal("recurrence.toggle"), id, enabled: z.boolean() }),
]);
export async function GET(request: Request) {
  try {
    const { workspace: w, actor } = await workspaceContext(request);
    const week = weekStart(
      day.parse(
        new URL(request.url).searchParams.get("week") ??
          today(w.settings?.timezone),
      ),
    );
    const projectIds = w.projects
      .filter((p) => !p.deletedAt && !p.archived && canSeeProject(w, p.id))
      .map((p) => p.id);
    const filter = (table: typeof s.milestones | typeof s.recurringTasks) =>
      and(eq(table.workspaceId, w.id), inArray(table.projectId, projectIds));
    const [milestones, links, rules, capacity] = await Promise.all([
      db.select().from(s.milestones).where(filter(s.milestones)),
      db
        .select()
        .from(s.milestoneTasks)
        .where(eq(s.milestoneTasks.workspaceId, w.id)),
      db.select().from(s.recurringTasks).where(filter(s.recurringTasks)),
      db
        .select()
        .from(s.capacities)
        .where(
          and(
            eq(s.capacities.workspaceId, w.id),
            eq(s.capacities.weekStart, week),
          ),
        ),
    ]);
    const ruleIds = rules.map((r) => r.id);
    const runs = ruleIds.length
      ? await db
          .select()
          .from(s.recurringRuns)
          .where(
            and(
              eq(s.recurringRuns.workspaceId, w.id),
              inArray(s.recurringRuns.recurringId, ruleIds),
            ),
          )
          .orderBy(desc(s.recurringRuns.createdAt))
          .limit(100)
      : [];
    return Response.json(
      {
        milestones: milestones.map((m) => {
          const taskIds = links
              .filter((l) => l.milestoneId === m.id)
              .map((l) => l.taskId),
            tasks = w.tasks.filter(
              (t) => taskIds.includes(t.id) && !t.deletedAt,
            );
          return {
            ...m,
            taskIds,
            total: tasks.length,
            completed: tasks.filter(
              (t) =>
                w.statuses.find((s) => s.id === t.statusId)?.category ===
                "done",
            ).length,
          };
        }),
        rules: rules.map(({ definition, ...r }) => ({
          ...r,
          schedule: { ...definition, tasks: undefined },
          taskCount: definition.tasks.length,
        })),
        runs,
        capacity: can(actor.role, "report.view", actor.permissions)
          ? capacityPlan(
              visibleWorkspace(w),
              week,
              capacity,
              today(w.settings?.timezone),
            )
          : null,
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
    const { workspace: initial } = await workspaceContext(request);
    const raw = await request.text();
    if (raw.length > 100000) throw new DomainError("invalid");
    const c = input.parse(JSON.parse(raw));
    await db.transaction(async (tx) => {
      const w = await lockedWorkspace(tx, initial.id, initial.currentUserId),
        actor = w.members.find((m) => m.id === w.currentUserId)!;
      const allowed = c.type.startsWith("recurrence")
        ? "task.create"
        : "project.manage";
      if (!can(actor.role, allowed, actor.permissions))
        throw new DomainError("forbidden");
      let entityId = "";
      let before: unknown = null;
      const project = (id: string) => {
        const p = w.projects.find(
          (p) => p.id === id && !p.deletedAt && !p.archived,
        );
        if (!p || !canSeeProject(w, id)) throw new DomainError("forbidden");
        return p;
      };
      if (c.type === "capacity.calendar") {
        before = w.settings;
        entityId = w.id;
        await tx
          .update(s.workspaces)
          .set({
            settings: {
              ...w.settings!,
              workingDays: [...new Set(c.workingDays)],
            },
          })
          .where(eq(s.workspaces.id, w.id));
      } else if (c.type === "milestone.save") {
        project(c.projectId);
        entityId = c.id ?? crypto.randomUUID();
        const [existing] = await tx
          .select()
          .from(s.milestones)
          .where(
            and(
              eq(s.milestones.id, entityId),
              eq(s.milestones.workspaceId, w.id),
            ),
          );
        if (c.id && !existing) throw new DomainError("notFound");
        if (existing && existing.projectId !== c.projectId)
          throw new DomainError("invalid");
        before = existing;
        if (
          c.taskIds.some(
            (id) =>
              !w.tasks.some(
                (t) =>
                  t.id === id && t.projectId === c.projectId && !t.deletedAt,
              ),
          )
        )
          throw new DomainError("invalid");
        const value = {
          workspaceId: w.id,
          projectId: c.projectId,
          name: c.name,
          dueDate: c.dueDate,
          archived: c.archived,
        };
        if (existing)
          await tx
            .update(s.milestones)
            .set(value)
            .where(eq(s.milestones.id, entityId));
        else
          await tx
            .insert(s.milestones)
            .values({ id: entityId, ...value, createdBy: actor.id });
        await tx
          .delete(s.milestoneTasks)
          .where(
            and(
              eq(s.milestoneTasks.workspaceId, w.id),
              eq(s.milestoneTasks.milestoneId, entityId),
            ),
          );
        for (const taskId of new Set(c.taskIds)) {
          const [old] = await tx
            .select()
            .from(s.milestoneTasks)
            .where(
              and(
                eq(s.milestoneTasks.workspaceId, w.id),
                eq(s.milestoneTasks.taskId, taskId),
              ),
            );
          if (old && old.milestoneId !== entityId)
            throw new DomainError("conflict");
          await tx
            .insert(s.milestoneTasks)
            .values({ workspaceId: w.id, milestoneId: entityId, taskId });
        }
      } else if (c.type === "capacity.save") {
        if (!w.members.some((m) => m.id === c.userId && m.active !== false))
          throw new DomainError("invalid");
        const week = weekStart(c.week);
        const [old] = await tx
          .select()
          .from(s.capacities)
          .where(
            and(
              eq(s.capacities.workspaceId, w.id),
              eq(s.capacities.userId, c.userId),
              eq(s.capacities.weekStart, week),
            ),
          );
        before = old;
        entityId = old?.id ?? crypto.randomUUID();
        await tx
          .insert(s.capacities)
          .values({
            id: entityId,
            workspaceId: w.id,
            userId: c.userId,
            weekStart: week,
            hours: c.hours,
          })
          .onConflictDoUpdate({
            target: [
              s.capacities.workspaceId,
              s.capacities.userId,
              s.capacities.weekStart,
            ],
            set: { hours: c.hours },
          });
      } else if (c.type === "recurrence.create") {
        let tasks;
        try {
          tasks = captureRecurring(w.tasks, c.taskId);
        } catch {
          throw new DomainError("invalid");
        }
        project(tasks[0].projectId);
        entityId = crypto.randomUUID();
        await tx.insert(s.recurringTasks).values({
          id: entityId,
          workspaceId: w.id,
          projectId: tasks[0].projectId,
          name: c.name,
          createdBy: actor.id,
          definition: { ...c.schedule, tasks },
          nextDate: c.schedule.anchorDate,
        });
      } else {
        const [old] = await tx
          .select()
          .from(s.recurringTasks)
          .where(
            and(
              eq(s.recurringTasks.id, c.id),
              eq(s.recurringTasks.workspaceId, w.id),
            ),
          );
        if (!old) throw new DomainError("notFound");
        project(old.projectId);
        if (
          old.createdBy !== actor.id &&
          !can(actor.role, "task.assign", actor.permissions)
        )
          throw new DomainError("forbidden");
        before = old;
        entityId = old.id;
        await tx
          .update(s.recurringTasks)
          .set({ enabled: c.enabled, lastError: null })
          .where(eq(s.recurringTasks.id, old.id));
      }
      await tx.insert(s.auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: w.id,
        actorId: actor.id,
        action: c.type,
        entityId,
        detail: { before, after: c },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
