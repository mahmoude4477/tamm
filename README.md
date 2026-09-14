# Tamm تم

A calm workspace for projects, tasks, and team coordination. English is the initial interface language. Product copy lives in `src/messages/en.json`.

## Development

Requires Node.js 22+ and PostgreSQL 16+.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and provide a PostgreSQL connection string, deployment URL, and a random Better Auth secret of at least 32 characters.
3. Export those environment variables in your shell for the database commands. Next.js loads `.env.local` for the app; Drizzle commands use the process environment.
4. Run `npm run db:migrate` to apply the committed initial schema.
5. Run `npm run dev` and open `http://localhost:3000`.
6. `/` is an isolated in-memory demo using fictional data. `/login` and `/workspace` use Better Auth and PostgreSQL.

Create an account, then create a workspace. Administrators can add registered accounts from People & teams. Registration must be enabled explicitly through `ALLOW_REGISTRATION=true`. Disable it after onboarding when appropriate.

## Implemented foundation

- Project creation, organization/private visibility, and project membership.
- Tasks with priority, dates, estimates, tags, parent tasks, dependencies, and checklists.
- Board, list, calendar, personal tasks, dashboard, search, and filters.
- Reassignment with reason, previous/new assignee, actor, and timestamp.
- Custom statuses; review submission, approval, and return with a comment.
- Blocking dependency, subtask, and checklist checks before approval.
- Comments, activity history, archive/trash restoration, and server audit records.
- Departments, teams, membership roles, workload, and monthly CSV reporting.
- Email/password accounts, sign-out, and password changes that revoke other sessions.
- Server-side permission checks, workspace membership checks, input validation, and optimistic task versions.

## Architecture and current limits

Next.js App Router, React, TypeScript, Tailwind CSS, shadcn-style Radix primitives, Better Auth, Drizzle, and PostgreSQL.

This is an initial implementation, not the complete proposed V1. Projects, tasks, statuses, departments, teams, membership, dependencies, and activity are relational PostgreSQL tables. Composite foreign keys enforce workspace boundaries for task and project relationships. Checklists and tags are JSON fields within a task. Workspace writes lock the workspace row, validate commands on the server, and persist changed rows atomically with an audit entry. Large workspaces still need pagination and narrower transaction boundaries. The Better Auth Organization plugin is not yet integrated; membership is presently owned by the application.

The signed-in account opens its first workspace membership. A workspace switcher and invitation acceptance flow are still needed for multi-workspace operation. Demo data never enters a live database. Demo changes disappear on refresh.

Not yet implemented: email verification/recovery and email delivery, invitation links, uploads, notification center, watchers/mentions, rich text, custom permission roles, project editing controls, advanced table configuration, saved views, PDF/XLSX exports, a browsable audit log, recurring tasks, templates, milestones, time tracking, custom fields, APIs/webhooks, and AI. These are not represented as working features.

## Validation

`npm run typecheck`, `npm test`, and `npm run build` are CI gates. Tests cover authorization, review/dependency rules, transfer history, stale versions, visibility, owner retention, and CSV formula escaping. CI additionally applies migrations to PostgreSQL 16 and exercises real HTTP account/session, workspace, project, task, review, access-control, and origin-check flows.

For subsequent schema changes, generate reviewed SQL migrations with `npm run db:generate`, commit them, and apply with `npm run db:migrate`. Do not use `db:push` against a production database. Configure a least-privileged database role, HTTPS, backups, and your reverse proxy. The standalone build can run as a Node.js service behind IIS.

## Localization

Keep interface strings, labels, empty/error states, and demo copy in `src/messages/en.json`. User-entered names and content are data, not translation strings. Add a locale loader and locale selection when adding a second language, and update HTML `lang`/`dir` together. Layout uses logical CSS properties where practical. Date formatting currently uses the English locale; date-only task deadlines are treated as calendar dates.

## Design guidance

Implemented using [Better UI](https://github.com/jakubkrehel/skills/tree/main/skills/better-ui) and [Emil Design Engineering](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng): restrained motion, visible focus, consistent surface depth, touch-friendly controls, and reduced-motion support.

## License

MIT. See [LICENSE](LICENSE).
