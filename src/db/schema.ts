import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
  unique,
  doublePrecision,
} from "drizzle-orm/pg-core";
import type { Task, Status, Role } from "@/lib/types";
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
// Workspace writes take a row lock; domain relations also enforce workspace boundaries.
export const workspaces = pgTable("workspace", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const memberships = pgTable(
  "membership",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull().default("member"),
    teamId: text("team_id"),
  },
  (t) => [
    uniqueIndex("membership_unique").on(t.workspaceId, t.userId),
    index("membership_user").on(t.userId),
  ],
);
export const auditLogs = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_workspace_time").on(t.workspaceId, t.createdAt)],
);

export const departments = pgTable(
  "department",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
  },
  (t) => [unique("department_scope").on(t.workspaceId, t.id)],
);
export const teams = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    departmentId: text("department_id"),
  },
  (t) => [
    unique("team_scope").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.departmentId],
      foreignColumns: [departments.workspaceId, departments.id],
    }),
  ],
);
export const statuses = pgTable(
  "task_status",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    category: text("category").$type<Status["category"]>().notNull(),
    color: text("color").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [unique("status_scope").on(t.workspaceId, t.id)],
);
export const projects = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    description: text("description").notNull(),
    color: text("color").notNull(),
    archived: boolean("archived").notNull().default(false),
    visibility: text("visibility")
      .$type<"organization" | "private">()
      .notNull(),
  },
  (t) => [
    unique("project_scope").on(t.workspaceId, t.id),
    unique("project_code").on(t.workspaceId, t.code),
  ],
);
export const projectMembers = pgTable(
  "project_member",
  {
    workspaceId: text("workspace_id").notNull(),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [
    unique("project_member_unique").on(t.projectId, t.userId),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.userId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
    }),
  ],
);
export const tasks = pgTable(
  "task",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    projectId: text("project_id").notNull(),
    statusId: text("status_id").notNull(),
    priority: text("priority").$type<Task["priority"]>().notNull(),
    assigneeId: text("assignee_id"),
    reporterId: text("reporter_id").notNull(),
    dueDate: text("due_date"),
    startDate: text("start_date"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    estimatedHours: doublePrecision("estimated_hours").notNull().default(0),
    parentId: text("parent_id"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    checklist: jsonb("checklist")
      .$type<Task["checklist"]>()
      .notNull()
      .default([]),
    archived: boolean("archived").notNull().default(false),
    deletedAt: text("deleted_at"),
    version: integer("version").notNull().default(0),
  },
  (t) => [
    unique("task_scope").on(t.workspaceId, t.id),
    unique("task_number").on(t.workspaceId, t.number),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.statusId],
      foreignColumns: [statuses.workspaceId, statuses.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.assigneeId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
    }),
    foreignKey({
      columns: [t.workspaceId, t.reporterId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
    }),
    foreignKey({
      columns: [t.workspaceId, t.parentId],
      foreignColumns: [t.workspaceId, t.id],
    }),
    index("task_assignee").on(t.workspaceId, t.assigneeId),
    index("task_project").on(t.workspaceId, t.projectId),
  ],
);
export const taskDependencies = pgTable(
  "task_dependency",
  {
    workspaceId: text("workspace_id").notNull(),
    taskId: text("task_id").notNull(),
    dependsOnId: text("depends_on_id").notNull(),
  },
  (t) => [
    unique("dependency_unique").on(t.taskId, t.dependsOnId),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.dependsOnId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
  ],
);
export const activityEvents = pgTable(
  "activity_event",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    taskId: text("task_id"),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
    previousAssigneeId: text("previous_assignee_id"),
    newAssigneeId: text("new_assignee_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.actorId],
      foreignColumns: [memberships.workspaceId, memberships.userId],
    }),
    index("activity_workspace").on(t.workspaceId, t.createdAt),
  ],
);
