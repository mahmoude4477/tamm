import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { loadWorkspace, saveWorkspace } from "@/db/workspace";
import { applyCommand, DomainError } from "../commands";
import { can, canSeeProject } from "../permissions";
import { today } from "../dates";
import { notifyChanges } from "../notifications";
import { addDays, daysBetween, nextOccurrence } from "./model";
export async function generateOccurrence(id: string) {
  return db.transaction(async (tx) => {
    const [initial] = await tx
      .select()
      .from(s.recurringTasks)
      .where(eq(s.recurringTasks.id, id));
    if (!initial) return false;
    // Match the workspace-before-entity lock order used by interactive commands.
    await tx
      .select()
      .from(s.workspaces)
      .where(eq(s.workspaces.id, initial.workspaceId))
      .for("update");
    const [rule] = await tx
      .select()
      .from(s.recurringTasks)
      .where(eq(s.recurringTasks.id, id))
      .for("update");
    if (!rule.enabled || rule.nextDate > today(rule.definition.timezone))
      return false;
    if (rule.definition.endDate && rule.nextDate > rule.definition.endDate) {
      await tx
        .update(s.recurringTasks)
        .set({ enabled: false })
        .where(eq(s.recurringTasks.id, id));
      return false;
    }
    const before = await loadWorkspace(tx, rule.workspaceId, rule.createdBy),
      actor = before.members.find((m) => m.id === rule.createdBy),
      project = before.projects.find((p) => p.id === rule.projectId);
    const [account] = await tx
      .select({ banned: s.user.banned })
      .from(s.user)
      .where(eq(s.user.id, rule.createdBy));
    if (
      !actor ||
      actor.active === false ||
      account?.banned ||
      !can(actor.role, "task.create", actor.permissions) ||
      !project ||
      project.deletedAt ||
      project.archived ||
      !canSeeProject(before, project.id)
    )
      throw new DomainError("forbidden");
    const status = before.statuses.find((s) => s.category === "open");
    if (!status) throw new DomainError("invalid");
    const [existing] = await tx
      .select()
      .from(s.recurringRuns)
      .where(
        and(
          eq(s.recurringRuns.recurringId, id),
          eq(s.recurringRuns.scheduledFor, rule.nextDate),
        ),
      );
    let next = before;
    const ids = new Map<string, string>();
    if (!existing) {
      const source = rule.definition.tasks,
        reference =
          source[0].startDate ??
          source[0].dueDate ??
          rule.definition.anchorDate;
      for (const t of source) {
        next = applyCommand(next, {
          type: "task.create",
          data: {
            title: t.title,
            description: t.description,
            projectId: rule.projectId,
            statusId: status.id,
            priority: t.priority,
            assigneeId: t.assigneeId,
            assigneeIds: t.assigneeIds ?? [],
            startDate: t.startDate
              ? addDays(rule.nextDate, daysBetween(reference, t.startDate))
              : rule.nextDate,
            dueDate: t.dueDate
              ? addDays(rule.nextDate, daysBetween(reference, t.dueDate))
              : null,
            estimatedHours: t.estimatedHours,
            parentId: null,
            dependencyIds: [],
            tags: t.tags,
            checklist: t.checklist.map((c) => ({
              id: crypto.randomUUID(),
              text: c.text,
              done: false,
            })),
            taskType: t.taskType ?? "task",
          },
        });
        ids.set(t.id, next.tasks.at(-1)!.id);
      }
      for (const t of source) {
        const task = next.tasks.find((n) => n.id === ids.get(t.id))!;
        next = applyCommand(next, {
          type: "task.update",
          id: task.id,
          version: task.version,
          data: {
            parentId: t.parentId ? (ids.get(t.parentId) ?? null) : null,
            dependencyIds: t.dependencyIds.flatMap((id) =>
              ids.has(id) ? [ids.get(id)!] : [],
            ),
          },
        });
      }
      await saveWorkspace(tx, next, before);
      await notifyChanges(tx, before, next);
      await tx.insert(s.recurringRuns).values({
        id: crypto.randomUUID(),
        workspaceId: rule.workspaceId,
        recurringId: id,
        scheduledFor: rule.nextDate,
        taskIds: [...ids.values()],
      });
      await tx.insert(s.auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: rule.workspaceId,
        actorId: rule.createdBy,
        action: "recurrence.generated",
        entityId: id,
        detail: { scheduledFor: rule.nextDate, taskIds: [...ids.values()] },
      });
      await tx
        .update(s.workspaces)
        .set({ version: sql`${s.workspaces.version}+1` })
        .where(eq(s.workspaces.id, rule.workspaceId));
    }
    const nextDate = nextOccurrence(rule.definition, rule.nextDate);
    await tx
      .update(s.recurringTasks)
      .set({
        nextDate,
        lastError: null,
        enabled:
          !rule.definition.endDate || nextDate <= rule.definition.endDate,
      })
      .where(eq(s.recurringTasks.id, id));
    return !existing;
  });
}
