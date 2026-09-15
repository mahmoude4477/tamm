# Operating Tamm

Tamm runs as one Node.js application with PostgreSQL and a persistent upload directory. The application keeps workflow writes atomic within a workspace. Run the committed migrations before starting a new version.

## Configuration

Use Node.js 22 or later and PostgreSQL 16 or later. Copy `.env.example` to `.env.local` for local development. Generate `BETTER_AUTH_SECRET` locally; use a separate secret for each installation. Set `BETTER_AUTH_URL` to the exact external origin.

`ALLOW_REGISTRATION=true` enables account creation. `REQUIRE_EMAIL_VERIFICATION=true` requires users to verify their email before signing in. The first person to create a workspace becomes its owner; ownership of a workspace does not grant control over other workspaces.

For development, `MAIL_TRANSPORT=file` writes messages to `MAIL_DIRECTORY`. Open the link in the generated JSON message to exercise verification, recovery, and invitations. These files contain temporary account links and must remain outside the web root. File delivery is disabled in production unless `ALLOW_FILE_MAIL=true` is explicitly set for a test installation.

For production, set `MAIL_TRANSPORT=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, and the SMTP credentials required by your provider. Port 587 with `SMTP_SECURE=false` uses STARTTLS; port 465 normally uses `SMTP_SECURE=true`. TLS is required by default. Tamm never includes SMTP credentials in browser bundles.

Keep `UPLOAD_DIRECTORY` on a persistent, writable volume. Uploads are limited to 10 MiB and validated as PNG, JPEG, PDF, UTF-8 TXT, or CSV. Downloads require current workspace and project access. Image previews are served with restrictive headers; documents download as attachments. Upload storage is local to the application: multiple app replicas need a shared volume. There is no built-in antivirus service.

## Build and start

```bash
npm ci
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate
npm run build
npm start
```

The standalone deployment is also available:

```bash
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
node --env-file=.env.local .next/standalone/server.js
```

A Dockerfile packages the standalone server. Supply runtime environment variables and a persistent volume mounted at `/app/.data`; its contents must be writable by UID 1000. Apply migrations from a matching source checkout before starting the container. The image does not migrate a database automatically.

```bash
docker build -t tamm .
docker run --env-file .env.local --publish 3000:3000 \
  --mount source=tamm-data,target=/app/.data tamm
```

Inside Docker, `DATABASE_URL` must use a database hostname reachable from the container. `localhost` refers to the container itself. Put the app behind an HTTPS reverse proxy for production. The proxy should overwrite forwarded headers, set an upload-body limit just above 10 MiB, and forward the original host and protocol. Passkeys require HTTPS or localhost.

`GET /api/health` returns 200 when the database responds and 503 otherwise. It exposes no workspace data.

## Backup and restore

Back up PostgreSQL and the upload volume together. Pause application writes while taking a coordinated backup, or use database snapshots and an equivalent storage snapshot. Keep backups outside the repository.

```bash
pg_dump --format=custom --file=tamm.dump "$DATABASE_URL"
tar -czf tamm-uploads.tar.gz -C .data uploads
```

Restore to a new, empty database first. The target must be created by the database operator. Do not point the restore command at an existing production database.

```bash
pg_restore --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" tamm.dump
mkdir -p .data
tar -xzf tamm-uploads.tar.gz -C .data
```

Restore the original authentication secret separately so existing encrypted two-factor credentials remain usable. Use an isolated application origin for the restored installation. Verify `/api/health`, sign-in, project visibility, a task edit, a file download, an invitation, and a report export before switching traffic. Never run the destructive integration fixtures against a production database.

## Accounts and audit

Workspace owners and administrators can deactivate memberships in **Settings → Administration**. Deactivation preserves tasks, comments, assignments, and audit history. Users may still access other workspaces where their membership remains active.

A database operator can suspend an account across the installation. This revokes its sessions and prevents new sessions. The named operator is recorded in each affected workspace's audit log:

```bash
node --env-file=.env.local scripts/accounts.mjs suspend \
  --email user@example.com --actor operator@example.com
node --env-file=.env.local scripts/accounts.mjs activate \
  --email user@example.com --actor operator@example.com
