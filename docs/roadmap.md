# Roadmap

[Back to README](../README.md) · [العربية](roadmap.ar.md)

Implementation tracking and planned work. Unchecked items are planned, with no committed delivery date.

## V1 checklist

A checked item means implemented and covered by the release validation. Unchecked items remain open.

### Accounts and organization

- [x] Better Auth accounts, organizations, teams, and workspace switching.
- [x] Email verification, password recovery, and invitation acceptance/expiry/revocation.
- [x] Profile editing, profile photo URLs, session revocation, two-factor authentication, and passkeys.
- [x] Departments, managers, job titles, multiple teams, custom roles, and member deactivation.
- [x] Installation-wide account suspension through the audited operator command.

### Work and collaboration

- [x] Project editing, ownership, dates, priorities, visibility, files, and archive/restore.
- [x] Tasks, independent subtasks, checklists, dependencies, related tasks, and duplicate references.
- [x] Multiple assignees, task types, estimated and actual effort, and tags.
- [x] Configurable statuses, ordering, allowed transitions, approval, and return for changes.
- [x] Assignment history, transfer reasons, team transfer rules, and manager-approved delegation.
- [x] Task and project templates with subtasks and checklists.
- [x] Markdown, comments, editing, deletion, replies, mentions, and followers.
- [x] Validated attachments, authorized downloads, image previews, and soft deletion.
- [x] Notification inbox, read state, preferences, and due-soon/overdue reminders.
- [x] Task/project activity and a separate filterable audit log.

### Views and delivery

- [x] Board, table, calendar, My Tasks, and manager approval/workload views.
- [x] Search across tasks, projects, people, and teams.
- [x] Advanced filters, saved views, shareable filter links, and bulk operations.
- [x] Table sorting, visibility, keyboard resizing, and server pagination.
- [x] Scoped monthly reports, previous-month comparisons, cycle time, reopen/return metrics, and exports.
- [x] English and Arabic dictionaries, locale fallback, timezone configuration, and RTL layout.
- [x] Additive migrations, deployment instructions, and backup/restore documentation.
- [x] Final browser, accessibility, and PostgreSQL validation of the complete V1 branch.

## V1.5 checklist

- [x] Recurring tasks with automatic generation and preserved history.
- [x] Milestones and milestone-linked progress.
- [x] Capacity planning beyond current task counts and effort estimates.
- [x] Advanced delivery analytics and project health indicators.
- [x] Database aggregates and incremental board loading for very large workspaces.
- [x] Scheduled notification delivery and optional upload scanning integration.

- [x] Base UI button/dialog primitives and RTL direction provider, with shadcn configuration.
- [x] Final V1.5 PostgreSQL and browser validation.

## Remaining work — V2

- [ ] Configurable custom fields.
- [ ] Timers, manual time entries, and time reports.
- [ ] Public REST API, webhooks, and integration credentials.
- [ ] Calendar and organizational-system integrations.
- [ ] Optional Hijri date display.
- [ ] Optional AI drafting, summaries, and planning assistance.

