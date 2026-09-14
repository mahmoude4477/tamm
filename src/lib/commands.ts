import { z } from "zod";
import { can, canEditTask, canSeeProject } from "./permissions";
import type { Workspace, Task, Event } from "./types";
const id = z.string().min(1).max(100);
const label = z.string().trim().min(1).max(200);
const date = z.iso.date().nullable();
const taskFields = z.object({
  title: label,
  description: z.string().max(20000),
  projectId: id,
  statusId: id,
  priority: z.enum(["urgent", "high", "medium", "low"]),
  assigneeId: id.nullable(),
  dueDate: date,
  startDate: date,
  estimatedHours: z.number().min(0).max(10000),
  parentId: id.nullable(),
  dependencyIds: z.array(id).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  checklist: z.array(z.object({ id, text: label, done: z.boolean() })).max(100),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.create"), data: taskFields }),
  z.object({
    type: z.literal("task.update"),
    id,
    version: z.number().int(),
    data: taskFields.partial(),
    reason: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal("task.review"),
    id,
    version: z.number().int(),
    approve: z.boolean(),
    comment: z.string().trim().max(2000),
  }),
  z.object({
    type: z.literal("task.comment"),
    id,
    text: z.string().trim().min(1).max(10000),
  }),
  z.object({ type: z.literal("task.archive"), id, archived: z.boolean() }),
  z.object({ type: z.literal("task.delete"), id }),
  z.object({ type: z.literal("task.restore"), id }),
  z.object({
    type: z.literal("project.create"),
    data: z.object({
      name: label,
      code: z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/),
      description: z.string().max(5000),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      visibility: z.enum(["organization", "private"]),
      memberIds: z.array(id).max(500),
    }),
  }),
  z.object({ type: z.literal("project.archive"), id, archived: z.boolean() }),
  z.object({
    type: z.literal("workflow.create"),
    name: label,
    category: z.enum(["open", "active", "review", "done", "cancelled"]),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  z.object({
    type: z.literal("team.create"),
    name: label,
    departmentId: id.nullable(),
  }),
  z.object({ type: z.literal("department.create"), name: label }),
  z.object({
    type: z.literal("member.update"),
    id,
    role: z.enum(["owner", "admin", "manager", "member", "viewer"]),
    teamId: id.nullable(),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export class DomainError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new DomainError(code);
}
export function applyCommand(
  source: Workspace,
  command: Command,
  now = new Date().toISOString(),
  uuid = () => crypto.randomUUID(),
): Workspace {
  const w = structuredClone(source);
  const actor = w.members.find((m) => m.id === w.currentUserId);
  if (!actor) fail("session");
  const requirePermission = (p: Parameters<typeof can>[1]) => {
    if (!can(actor.role, p)) fail("forbidden");
  };
  const emit = (
    action: string,
    taskId: string | null,
    text = "",
    extra: Partial<Event> = {},
  ) =>
    w.events.push({
      id: uuid(),
      actorId: actor.id,
      taskId,
      action,
      text,
      createdAt: now,
      ...extra,
    });
  const findTask = (taskId: string) => {
    const task = w.tasks.find((t) => t.id === taskId);
    if (!task || !canSeeProject(w, task.projectId)) fail("notFound");
    return task;
  };
  const checkTask = (t: Task) => {
    if (
      !canSeeProject(w, t.projectId) ||
      w.projects.find((p) => p.id === t.projectId)?.archived
    )
      fail("project");
    if (!w.statuses.some((s) => s.id === t.statusId)) fail("status");
    if (t.assigneeId && !w.members.some((m) => m.id === t.assigneeId))
      fail("member");
    if (t.startDate && t.dueDate && t.startDate > t.dueDate) fail("invalid");
    const project = w.projects.find((p) => p.id === t.projectId)!;
    if (
      project.visibility === "private" &&
      t.assigneeId &&
      !project.memberIds.includes(t.assigneeId) &&
      !w.members.some(
        (m) => m.id === t.assigneeId && ["owner", "admin"].includes(m.role),
      )
    )
      fail("member");
    const walk = (current: string, seen: Set<string>) => {
      if (current === t.id) fail("cycle");
      if (seen.has(current)) return;
      seen.add(current);
      const dep = findTask(current);
      dep.dependencyIds.forEach((d) => walk(d, seen));
    };
    t.dependencyIds.forEach((d) => walk(d, new Set()));
    let parent = t.parentId;
    const visited = new Set([t.id]);
    while (parent) {
      if (visited.has(parent)) fail("cycle");
      visited.add(parent);
      const p = findTask(parent);
      if (p.projectId !== t.projectId || p.deletedAt) fail("invalid");
      parent = p.parentId;
    }
    if (w.statuses.find((s) => s.id === t.statusId)?.category === "done") {
      const blockers = [
        ...t.dependencyIds.map(findTask),
        ...w.tasks.filter((x) => x.parentId === t.id && !x.deletedAt),
      ];
      if (
        blockers.some(
          (x) =>
            w.statuses.find((s) => s.id === x.statusId)?.category !== "done",
        ) ||
        t.checklist.some((x) => !x.done)
      )
        fail("dependency");
    }
  };
  if (command.type === "task.create") {
    requirePermission("task.create");
    if (command.data.assigneeId && command.data.assigneeId !== actor.id)
      requirePermission("task.assign");
    const t: Task = {
      ...command.data,
      id: uuid(),
      number: Math.max(0, ...w.tasks.map((t) => t.number)) + 1,
      reporterId: actor.id,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archived: false,
      deletedAt: null,
      version: 0,
    };
    if (w.statuses.find((s) => s.id === t.statusId)?.category === "done")
      fail("review");
    checkTask(t);
    w.tasks.push(t);
    emit("task.created", t.id);
  } else if (command.type.startsWith("task.")) {
    const cmd = command as Exclude<Command, { type: "task.create" }> & {
      id: string;
    };
    const t = findTask(cmd.id);
    if (command.type !== "task.restore" && t.deletedAt) fail("notFound");
    if (!canEditTask(w, t)) fail("forbidden");
    if (command.type === "task.update") {
      if (t.version !== command.version) fail("conflict");
      const next = { ...t, ...command.data };
      const isTransfer = next.assigneeId !== t.assigneeId;
      if (isTransfer) {
        if (!can(actor.role, "task.assign")) {
          const target = w.members.find((m) => m.id === next.assigneeId);
          if (
            t.assigneeId !== actor.id ||
            !actor.teamId ||
            target?.teamId !== actor.teamId
          )
            fail("forbidden");
        }
        if (!command.reason) fail("reason");
      }
      if (next.projectId !== t.projectId) requirePermission("project.manage");
      if (
        w.statuses.find((s) => s.id === next.statusId)?.category === "done" &&
        next.statusId !== t.statusId
      )
        fail("review");
      checkTask(next);
      const old = t.assigneeId;
      Object.assign(t, next, { updatedAt: now, version: t.version + 1 });
      if (w.statuses.find((s) => s.id === t.statusId)?.category !== "done")
        t.completedAt = null;
      emit(
        isTransfer ? "task.transferred" : "task.updated",
        t.id,
        command.reason ?? "",
        isTransfer
          ? { previousAssigneeId: old, newAssigneeId: t.assigneeId }
          : {},
      );
    }
    if (command.type === "task.review") {
      requirePermission("task.review");
      if (t.version !== command.version) fail("conflict");
      if (w.statuses.find((s) => s.id === t.statusId)?.category !== "review")
        fail("review");
      if (!command.approve && !command.comment) fail("reason");
      const s = w.statuses.find(
        (s) => s.category === (command.approve ? "done" : "active"),
      );
      if (!s) fail("status");
      const next = { ...t, statusId: s.id };
      checkTask(next);
      Object.assign(t, next, {
        completedAt: command.approve ? now : null,
        updatedAt: now,
        version: t.version + 1,
      });
      emit("task.reviewed", t.id, command.comment);
    }
    if (command.type === "task.comment") {
      emit("task.commented", t.id, command.text);
    }
    if (command.type === "task.archive") {
      requirePermission("task.delete");
      t.archived = command.archived;
      t.version++;
      emit("task.updated", t.id);
    }
    if (command.type === "task.delete") {
      requirePermission("task.delete");
      if (
        w.tasks.some(
          (x) =>
            !x.deletedAt &&
            (x.parentId === t.id || x.dependencyIds.includes(t.id)),
        )
      )
        fail("dependency");
      t.deletedAt = now;
      t.version++;
      emit("task.deleted", t.id);
    }
    if (command.type === "task.restore") {
      requirePermission("task.delete");
      t.deletedAt = null;
      t.version++;
      emit("task.restored", t.id);
    }
  } else if (command.type === "project.create") {
    requirePermission("project.manage");
    if (w.projects.some((p) => p.code === command.data.code)) fail("invalid");
    if (
      command.data.memberIds.some((id) => !w.members.some((m) => m.id === id))
    )
      fail("member");
    w.projects.push({
      ...command.data,
      id: uuid(),
      archived: false,
      memberIds: [...new Set([...command.data.memberIds, actor.id])],
    });
    emit("project.created", null, command.data.name);
  } else if (command.type === "project.archive") {
    requirePermission("project.manage");
    if (!canSeeProject(w, command.id)) fail("notFound");
    w.projects.find((p) => p.id === command.id)!.archived = command.archived;
    emit("project.updated", null);
  } else if (command.type === "workflow.create") {
    requirePermission("workflow.manage");
    w.statuses.push({
      id: uuid(),
      name: command.name,
      category: command.category,
      color: command.color,
    });
    emit("workflow.created", null, command.name);
  } else if (command.type === "team.create") {
    requirePermission("user.manage");
    if (
      command.departmentId &&
      !w.departments.some((d) => d.id === command.departmentId)
    )
      fail("invalid");
    w.teams.push({
      id: uuid(),
      name: command.name,
      departmentId: command.departmentId,
    });
    emit("team.created", null, command.name);
  } else if (command.type === "department.create") {
    requirePermission("user.manage");
    w.departments.push({ id: uuid(), name: command.name });
    emit("department.created", null, command.name);
  } else if (command.type === "member.update") {
    requirePermission("user.manage");
    const member = w.members.find((m) => m.id === command.id);
    if (!member) fail("member");
    if (
      actor.role !== "owner" &&
      (member.role === "owner" || command.role === "owner")
    )
      fail("forbidden");
    if (
      member.role === "owner" &&
      command.role !== "owner" &&
      w.members.filter((m) => m.role === "owner").length === 1
    )
      fail("owner");
    if (command.teamId && !w.teams.some((t) => t.id === command.teamId))
      fail("invalid");
    Object.assign(member, { role: command.role, teamId: command.teamId });
    emit("member.updated", null, member.name);
  }
  return w;
}
export function visibleWorkspace(w: Workspace): Workspace {
  const projects = w.projects.filter((p) => canSeeProject(w, p.id));
  const tasks = w.tasks.filter((t) =>
    projects.some((p) => p.id === t.projectId),
  );
  return {
    ...w,
    projects,
    tasks,
    events: w.events.filter((e) =>
      e.taskId
        ? tasks.some((t) => t.id === e.taskId)
        : can(
            w.members.find((m) => m.id === w.currentUserId)!.role,
            "user.manage",
          ),
    ),
  };
}
