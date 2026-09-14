import type { Role, Task, Workspace } from "./types";
export type Permission =
  | "task.create"
  | "task.edit"
  | "task.assign"
  | "task.review"
  | "task.delete"
  | "project.manage"
  | "report.view"
  | "user.manage"
  | "workflow.manage"
  | "comment.create"
  | "file.upload";
export const permissionKeys = [
  "task.create",
  "task.edit",
  "task.assign",
  "task.review",
  "task.delete",
  "project.manage",
  "report.view",
  "user.manage",
  "workflow.manage",
  "comment.create",
  "file.upload",
] as const;
const all: Permission[] = [...permissionKeys];
const grants: Record<Role, readonly Permission[]> = {
  owner: all,
  admin: all,
  manager: all.filter((p) => p !== "user.manage"),
  member: ["task.create", "task.edit", "comment.create", "file.upload"],
  viewer: [],
};
export function can(role: Role, permission: Permission, overrides?: string[]) {
  if (role === "owner") return true;
  return overrides
    ? overrides.includes(permission)
    : (grants[role]?.includes(permission) ?? false);
}
export function canSeeProject(workspace: Workspace, projectId: string) {
  const project = workspace.projects.find((p) => p.id === projectId);
  const person = workspace.members.find(
    (p) => p.id === workspace.currentUserId,
  );
  return (
    !!project &&
    !!person &&
    person.active !== false &&
    (project.visibility === "organization" ||
      ["owner", "admin"].includes(person.role) ||
      project.memberIds.includes(person.id))
  );
}
export function canEditTask(workspace: Workspace, task: Task) {
  const person = workspace.members.find(
    (p) => p.id === workspace.currentUserId,
  );
  return (
    !!person &&
    canSeeProject(workspace, task.projectId) &&
    can(person.role, "task.edit", person.permissions) &&
    (can(person.role, "task.assign", person.permissions) ||
      task.assigneeId === person.id ||
      task.assigneeIds?.includes(person.id) ||
      task.reporterId === person.id)
  );
}