```

Both addresses must identify existing accounts. This command requires database operator credentials; it is not exposed to workspace owners through the browser. Activation restores account access but does not recreate revoked sessions.

## Behavior and capacity

- The task table, audit log, and task search API use bounded server queries. The incremental board and delivery analytics use bounded queries and database aggregates. The original overview, dependency checks, and monthly reports still use a workspace snapshot. Benchmark the largest expected workspace before rollout.
- Workflow mutations serialize within one workspace to preserve dependency and approval rules. Independent workspaces have independent locks. Reads normally use a repeatable-read snapshot without a write lock.
- Notifications are stored in PostgreSQL. Assignment and discussion events generate notifications during the write transaction. The scheduled worker generates due-soon and overdue reminders idempotently and sends opted-in email notifications.
- Roles are workspace-wide. Department and team managers are recorded organizational assignments; they do not silently narrow a role's permissions. Custom roles control the application permission set. Better Auth invitation administration uses its owner/admin organization roles.
- Templates are shared with the workspace. Only organization-visible projects can be used as template sources; private project content cannot be published as a workspace template.
- Soft deletion preserves business records. Backup retention and eventual physical removal of deleted uploads are operator decisions.

## V1.5 scheduled work

Generate `JOBS_SECRET` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Use a separate value from the authentication secret. Set it on the application and worker, then run `npm run jobs` under your process supervisor. For cron or Windows Task Scheduler, run `npm run jobs -- --once` every minute. The HTTP worker endpoint is `/api/jobs`; it accepts POST with a bearer token and rejects browser sessions without that token. Restrict it to your internal network when possible. No Redis, RabbitMQ, Docker, or external scheduler service is required.

The worker runs serially per installation using a PostgreSQL advisory lock. Each invocation handles up to 20 due recurring definitions, one occurrence per definition, and up to 20 pending emails. Missed dates catch up across later invocations. Keep clocks synchronized. Schedules use their saved timezone; changing the workspace timezone does not silently change an existing schedule.

Recurring definitions capture a task and its subtasks, checklists, internal dependencies, estimates, and assignees. Each occurrence receives fresh IDs and starts in the first open status. Month-end dates clamp to the last day of shorter months without drifting from the original day. Generation and occurrence history commit atomically; the unique occurrence constraint prevents duplicate tasks after retries. Deleted/archived projects, inactive creators, revoked permissions, and invalid assignees pause generation with an error shown in Planning. Fix the cause before resuming. Changing the source task does not edit an existing schedule; pause it and create a new schedule when its template or cadence needs to change.

Inbox reminders are deduplicated per task, due date, notification kind, and recipient. Email is off by default and follows each member's selected notification kinds and explicit email opt-in. The worker rechecks active membership, account suspension, and project visibility before selecting email recipients. Failed email attempts retry with exponential delays, up to five attempts. SMTP delivery is at least once: a process crash between sending and recording success can deliver the same email again. Do not use notifications as an exactly-once integration mechanism. Inspect `job_run`, `recurring_task.last_error`, and notification retry columns when troubleshooting. After correcting email transport, an operator can reset failed `email_attempts` and `email_retry_at` for selected records; never expose this operation to ordinary members.

## Capacity and analytics

Planning uses ISO weeks beginning Monday. The default calendar is Monday–Friday; project managers can configure working days, including Sunday–Thursday. Default capacity is 40 hours per person per week. Weekly overrides represent leave, part-time work, or other availability; zero means no capacity. Remaining effort (`max(estimate − actual, 0)`) is divided equally between assignees and the scheduled working days. Overdue effort is allocated to the current week. Tasks without due dates and tasks without estimates are displayed separately, so they do not disappear inside a misleading utilization percentage.

Delivery analytics query PostgreSQL aggregates directly and honor project visibility and `report.view`. Cycle time is elapsed time from creation to completion. The median and 85th percentile describe the selected completed-task cohort; weekly throughput and on-time completion use workspace-local dates. Project health reflects overdue deadlines, incomplete overdue milestones, blocked dependencies, and progress relative to elapsed project time. Forecasts need at least three completions and extrapolate the selected period's completion rate; they are estimates, not commitments or employee scores.

`/board` loads workspace metadata first and requests 25 tasks per status. Each column has its own load-more control. Opening detailed editing or another snapshot-based view may load the complete workspace for dependency validation and existing V1 features. The original overview/monthly reporting screens and planning configuration are not fully incremental. Profile those views before operating exceptionally large workspaces.

## Optional upload scanning

Set `CLAMAV_HOST` to a trusted internal ClamAV daemon and `CLAMAV_PORT` (default 3310). Enable its INSTREAM protocol and configure `StreamMaxLength` to at least 10 MiB. Uploaded bytes are scanned in memory before writing a file or metadata. A malicious response, scanner error, timeout, or broken connection rejects the upload; the application never executes a scanner command with a user-supplied filename. The scanner's TCP protocol is not encrypted, so use a trusted local network or protected tunnel. If scanning is not configured, the V1 file type/signature/size validation still applies. Scanning reduces risk but does not guarantee a file is safe.

## UI primitives

The owned components in `src/components/ui` use `@base-ui/react` with shadcn component conventions. `components.json` selects the Base UI style, and the locale provider supplies Base UI's direction context. Button and dialog changes preserve the app's visual tokens, form submission, focus management, Escape behavior, and RTL layout. Native selects and inputs remain native controls.


## Current release configuration

See [Email setup](smtp.md) for SMTP host/IP, TLS, login, sender, and the non-sending connection check. See [Integrations](integrations.md) for API keys, webhook allowlists and encryption keys, calendar feeds, and optional AI. Apply migration 0006 before starting this release. The existing worker now also dispatches webhooks.
