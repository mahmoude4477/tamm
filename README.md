<div align="center">
  <img src="src/app/icon.svg" width="64" height="64" alt="Tamm logo" />
  <h1>Tamm · تم</h1>
  <p><strong>A little clarity. A lot done.</strong></p>
  <p>An open-source workspace for projects, tasks, and team coordination.</p>
  <p>English-first · Self-hosted · PostgreSQL · MIT licensed</p>
  <p>
    <a href="#getting-started">Getting started</a> ·
    <a href="#whats-implemented">Features</a> ·
    <a href="#roadmap">Roadmap</a> ·
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

> **Project status: initial implementation.** The core task workflow is available for evaluation. Tamm is still working toward its full V1 scope; unchecked items below are not implemented.

## Why Tamm?

Tamm brings project context, task ownership, and review into one workspace. Teams can organize work, transfer a task with a reason, track its history, and follow it through approval. Managers can inspect workload and monthly delivery without relying on an arbitrary employee score.

The interface starts in English. Product text is centralized in [`src/messages/en.json`](src/messages/en.json), with a separate translation layer planned for additional languages.

## What's implemented

### Projects and tasks

- [x] Project creation with names, codes, descriptions, and colors.
- [x] Workspace-wide and private-project visibility with project membership.
- [x] Tasks with identifiers, descriptions, priorities, dates, estimates, and tags.
- [x] Parent tasks, subtasks, dependency links, and checklists.
- [x] Task reassignment with a reason, previous/new assignee, actor, and timestamp.
- [x] Custom workflow statuses and recorded task activity.
- [x] Submit for review, approve, and return with a comment.
- [x] Dependency, subtask, and checklist checks before approval.
- [x] Task comments, archive, soft deletion, and restoration.

### Workspace experience

- [x] Overview dashboard and personal task view.
- [x] Kanban board with drag-and-drop, list, and monthly calendar views.
- [x] Task/project search with a keyboard shortcut.
- [x] Status, priority, and assignee filters.
- [x] Bulk status changes from the list view.
- [x] Departments, teams, and member roles.
- [x] Workload by active task count and estimated hours.
- [x] Monthly completion, on-time delivery, and cycle-time reporting.
- [x] Task and monthly-report CSV exports.
- [x] Responsive layouts and reduced-motion support.
- [x] Isolated demo using fictional data.

### Application foundation

- [x] Better Auth email/password accounts and sign-out.
- [x] Password changes with revocation of other sessions.
- [x] Administrators can add accounts already registered on the installation.
- [x] Server-side permissions, membership checks, and Zod validation.
- [x] Task version checks to reject stale updates.
- [x] Relational PostgreSQL storage and committed SQL migration.
- [x] Server audit records written with workspace changes.
- [x] Type checks, workflow tests, production build, and PostgreSQL integration CI.

## Getting started

### Requirements

| Requirement | Version / purpose                                 |
| ----------- | ------------------------------------------------- |
| Node.js     | 22 or newer                                       |
| PostgreSQL  | 16 or newer, with an existing database            |
| npm         | Install dependencies using the committed lockfile |

The application runs as a Node.js service. Docker is not required for installation.

### 1. Get the source

