CREATE INDEX "milestone_task_milestone" ON "milestone_task" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "milestone_project_due" ON "milestone" USING btree ("project_id","due_date");--> statement-breakpoint
CREATE INDEX "notification_email_pending" ON "notification" USING btree ("created_at","id") WHERE "notification"."emailed_at" is null and "notification"."email_attempts"<5;--> statement-breakpoint
CREATE INDEX "task_board_page" ON "task" USING btree ("workspace_id","status_id","due_date","id") WHERE "task"."deleted_at" is null and not "task"."archived";