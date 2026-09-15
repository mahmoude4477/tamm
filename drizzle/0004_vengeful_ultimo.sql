CREATE TABLE "capacity" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"week_start" text NOT NULL,
	"hours" double precision NOT NULL,
	CONSTRAINT "capacity_week" UNIQUE("workspace_id","user_id","week_start"),
	CONSTRAINT "capacity_hours_range" CHECK ("capacity"."hours" >= 0 and "capacity"."hours" <= 168)
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_task" (
	"workspace_id" text NOT NULL,
	"milestone_id" text NOT NULL,
	"task_id" text NOT NULL,
	CONSTRAINT "milestone_task_unique" UNIQUE("workspace_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"due_date" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "milestone_scope" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "recurring_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"recurring_id" text NOT NULL,
	"scheduled_for" text NOT NULL,
	"task_ids" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_occurrence" UNIQUE("recurring_id","scheduled_for")
);
--> statement-breakpoint
CREATE TABLE "recurring_task" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"definition" jsonb NOT NULL,
	"next_date" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_scope" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "emailed_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "email_retry_at" timestamp;--> statement-breakpoint
ALTER TABLE "capacity" ADD CONSTRAINT "capacity_workspace_id_user_id_membership_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_task" ADD CONSTRAINT "milestone_task_workspace_id_milestone_id_milestone_workspace_id_id_fk" FOREIGN KEY ("workspace_id","milestone_id") REFERENCES "public"."milestone"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_task" ADD CONSTRAINT "milestone_task_workspace_id_task_id_task_workspace_id_id_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."task"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_workspace_id_project_id_project_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_run" ADD CONSTRAINT "recurring_run_workspace_id_recurring_id_recurring_task_workspace_id_id_fk" FOREIGN KEY ("workspace_id","recurring_id") REFERENCES "public"."recurring_task"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_task" ADD CONSTRAINT "recurring_task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_task" ADD CONSTRAINT "recurring_task_workspace_id_project_id_project_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_due" ON "recurring_task" USING btree ("enabled","next_date");