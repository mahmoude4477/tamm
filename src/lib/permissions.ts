import type { Role, Task, Workspace } from './types';
export type Permission = 'task.create' | 'task.edit' | 'task.assign' | 'task.review' | 'task.delete' | 'project.manage' | 'report.view' | 'user.manage' | 'workflow.manage';
const all: Permission[] = ['task.create','task.edit','task.assign','task.review','task.delete','project.manage','report.view','user.manage','workflow.manage'];
const grants: Record<Role, readonly Permission[]> = { owner: all, admin: all, manager: all.filter(p => p !== 'user.manage'), member: ['task.create','task.edit'], viewer: [] };
export function can(role: Role, permission: Permission) { return grants[role]?.includes(permission) ?? false; }
export function canSeeProject(workspace: Workspace, projectId: string) { const project = workspace.projects.find(p => p.id === projectId); const person = workspace.members.find(p => p.id === workspace.currentUserId); return !!project && !!person && (project.visibility === 'organization' || ['owner','admin'].includes(person.role) || project.memberIds.includes(person.id)); }
export function canEditTask(workspace: Workspace, task: Task) { const person = workspace.members.find(p => p.id === workspace.currentUserId); return !!person && canSeeProject(workspace, task.projectId) && can(person.role, 'task.edit') && (can(person.role, 'task.assign') || task.assigneeId === person.id || task.reporterId === person.id); }
