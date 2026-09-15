<div align="center">
  <img src="src/app/icon.svg" width="56" height="56" alt="Tamm logo" />
  <h1>Tamm · تم</h1>
  <p>Task and project management for internal teams.</p>
  <p><a href="#getting-started">Get started</a> · <a href="docs/operations.md">Documentation</a> · <a href="https://github.com/mahmoude4477/tamm/issues">Report an issue</a></p>
  <p>
    <a href="README.ar.md"><img src="https://img.shields.io/badge/اقرأ_بالعربية-315643?style=for-the-badge" alt="اقرأ الملف التعريفي بالعربية" /></a>
  </p>
  <p>
    <a href="https://github.com/mahmoude4477/tamm/actions/workflows/ci.yml"><img src="https://github.com/mahmoude4477/tamm/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-315643" alt="MIT license" /></a>
    <img src="https://img.shields.io/badge/English_%2B_Arabic-RTL_ready-315643" alt="English and Arabic" />
  </p>
</div>

Tamm is an open-source, self-hosted workspace for managing team projects and tasks. Assign work, review progress, and understand your team's workload — with English and Arabic interfaces, including right-to-left layouts.

Run it on your own infrastructure with Node.js and PostgreSQL. Docker is optional.

![Tamm workspace overview](docs/preview.png)

## Features

- **Projects and workflows** — Organize projects, customize task statuses, and manage priorities, subtasks, checklists, and dependencies.
- **Team coordination** — Structure departments and teams, assign work, record task transfers, and review submissions before completion.
- **Flexible views** — Switch between board, table, and calendar views. Find work with global search, saved filters, and a personal task dashboard.
- **Planning** — Reuse templates, schedule recurring tasks, track milestones, and plan weekly capacity.
- **Collaboration** — Discuss work with comments, mentions, attachments, followers, and notifications.
- **Reporting** — Explore project health, workload, and monthly delivery trends. Export reports to CSV, Excel, or PDF.
- **Workspace administration** — Manage invitations, roles, permissions, activity history, and archived records across multiple workspaces.
- **Custom fields and time** — Add project-specific fields, run timers, record manual entries, and export time reports.
- **Integrations** — Connect internal systems with scoped API keys, signed webhooks, and calendar subscriptions. Enable an optional drafting assistant with your own provider.
- **English and Arabic** — Built-in translations, automatic layout direction, and JSON dictionaries for adding languages.

## Getting started

Requirements: **Node.js 22+**, **PostgreSQL 16+**, and **npm**.

```bash
git clone https://github.com/mahmoude4477/tamm.git
cd tamm
npm ci
cp .env.example .env.local
```

Set `DATABASE_URL` to your PostgreSQL connection string and `BETTER_AUTH_URL` to `http://localhost:3000`. Generate a secret with the command below and copy it into `BETTER_AUTH_SECRET` in `.env.local`.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Apply the database migrations and start the app:

```bash
node --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000) to explore the demo, or go to [/login](http://localhost:3000/login) to create an account. Development emails are saved in `.data/mail`; open the verification link from there. Create a workspace, add a project, and invite your team.

For deployment, SMTP, and the worker required for recurring tasks and scheduled notifications, follow the [operating guide](docs/operations.md).

## Documentation

| Guide | Contents |
| --- | --- |
| [Operations](docs/operations.md) | Deployment, configuration, scheduled jobs, uploads, and backups |
| [Email setup](docs/smtp.md) | SMTP host, port, sender, credentials, and connection checks |
| [Integrations](docs/integrations.md) | Task API, webhooks, calendar subscriptions, and optional AI |
| [Development](docs/development.md) | Architecture, localization, and running checks |
| [Roadmap](docs/roadmap.md) | Completed work and planned features |

## Built with

Next.js · React · TypeScript · Tailwind CSS · shadcn/ui with Base UI · Better Auth · PostgreSQL · Drizzle · Zod · TanStack Table

## Contributing

Bug reports, translations, documentation improvements, and code contributions are welcome. Open an [issue](https://github.com/mahmoude4477/tamm/issues) to report a problem or discuss a feature, and read the [development guide](docs/development.md) before submitting a pull request.

## License

[MIT](LICENSE). The bundled PDF font retains its [DejaVu license](public/fonts/LICENSE-DejaVu.txt).
