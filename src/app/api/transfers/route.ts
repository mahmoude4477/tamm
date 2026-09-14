import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { transferRequests, auditLogs } from "@/db/schema";
import { saveWorkspace } from "@/db/workspace";
import {
  apiError,
  checkOrigin,
  workspaceContext,
  lockedWorkspace,
} from "@/lib/server-context";
import { applyCommand, DomainError } from "@/lib/commands";
import { can, canEditTask, canSeeProject } from "@/lib/permissions";
import { notifyChanges } from "@/lib/notifications";
export async function GET(request: Request) {
  try {
    const { workspace: w, actor } = await workspaceContext(request);
    const items = await db
      .select()
      .from(transferRequests)
      .where(
        and(
          eq(transferRequests.workspaceId, w.id),
          eq(transferRequests.status, "pending"),
          can(actor.role, "task.assign", actor.permissions)
            ? undefined
            : eq(transferRequests.requestedBy, actor.id),
        ),
      )
      .orderBy(desc(transferRequests.createdAt))
      .limit(100);
    return Response.json(
      {
        items: items.filter((r) =>
          w.tasks.some(
            (t) =>
              t.id === r.taskId &&
              !t.deletedAt &&
              canSeeProject(w, t.projectId),
          ),
        ),
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
    const { workspace: w } = await workspaceContext(request);
    const body = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("request"),
          taskId: z.string(),
          toId: z.string(),
          reason: z.string().trim().min(1).max(2000),
        }),
        z.object({
          type: z.literal("review"),
          id: z.string(),
          approve: z.boolean(),
        }),
      ])
      .parse(await request.json());
    await db.transaction(async (tx) => {
      const current = await lockedWorkspace(tx, w.id, w.currentUserId),
        actor = current.members.find((m) => m.id === w.currentUserId)!;
      if (body.type === "request") {
        const task = current.tasks.find(
            (t) => t.id === body.taskId && !t.deletedAt,
          ),
          target = current.members.find(
            (m) => m.id === body.toId && m.active !== false,
          );
        if (
          !task ||
          !target ||
          task.assigneeId !== actor.id ||
          !canEditTask(current, task) ||
          !canSeeProject(
            { ...current, currentUserId: target.id },
            task.projectId,
          ) ||
          current.settings?.transferPolicy !== "approval"
        )
          throw new DomainError("forbidden");
        const [pending] = await tx
          .select()
          .from(transferRequests)
          .where(
            and(
              eq(transferRequests.workspaceId, w.id),
              eq(transferRequests.taskId, task.id),
              eq(transferRequests.status, "pending"),
            ),
          );
        if (pending) throw new DomainError("conflict");
        await tx.insert(transferRequests).values({
          id: crypto.randomUUID(),
          workspaceId: w.id,
          taskId: task.id,
          requestedBy: actor.id,
          fromId: task.assigneeId,
          toId: target.id,
          reason: body.reason,
        });
      } else {
        if (!can(actor.role, "task.assign", actor.permissions))
          throw new DomainError("forbidden");
        const [pending] = await tx
          .select()
          .from(transferRequests)
          .where(
            and(
              eq(transferRequests.id, body.id),
              eq(transferRequests.workspaceId, w.id),
              eq(transferRequests.status, "pending"),
            ),
          );
        if (!pending) throw new DomainError("conflict");
        const task = current.tasks.find(
          (t) => t.id === pending.taskId && !t.deletedAt,
        );
        if (!task || !canSeeProject(current, task.projectId))
          throw new DomainError("forbidden");
        if (body.approve) {
          if (task.assigneeId !== pending.fromId)
            throw new DomainError("conflict");
          const next = applyCommand(current, {
            type: "task.update",
            id: task.id,
            version: task.version,
            data: { assigneeId: pending.toId },
            reason: pending.reason,
          });
          await saveWorkspace(tx, next, current);
          await notifyChanges(tx, current, next);
        }
        await tx
          .update(transferRequests)
          .set({
            status: body.approve ? "approved" : "rejected",
            reviewerId: actor.id,
          })
          .where(eq(transferRequests.id, body.id));
      }
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: w.id,
        actorId: actor.id,
        action: `transfer.${body.type}`,
        entityId: "id" in body ? body.id : body.taskId,
        detail: body,
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
