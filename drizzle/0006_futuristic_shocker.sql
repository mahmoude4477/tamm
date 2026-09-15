CREATE TABLE "assistant_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assistant_daily" UNIQUE("workspace_id","user_id","day")
);
--> statement-breakpoint
CREATE TABLE "custom_field" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "custom_field_scope" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "custom_value" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value" jsonb,
	CONSTRAINT "custom_value_task_field" UNIQUE("task_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "integration_key" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"project_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "integration_key_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"minutes" double precision,
	"note" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "time_valid" CHECK (("time_entry"."ended_at" is null and "time_entry"."minutes" is null) or ("time_entry"."ended_at" >= "time_entry"."started_at" and "time_entry"."minutes" >= 0 and "time_entry"."minutes" <= 1440))
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_status" integer,
	CONSTRAINT "webhook_event" UNIQUE("endpoint_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"project_id" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_scope" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_workspace_id_user_id_membership_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field" ADD CONSTRAINT "custom_field_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field" ADD CONSTRAINT "custom_field_workspace_id_project_id_project_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_value" ADD CONSTRAINT "custom_value_workspace_id_task_id_task_workspace_id_id_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."task"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_value" ADD CONSTRAINT "custom_value_workspace_id_field_id_custom_field_workspace_id_id_fk" FOREIGN KEY ("workspace_id","field_id") REFERENCES "public"."custom_field"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_key" ADD CONSTRAINT "integration_key_workspace_id_user_id_membership_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_key" ADD CONSTRAINT "integration_key_workspace_id_project_id_project_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_workspace_id_task_id_task_workspace_id_id_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."task"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_workspace_id_user_id_membership_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_workspace_id_endpoint_id_webhook_endpoint_workspace_id_id_fk" FOREIGN KEY ("workspace_id","endpoint_id") REFERENCES "public"."webhook_endpoint"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_workspace_id_user_id_membership_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_workspace_id_project_id_project_workspace_id_id_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."project"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_field_workspace" ON "custom_field" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "custom_value_workspace" ON "custom_value" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "integration_key_workspace" ON "integration_key" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_running_timer" ON "time_entry" USING btree ("workspace_id","user_id") WHERE "time_entry"."ended_at" is null and "time_entry"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "time_report" ON "time_entry" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "webhook_pending" ON "webhook_delivery" USING btree ("next_at") WHERE "webhook_delivery"."delivered_at" is null and "webhook_delivery"."attempts"<5;--> statement-breakpoint
CREATE INDEX "webhook_workspace" ON "webhook_endpoint" USING btree ("workspace_id");