import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { taskTemplates, auditLogs } from "@/db/schema";
import { saveWorkspace } from "@/db/workspace";
import {
  workspaceContext,
  checkOrigin,
  apiError,
  lockedWorkspace,
} from "@/lib/server-context";
import {
  applyCommand,
  commandSchema,
  DomainError,
  visibleWorkspace,
} from "@/lib/commands";
import { can, canSeeProject } from "@/lib/permissions";
import type { Task } from "@/lib/types";
function templateTask(t: Task) {
  return {
    title: t.title,
    description: t.description,
    priority: t.priority,
    estimatedHours: t.estimatedHours,
    tags: t.tags,
    checklist: t.checklist.map((c) => ({ ...c, done: false })),
    taskType: t.taskType,
  };
}
export async function GET(request: Request) {
  try {
    const { workspace: w } = await workspaceContext(request);
    return Response.json(
      {
        items: await db
          .select()
          .from(taskTemplates)
          .where(eq(taskTemplates.workspaceId, w.id)),
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
          type: z.literal("save"),
          name: z.string().trim().min(1).max(100),
          taskId: z.string().optional(),
          projectId: z.string().optional(),
        }),
        z.object({
          type: z.literal("apply"),
          id: z.string(),
          projectId: z.string().optional(),
          name: z.string().max(100).optional(),
          code: z
            .string()
            .regex(/^[A-Z][A-Z0-9]{1,7}$/)
            .optional(),
        }),
        z.object({ type: z.literal("delete"), id: z.string() }),
      ])
      .parse(await request.json());
    const result = await db.transaction(async (tx) => {
      const current = await lockedWorkspace(tx, w.id, w.currentUserId);
      const actor = current.members.find((m) => m.id === w.currentUserId)!;
      if (body.type === "save") {
        if (!can(actor.role, "project.manage", actor.permissions))
          throw new DomainError("forbidden");
        const task = current.tasks.find(
          (t) => t.id === body.taskId && !t.deletedAt,
        );
        const project = current.projects.find(
          (p) => p.id === (task?.projectId ?? body.projectId) && !p.deletedAt,
        );
        if (
          !project ||
          !canSeeProject(current, project.id) ||
          project.visibility === "private"
        )
          throw new DomainError("forbidden");
        const data = task
          ? { kind: "task", tasks: [templateTask(task)] }
          : {
              kind: "project",
              tasks: current.tasks
                .filter(
                  (t) =>
                    t.projectId === project.id && !t.deletedAt && !t.archived,
                )
                .map(templateTask),
              description: project.description,
              color: project.color,
            };
        await tx.insert(taskTemplates).values({
          id: crypto.randomUUID(),
          workspaceId: w.id,
          name: body.name,
          data,
        });
      } else {
        const [template] = await tx
          .select()
          .from(taskTemplates)
          .where(
            and(
              eq(taskTemplates.id, body.id),
              eq(taskTemplates.workspaceId, w.id),
            ),
          );
        if (!template) throw new DomainError("notFound");
        if (body.type === "delete") {
          if (!can(actor.role, "project.manage", actor.permissions))
            throw new DomainError("forbidden");
          await tx
            .delete(taskTemplates)
            .where(eq(taskTemplates.id, template.id));
        } else {
          const data = z
            .object({
              kind: z.enum(["task", "project"]),
              tasks: z.array(z.unknown()).max(100),
              description: z.string().optional(),
              color: z.string().optional(),
            })
            .parse(template.data);
          let next = current,
            projectId = body.projectId;
          if (data.kind === "project") {
            next = applyCommand(
              next,
              commandSchema.parse({
                type: "project.create",
                data: {
                  name: body.name ?? template.name,
                  code: body.code,
                  description: data.description ?? "",
                  color: data.color ?? "#315643",
                  visibility: "organization",
                  memberIds: [actor.id],
                },
              }),
            );
            projectId = next.projects.at(-1)!.id;
          }
          if (!projectId) throw new DomainError("invalid");
          const statusId = next.statuses.find((s) => s.category === "open")?.id;
          for (const item of data.tasks) {
            const fields = z.record(z.string(), z.unknown()).parse(item);
            next = applyCommand(
              next,
              commandSchema.parse({
                type: "task.create",
                data: {
                  ...fields,
                  projectId,
                  statusId,
                  assigneeId: actor.id,
                  dueDate: null,
                  startDate: null,
                  parentId: null,
                  dependencyIds: [],
                  checklist: (fields.checklist as Task["checklist"]).map(
                    (c) => ({ ...c, id: crypto.randomUUID(), done: false }),
                  ),
                },
              }),
            );
          }
          await saveWorkspace(tx, next, current);
          return visibleWorkspace(next);
        }
      }
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: w.id,
        actorId: actor.id,
        action: `template.${body.type}`,
        entityId: "id" in body ? body.id : null,
        detail: body,
      });
      return null;
    });
    return Response.json({ workspace: result });
  } catch (e) {
    return apiError(e);
  }
}
