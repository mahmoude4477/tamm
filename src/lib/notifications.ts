import "server-only";
import { and, eq } from "drizzle-orm";
import type { Transaction } from "@/db/workspace";
import { notifications, notificationPreferences } from "@/db/schema";
import type { Workspace } from "./types";
import { can, canSeeProject } from "./permissions";
export const notificationKinds = [
  "assignment",
  "comment",
  "mention",
  "review",
  "status",
  "due",
  "overdue",
] as const;
export async function notifyChanges(
  tx: Transaction,
  before: Workspace,
  after: Workspace,
) {
  const preferences = await tx
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.workspaceId, after.id));
  for (const event of after.events.filter(
    (e) => !before.events.some((b) => b.id === e.id),
  )) {
    const task = after.tasks.find((t) => t.id === event.taskId);
    if (!task || task.deletedAt) continue;
    const kind =
      event.action === "task.commented"
        ? "comment"
        : event.action.includes("assign") ||
            event.action.includes("transferred") ||
            event.action === "task.created"
          ? "assignment"
          : event.action.includes("review") ||
              event.action.includes("approved") ||
              event.action.includes("rejected") ||
              event.action.includes("returned")
            ? "review"
            : "status";
    const recipients = new Set([
      task.assigneeId,
      ...(task.assigneeIds ?? []),
      ...(task.watcherIds ?? []),
      ...(event.mentionedIds ?? []),
    ]);
    if (
      after.statuses.find((s) => s.id === task.statusId)?.category === "review"
    )
      for (const m of after.members)
        if (can(m.role, "task.review", m.permissions)) recipients.add(m.id);
    for (const userId of recipients) {
      if (!userId || userId === event.actorId) continue;
      const m = after.members.find((m) => m.id === userId);
      if (
        !m ||
        m.active === false ||
        !canSeeProject({ ...after, currentUserId: userId }, task.projectId)
      )
        continue;
      const recipientKind = event.mentionedIds?.includes(userId)
        ? "mention"
        : kind;
      if (
        !(
          preferences.find((p) => p.userId === userId)?.enabledKinds ??
          notificationKinds
        ).includes(recipientKind)
      )
        continue;
      await tx
        .insert(notifications)
        .values({
          id: crypto.randomUUID(),
          workspaceId: after.id,
          userId,
          taskId: task.id,
          kind: recipientKind,
          actorName:
            after.members.find((m) => m.id === event.actorId)?.name ?? "",
          taskTitle: task.title,
          dedupeKey: `event:${event.id}:${userId}`,
        })
        .onConflictDoNothing();
    }
  }
}
export async function notifyDue(tx: Transaction, w: Workspace) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: w.settings?.timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dueSoon = new Date(`${date}T12:00:00Z`);
  dueSoon.setUTCDate(dueSoon.getUTCDate() + 3);
  const horizon = dueSoon.toISOString().slice(0, 10);
  const [prefs] = await tx
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.workspaceId, w.id),
        eq(notificationPreferences.userId, w.currentUserId),
      ),
    );
  for (const t of w.tasks) {
    if (
      t.deletedAt ||
      t.archived ||
      !t.dueDate ||
      t.dueDate > horizon ||
      ![t.assigneeId, ...(t.assigneeIds ?? [])].includes(w.currentUserId) ||
      ["done", "cancelled"].includes(
        w.statuses.find((s) => s.id === t.statusId)?.category ?? "",
      ) ||
      !canSeeProject(w, t.projectId)
    )
      continue;
    const kind = t.dueDate < date ? "overdue" : "due";
    if (!(prefs?.enabledKinds ?? notificationKinds).includes(kind)) continue;
    await tx
      .insert(notifications)
      .values({
        id: crypto.randomUUID(),
        workspaceId: w.id,
        userId: w.currentUserId,
        taskId: t.id,
        kind,
        actorName: "",
        taskTitle: t.title,
        dedupeKey: `${kind}:${t.id}:${t.dueDate}:${w.currentUserId}`,
      })
      .onConflictDoNothing();
  }
}