The initial implementation is currently on `feat/tamm-v1` in [pull request #1](https://github.com/mahmoude4477/tamm/pull/1).

```bash
git clone --branch feat/tamm-v1 https://github.com/mahmoude4477/tamm.git
cd tamm
npm ci
```

### 2. Configure the environment

Copy `.env.example` to `.env.local` and replace its placeholder values.

```bash
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`.

| Variable             | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string for this installation                     |
| `BETTER_AUTH_URL`    | Application origin, such as `http://localhost:3000` during development |
| `BETTER_AUTH_SECRET` | Random secret of at least 32 characters; keep it out of source control |
| `ALLOW_REGISTRATION` | Set to `true` to allow account creation; other values disable sign-up  |

Generate a secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### 3. Apply the database migration

Next.js loads `.env.local` automatically. Drizzle commands read the process environment, so explicitly load the file when applying the migration:

```bash
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate
```

If your shell or service already supplies the environment variables, use `npm run db:migrate` instead.

### 4. Start Tamm

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

| Route        | Experience                                                |
| ------------ | --------------------------------------------------------- |
| `/`          | Fictional demo; changes disappear on refresh              |
| `/login`     | Sign in or create an account when registration is enabled |
| `/workspace` | Persistent workspace backed by PostgreSQL                 |

Create an account, name your workspace, and add your first project. In **People & teams**, an administrator can add someone who already has an account on the same installation. Email invitation links are still on the roadmap.

The demo never writes to a live workspace database.

## Technical overview

| Layer          | Technology                                      |
| -------------- | ----------------------------------------------- |
| Application    | Next.js App Router, React, TypeScript           |
| Interface      | Tailwind CSS and shadcn-style Radix primitives  |
| Authentication | Better Auth                                     |
| Database       | PostgreSQL and Drizzle ORM                      |
| Validation     | Zod                                             |
| Icons          | Lucide                                          |
| Tests          | Node.js test runner and HTTP integration checks |

### Source map

| Location                  | Responsibility                                         |
| ------------------------- | ------------------------------------------------------ |
| `src/app/`                | Pages, route handlers, metadata, and global styles     |
| `src/components/`         | Workspace layout, task editors, panels, and shared UI  |
| `src/lib/commands.ts`     | Validated commands and task workflow rules             |
| `src/lib/permissions.ts`  | Role permissions and project/task access checks        |
| `src/lib/reports.ts`      | Reporting calculations and CSV escaping                |
| `src/db/schema.ts`        | Relational database schema                             |
| `src/db/workspace.ts`     | Workspace loading and persistence                      |
| `src/messages/en.json`    | English product copy and fictional demo text           |
| `drizzle/`                | Versioned database migrations                          |
| `tests/`                  | Workflow and permission tests                          |
| `scripts/integration.mjs` | HTTP integration checks against a running installation |

Projects, tasks, statuses, departments, teams, memberships, dependencies, and activity have relational tables. Composite foreign keys enforce workspace boundaries for task and project relationships. Tags and checklists are JSON fields within a task.

Workspace mutations take a workspace row lock, apply a validated command, and persist changed rows with an audit entry in the same transaction. This currently serializes writes within each workspace; pagination and narrower transaction boundaries remain necessary for larger installations.

**Current constraints:** membership is application-managed, not yet provided by the Better Auth Organization plugin. An account opens its first workspace membership; there is no workspace switcher yet. Audit records exist in the database, but a browsing interface is still pending.

## Roadmap

Checked items above describe implemented functionality. The checkboxes below track remaining work; phase labels express intended scope, not release dates.

### V1 — Accounts and organization

- [ ] Email delivery, email verification, and forgot/reset password flows.
- [ ] Invitation links with acceptance, expiry, and revocation.
- [ ] Better Auth Organization and Teams plugin integration.
- [ ] Workspace switching and explicit workspace selection.
- [ ] Profile editing, profile photos, and active-session management.
- [ ] Account suspension and active/inactive employee management.
- [ ] Department/team manager assignments and employee job titles.
- [ ] Membership in multiple teams.
- [ ] Custom roles and granular permission administration.
- [ ] Optional two-factor authentication and passkeys.

### V1 — Projects and workflow

- [ ] Project editing and archive/restore controls.
- [ ] Project owners/managers, dates, priorities, and lifecycle statuses.
- [ ] Project-level activity history and files.
- [ ] Rich-text task descriptions and comments.
- [ ] Task types, multiple assignees, and actual effort.
- [ ] Related-task and duplicate relationships.
- [ ] Configurable transfer rules and manager approval for delegation.
- [ ] Workflow status editing, ordering, and transition restrictions.
- [ ] Task and project templates for repeatable work.

### V1 — Collaboration and administration

- [ ] Attachments with upload validation, access-controlled downloads, and previews.
- [ ] Comment editing/deletion, threaded replies, and mentions.
- [ ] Task followers/watchers.
- [ ] Notification center with read/unread state and preferences.
- [ ] Assignment, comment, review, due-soon, and overdue notifications.
- [ ] Dedicated admin panel for users, roles, workflows, and system settings.
- [ ] Browsable, filterable audit log with old/new values where relevant.

### V1 — Views and reporting

- [ ] Dedicated manager dashboard and approval queue.
- [ ] Search across people and teams as well as tasks and projects.
- [ ] Advanced filters, saved views, and shareable filter state.
- [ ] Table sorting, column visibility, resizing, and customization.
- [ ] Additional bulk actions: assignment, priority, project, tags, dates, and archive.
- [ ] Calendar day/week views, start dates, and project dates.
- [ ] Reports filtered by department, team, project, employee, status, and priority.
- [ ] Previous-month comparisons, reopened-task counts, and review-return metrics.
- [ ] PDF and Excel exports.

### V1 — Localization and operational readiness

- [ ] Locale loader, language selection, and translation fallback behavior.
- [ ] Arabic translation and complete RTL interaction verification.
- [ ] Configurable timezone and locale-aware dates/numbers throughout the app.
- [ ] Server-side pagination and narrower transaction boundaries.
- [ ] Documented backup/restore procedure and deployment verification.
- [ ] Broader accessibility and account/collaboration end-to-end coverage.

### V1.5 — Planning and repeatable work

- [ ] Recurring tasks with automatic generation and preserved history.
- [ ] Milestones and milestone-linked task progress.
- [ ] Workload capacity planning beyond task counts and estimates.
- [ ] Advanced delivery analytics and project health indicators.

### V2 — Extensibility

- [ ] Configurable custom fields.
- [ ] Timers, manual time entries, and time reports.
- [ ] REST API and webhooks.
- [ ] Calendar and organizational-system integrations.
- [ ] Optional Hijri date display.
- [ ] Optional AI task drafting, summaries, and planning assistance.

## Development and validation

| Command                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Start the development server                       |
| `npm run typecheck`    | Generate route types and check TypeScript          |
| `npm test`             | Run workflow and permission tests                  |
| `npm run build`        | Create the production build                        |
| `npm start`            | Run the production server after building           |
| `npm run format:check` | Check source formatting                            |
| `npm run format`       | Format source, tests, and scripts                  |
| `npm run db:generate`  | Generate a migration after schema changes          |
| `npm run db:migrate`   | Apply committed migrations                         |
| `npm run db:push`      | Synchronize a disposable development database only |

CI installs from the lockfile, checks types, runs workflow tests, applies migrations to PostgreSQL 16, builds the app, and tests real HTTP account/session and workspace flows.

Tests cover permissions, transfer history, stale writes, dependency cycles, approval rules, private-project visibility, owner retention, and CSV formula escaping. Integration checks exercise account creation, relational persistence, workspace isolation, and request-origin checks.

### Deployment

```bash
npm run build
npm start
```

Provide the environment variables to the running service. Tamm produces a standalone Next.js build and can run as a Node.js service behind IIS or another reverse proxy. Use reviewed migrations for persistent databases; `db:push` is not the production migration workflow.

## Localization

Put product labels, descriptions, empty states, error messages, and demo copy in [`en.json`](src/messages/en.json). User-entered names and descriptions are content, not translation keys.

When adding a language, implement locale loading and selection, update HTML `lang` and `dir` together, and verify date/number formatting and layout behavior. English is the only currently implemented locale; date-only task deadlines are treated as calendar dates.

## Contributing

1. Choose an unchecked roadmap item or describe a reproducible issue.
2. Keep UI strings in `en.json` and demonstration data fictional.
3. Keep authorization and workflow rules on the server.
4. Include a reviewed migration when changing the schema.
5. Run type checks, relevant tests, and the production build before opening a pull request.

Describe the problem, the resulting behavior, and how you verified it. Avoid including credentials, private workspace data, or personal information in examples and screenshots.

## Design references

The interface follows guidance from [Better UI](https://github.com/jakubkrehel/skills/tree/main/skills/better-ui) and [Emil Design Engineering](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng), with restrained motion, consistent surfaces, visible focus, and responsive layouts.

## License

Tamm is available under the [MIT License](LICENSE), including commercial use under its terms.
