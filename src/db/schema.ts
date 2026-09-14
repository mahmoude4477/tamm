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
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  banned: boolean("banned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  activeOrganizationId: text("active_organization_id"),
  activeTeamId: text("active_team_id"),
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
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  settings: jsonb("settings")
    .$type<import("@/lib/types").WorkspaceSettings>()
    .notNull()
    .default({
      transferPolicy: "team",
      timezone: "UTC",
      taskTypes: ["task", "bug", "request"],
    }),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
    jobTitle: text("job_title").notNull().default(""),
    customRoleId: text("custom_role_id"),
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
    managerId: text("manager_id"),
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
    managerId: text("manager_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
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
    allowedNextIds: jsonb("allowed_next_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
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
    ownerId: text("owner_id"),
    managerId: text("manager_id"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    priority: text("priority")
      .$type<Task["priority"]>()
      .notNull()
      .default("medium"),
    lifecycle: text("lifecycle")
      .$type<import("@/lib/types").Project["lifecycle"]>()
      .notNull()
      .default("planned"),
    deletedAt: text("deleted_at"),
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
    assigneeIds: jsonb("assignee_ids").$type<string[]>().notNull().default([]),
    watcherIds: jsonb("watcher_ids").$type<string[]>().notNull().default([]),
    relatedIds: jsonb("related_ids").$type<string[]>().notNull().default([]),
    duplicateOfId: text("duplicate_of_id"),
    taskType: text("task_type").notNull().default("task"),
    actualHours: doublePrecision("actual_hours").notNull().default(0),
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
    parentEventId: text("parent_event_id"),
    mentionedIds: jsonb("mentioned_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
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

export const teamMember = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("team_member_unique").on(t.teamId, t.userId)],
);
export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => workspaces.id),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id),
  teamId: text("team_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: timestamp("locked_until"),
});
export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at"),
  aaguid: text("aaguid"),
});
export const customRoles = pgTable(
  "custom_role",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  },
  (t) => [unique("custom_role_name").on(t.workspaceId, t.name)],
);
export const attachments = pgTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    taskId: text("task_id"),
    projectId: text("project_id"),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    mime: text("mime").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }),
    index("attachment_workspace").on(t.workspaceId),
  ],
);
export const notifications = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    taskId: text("task_id"),
    kind: text("kind").notNull(),
    actorName: text("actor_name").notNull(),
    taskTitle: text("task_title").notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    dedupeKey: text("dedupe_key").notNull().unique(),
  },
  (t) => [index("notification_inbox").on(t.workspaceId, t.userId, t.createdAt)],
);
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    enabledKinds: jsonb("enabled_kinds")
      .$type<string[]>()
      .notNull()
      .default([
        "assignment",
        "comment",
        "mention",
        "review",
        "status",
        "due",
        "overdue",
      ]),
  },
  (t) => [unique("notification_preference_user").on(t.workspaceId, t.userId)],
);
export const savedViews = pgTable("saved_view", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),
});
export const taskTemplates = pgTable("task_template", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
});
export const transferRequests = pgTable("transfer_request", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  requestedBy: text("requested_by")
    .notNull()
    .references(() => user.id),
  fromId: text("from_id"),
  toId: text("to_id")
    .notNull()
    .references(() => user.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewerId: text("reviewer_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
