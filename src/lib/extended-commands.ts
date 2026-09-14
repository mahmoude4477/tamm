import { z } from "zod";
import type { Workspace } from "./types";
import { can, permissionKeys } from "./permissions";
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(200),
  color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const extendedDefinitions = [
  z.object({
    type: z.literal("project.update"),
    id,
    data: z.object({
      name,
      description: z.string().max(5000),
      color,
      visibility: z.enum(["organization", "private"]),
      memberIds: z.array(id).max(500),
      ownerId: id.nullable(),
      managerId: id.nullable(),
      startDate: z.iso.date().nullable(),
      endDate: z.iso.date().nullable(),
      priority: z.enum(["urgent", "high", "medium", "low"]),
      lifecycle: z.enum(["planned", "active", "on_hold", "completed"]),
    }),
  }),
  z.object({
    type: z.literal("project.delete"),
    id,
    restore: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("workflow.update"),
    id,
    name,
    color,
    category: z.enum(["open", "active", "review", "done", "cancelled"]),
    allowedNextIds: z.array(id).max(50),
  }),
  z.object({
    type: z.literal("workflow.reorder"),
    ids: z.array(id).min(1).max(50),
  }),
  z.object({
    type: z.literal("team.update"),
    id,
    name,
    departmentId: id.nullable(),
    managerId: id.nullable(),
  }),
  z.object({
    type: z.literal("department.update"),
    id,
    name,
    managerId: id.nullable(),
  }),
  z.object({
    type: z.literal("role.save"),
    id: id.optional(),
    name,
    permissions: z.array(z.enum(permissionKeys)).max(20),
  }),
  z.object({
    type: z.literal("settings.update"),
    name,
    timezone: z.string().max(100),
    transferPolicy: z.enum(["team", "manager", "approval"]),
    taskTypes: z.array(name).min(1).max(30),
  }),
  z.object({
    type: z.literal("comment.edit"),
    id,
    text: z.string().trim().min(1).max(10000),
  }),
  z.object({ type: z.literal("comment.delete"), id }),
  z.object({ type: z.literal("task.follow"), id, following: z.boolean() }),
] as const;
export type ExtendedCommand = z.infer<(typeof extendedDefinitions)[number]>;
export function applyExtended(
  w: Workspace,
  c: ExtendedCommand,
  now: string,
  uuid: () => string,
): Workspace | null {
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  const allowed = (p: (typeof permissionKeys)[number]) =>
    can(actor.role, p, actor.permissions);
  function fail(code: string): never {
    throw Object.assign(new Error(code), { code, domain: true });
  }
  const requirePermission = (p: (typeof permissionKeys)[number]) => {
    if (!allowed(p)) fail("forbidden");
  };
  const validMember = (id: string | null) => {
    if (id && !w.members.some((m) => m.id === id && m.active !== false))
      fail("member");
  };
  const event = (action: string, text = "") =>
    w.events.push({
      id: uuid(),
      actorId: actor.id,
      taskId: null,
      action,
      text,
      createdAt: now,
    });
  switch (c.type) {
    case "project.update": {
      requirePermission("project.manage");
      const p = w.projects.find((p) => p.id === c.id);
      if (!p) fail("notFound");
      for (const id of [...c.data.memberIds, c.data.ownerId, c.data.managerId])
        validMember(id);
      if (
        c.data.startDate &&
        c.data.endDate &&
        c.data.startDate > c.data.endDate
      )
        fail("invalid");
      if (
        c.data.visibility === "private" &&
        w.tasks.some(
          (t) =>
            t.projectId === p.id &&
            !t.deletedAt &&
            [t.assigneeId, ...(t.assigneeIds ?? [])].some(
              (id) =>
                id &&
                !c.data.memberIds.includes(id) &&
                !w.members.some(
                  (m) => m.id === id && ["owner", "admin"].includes(m.role),
                ),
            ),
        )
      )
        fail("member");
      Object.assign(p, c.data);
      event("project.updated", p.name);
      break;
    }
    case "project.delete": {
      requirePermission("project.manage");
      const p = w.projects.find((p) => p.id === c.id);
      if (!p) fail("notFound");
      p.deletedAt = c.restore ? null : now;
      event("project.updated", p.name);
      break;
    }
    case "workflow.update": {
      requirePermission("workflow.manage");
      const s = w.statuses.find((s) => s.id === c.id);
      if (!s) fail("status");
      if (s.category !== c.category && w.tasks.some((t) => t.statusId === s.id))
        fail("statusInUse");
      if (c.allowedNextIds.some((id) => !w.statuses.some((s) => s.id === id)))
        fail("status");
      Object.assign(s, {
        name: c.name,
        color: c.color,
        category: c.category,
        allowedNextIds: c.allowedNextIds,
      });
      event("workflow.updated", c.name);
      break;
    }
    case "workflow.reorder": {
      requirePermission("workflow.manage");
      if (
        new Set(c.ids).size !== w.statuses.length ||
        c.ids.some((id) => !w.statuses.some((s) => s.id === id))
      )
        fail("invalid");
      w.statuses = c.ids.map((id) => w.statuses.find((s) => s.id === id)!);
      event("workflow.updated");
      break;
    }
    case "team.update": {
      requirePermission("user.manage");
      const t = w.teams.find((t) => t.id === c.id);
      if (!t) fail("notFound");
      validMember(c.managerId);
      if (c.departmentId && !w.departments.some((d) => d.id === c.departmentId))
        fail("invalid");
      Object.assign(t, {
        name: c.name,
        departmentId: c.departmentId,
        managerId: c.managerId,
      });
      event("team.updated", c.name);
      break;
    }
    case "department.update": {
      requirePermission("user.manage");
      const d = w.departments.find((d) => d.id === c.id);
      if (!d) fail("notFound");
      validMember(c.managerId);
      Object.assign(d, { name: c.name, managerId: c.managerId });
      event("department.updated", c.name);
      break;
    }
    case "role.save": {
      requirePermission("user.manage");
      if (actor.role !== "owner" && c.permissions.some((p) => !allowed(p)))
        fail("forbidden");
      const role = {
        id: c.id ?? uuid(),
        name: c.name,
        permissions: c.permissions,
      };
      w.customRoles ??= [];
      if (w.customRoles.some((r) => r.name === c.name && r.id !== role.id))
        fail("invalid");
      const i = w.customRoles.findIndex((r) => r.id === role.id);
      if (i < 0) w.customRoles.push(role);
      else w.customRoles[i] = role;
      for (const member of w.members.filter((m) => m.customRoleId === role.id))
        member.permissions = role.permissions;
      event("role.updated", c.name);
      break;
    }
    case "settings.update": {
      requirePermission("workflow.manage");
      try {
        new Intl.DateTimeFormat("en", { timeZone: c.timezone }).format();
      } catch {
        fail("invalid");
      }
      w.name = c.name;
      w.settings = {
        timezone: c.timezone,
        transferPolicy: c.transferPolicy,
        taskTypes: c.taskTypes,
      };
      event("settings.updated");
      break;
    }
    case "comment.edit":
    case "comment.delete": {
      const e = w.events.find(
        (e) => e.id === c.id && e.action === "task.commented",
      );
      if (!e || e.deletedAt) fail("notFound");
      if (e.actorId !== actor.id && !allowed("user.manage")) fail("forbidden");
      if (!e.taskId || !w.tasks.some((t) => t.id === e.taskId))
        fail("notFound");
      if (c.type === "comment.edit") {
        e.text = c.text;
        e.editedAt = now;
      } else {
        e.text = "";
        e.deletedAt = now;
      }
      break;
    }
    case "task.follow": {
      const t = w.tasks.find((t) => t.id === c.id);
      if (!t || t.deletedAt) fail("notFound");
      if (actor.role === "viewer") fail("forbidden");
      t.watcherIds = c.following
        ? [...new Set([...(t.watcherIds ?? []), actor.id])]
        : (t.watcherIds ?? []).filter((id) => id !== actor.id);
      t.version++;
      break;
    }
    default:
      return null;
  }
  return w;
}
