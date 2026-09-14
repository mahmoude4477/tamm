import "server-only";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Workspace } from "@/lib/types";
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function loadWorkspace(
  tx: Transaction,
  workspaceId: string,
  currentUserId: string,
): Promise<Workspace> {
  const [row] = await tx
    .select()
    .from(s.workspaces)
    .where(eq(s.workspaces.id, workspaceId));
  const memberRows = await tx
    .select({
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      role: s.memberships.role,
      teamId: s.memberships.teamId,
    })
    .from(s.memberships)
    .innerJoin(s.user, eq(s.user.id, s.memberships.userId))
    .where(eq(s.memberships.workspaceId, workspaceId));
  const projects = await tx
    .select()
    .from(s.projects)
    .where(eq(s.projects.workspaceId, workspaceId));
  const projectMembers = await tx
    .select()
    .from(s.projectMembers)
    .where(eq(s.projectMembers.workspaceId, workspaceId));
  const tasks = await tx
    .select()
    .from(s.tasks)
    .where(eq(s.tasks.workspaceId, workspaceId));
  const deps = await tx
    .select()
    .from(s.taskDependencies)
    .where(eq(s.taskDependencies.workspaceId, workspaceId));
  return {
    id: row.id,
    name: row.name,
    currentUserId,
    members: memberRows,
    projects: projects.map(({ workspaceId: _, ...p }) => ({
      ...p,
      memberIds: projectMembers
        .filter((m) => m.projectId === p.id)
        .map((m) => m.userId),
    })),
    tasks: tasks.map(({ workspaceId: _, ...t }) => ({
      ...t,
      dependencyIds: deps
        .filter((d) => d.taskId === t.id)
        .map((d) => d.dependsOnId),
    })),
    statuses: await tx
      .select({
        id: s.statuses.id,
        name: s.statuses.name,
        color: s.statuses.color,
        category: s.statuses.category,
      })
      .from(s.statuses)
      .where(eq(s.statuses.workspaceId, workspaceId))
      .orderBy(asc(s.statuses.position)),
    teams: await tx
      .select({
        id: s.teams.id,
        name: s.teams.name,
        departmentId: s.teams.departmentId,
      })
      .from(s.teams)
      .where(eq(s.teams.workspaceId, workspaceId)),
    departments: await tx
      .select({ id: s.departments.id, name: s.departments.name })
      .from(s.departments)
      .where(eq(s.departments.workspaceId, workspaceId)),
    events: await tx
      .select({
        id: s.activityEvents.id,
        taskId: s.activityEvents.taskId,
        actorId: s.activityEvents.actorId,
        action: s.activityEvents.action,
        text: s.activityEvents.text,
        createdAt: s.activityEvents.createdAt,
        previousAssigneeId: s.activityEvents.previousAssigneeId,
        newAssigneeId: s.activityEvents.newAssigneeId,
      })
      .from(s.activityEvents)
      .where(eq(s.activityEvents.workspaceId, workspaceId))
      .orderBy(asc(s.activityEvents.createdAt)),
  };
}
// Commands run under a workspace row lock. Only changed rows are written.
export async function saveWorkspace(
  tx: Transaction,
  next: Workspace,
  previous?: Workspace,
) {
  const workspaceId = next.id;
  const changed = <T extends { id: string }>(items: T[], before?: T[]) =>
    items.filter(
      (item) =>
        JSON.stringify(item) !==
        JSON.stringify(before?.find((p) => p.id === item.id)),
    );
  for (const d of changed(next.departments, previous?.departments))
    await tx
      .insert(s.departments)
      .values({ ...d, workspaceId })
      .onConflictDoUpdate({ target: s.departments.id, set: { name: d.name } });
  for (const t of changed(next.teams, previous?.teams))
    await tx
      .insert(s.teams)
      .values({ ...t, workspaceId })
      .onConflictDoUpdate({
        target: s.teams.id,
        set: { name: t.name, departmentId: t.departmentId },
      });
  for (const m of changed(next.members, previous?.members))
    await tx
      .update(s.memberships)
      .set({ role: m.role, teamId: m.teamId })
      .where(
        and(
          eq(s.memberships.workspaceId, workspaceId),
          eq(s.memberships.userId, m.id),
        ),
      );
  for (const status of changed(next.statuses, previous?.statuses))
    await tx
      .insert(s.statuses)
      .values({
        ...status,
        workspaceId,
        position: next.statuses.findIndex((x) => x.id === status.id),
      })
      .onConflictDoUpdate({
        target: s.statuses.id,
        set: {
          name: status.name,
          color: status.color,
          category: status.category,
        },
      });
  for (const p of changed(next.projects, previous?.projects)) {
    const { memberIds, ...record } = p;
    await tx
      .insert(s.projects)
      .values({ ...record, workspaceId })
      .onConflictDoUpdate({ target: s.projects.id, set: record });
    await tx
      .delete(s.projectMembers)
      .where(
        and(
          eq(s.projectMembers.workspaceId, workspaceId),
          eq(s.projectMembers.projectId, p.id),
        ),
      );
    if (memberIds.length)
      await tx
        .insert(s.projectMembers)
        .values(
          memberIds.map((userId) => ({ workspaceId, projectId: p.id, userId })),
        );
  }
  const updates = changed(next.tasks, previous?.tasks);
  for (const t of updates) {
    const { dependencyIds, parentId, ...record } = t;
    await tx
      .insert(s.tasks)
      .values({ ...record, workspaceId, parentId: null })
      .onConflictDoUpdate({ target: s.tasks.id, set: record });
  }
  for (const t of updates) {
    await tx
      .update(s.tasks)
      .set({ parentId: t.parentId })
      .where(eq(s.tasks.id, t.id));
    await tx
      .delete(s.taskDependencies)
      .where(
        and(
          eq(s.taskDependencies.workspaceId, workspaceId),
          eq(s.taskDependencies.taskId, t.id),
        ),
      );
    if (t.dependencyIds.length)
      await tx
        .insert(s.taskDependencies)
        .values(
          t.dependencyIds.map((dependsOnId) => ({
            workspaceId,
            taskId: t.id,
            dependsOnId,
          })),
        );
  }
  const events = changed(next.events, previous?.events);
  if (events.length)
    await tx
      .insert(s.activityEvents)
      .values(events.map((e) => ({ ...e, workspaceId })))
      .onConflictDoNothing();
}
