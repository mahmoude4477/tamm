# Development

[Back to README](../README.md) · [العربية](development.ar.md)

## Architecture and localization

**Stack:** Next.js App Router · React · TypeScript · Tailwind CSS · shadcn/ui with Base UI · Better Auth · PostgreSQL · Drizzle · Zod · TanStack Table.

| Location | Responsibility |
| --- | --- |
| `src/lib/commands.ts` | Validated domain commands, concurrency, dependencies, and reviews |
| `src/lib/permissions.ts` | Built-in and custom application permissions |
| `src/lib/auth.ts` | Better Auth configuration and organization integration |
| `src/db/schema.ts`, `drizzle/` | Relational models and additive migrations |
| `src/db/workspace.ts` | Snapshot loading and changed-row persistence |
| `src/app/api/` | Authorized task, file, inbox, template, audit, and workspace operations |
| `src/components/` | Workspace screens, forms, and shared interface elements |
| `src/messages/en.json` | Source of English product text |
| `src/messages/ar.json`, `src/lib/i18n.ts` | Arabic translations, locale resolution, and English fallback |
| `tests/`, `scripts/integration.mjs`, `e2e/` | Domain, PostgreSQL, and browser checks |

All product copy starts in `en.json`. To add another language, create a matching dictionary, register it in `src/lib/i18n.ts`, and set its direction. Missing translations fall back to English. User-authored task and project content is preserved in its original language.

Workspace commands run under a workspace row lock and save changed records with their audit entry in the same transaction. Composite foreign keys enforce key workspace boundaries. The paginated table uses bounded database queries; the V1.5 board uses paginated queries and delivery analytics use database aggregates. Detailed editing, the original overview/monthly reports, and planning configuration still use a workspace snapshot. See the operational notes before sizing a deployment.

```bash
npm run typecheck
npm test
npm run format:check
npm run build
# Against a disposable, configured database and a running server:
node scripts/integration.mjs
node scripts/auth-integration.mjs
node scripts/planning-integration.mjs
node scripts/v2-integration.mjs
npx playwright install chromium
RUN_AUTH_E2E=true npm run test:e2e
```

Current-scope validation covers type checking, 37 domain/localization/upload-scanning/request tests, PostgreSQL migrations and integration flows, the production build, and 7 browser checks covering work management, Arabic/mobile navigation, account/passkey setup, overview accessibility, the complete planning-to-board workflow, and custom fields/time/calendar keys/Hijri preferences. CI runs these checks for changes. Integration fixtures use `example.com` accounts and local file email delivery.

The interface follows the principles in [Better UI](https://skills.sh/jakubkrehel/skills/better-ui) and [Emil Design Engineering](https://skills.sh/emilkowalski/skills/emil-design-eng): clear hierarchy, keyboard access, restrained motion, and useful states.


V2 integration checks also exercise webhook signatures and retries, key scope/revocation, and AI context/quotas using a local mock provider. No real email or AI service is contacted by CI.

## Interface components

Forms use the Base UI edition of shadcn/ui: Input, Textarea, Checkbox, and Select. `FormSelect` composes the shared Select primitives for single and multiple values while preserving form submission. Language selection is a radio menu in the top navigation; the Hijri preference is in account settings. New UI text belongs in both dictionaries.

Analytics uses shadcn ChartContainer, tooltips and legends with Recharts. Chart colors are CSS variables in `src/app/globals.css`; numerical tables remain available alongside the charts. The chart bundle loads when analytics opens.

Default workflow labels are translated at display time only when their generated ID and unchanged original name match. Custom names and task content stay as entered. This requires no data migration.

The initial board uses one `/api/tasks?board=true` response with up to 25 tasks per status, ranked within the existing visibility filters. Loading more still pages one column. Concurrent identical GET requests share transport without a persistent client cache; saved views load when their filter section opens. Workspace metadata, notifications, and the workspace picker are separate resources, so several different requests on a page are expected.

Interface organization was informed by [Plane](https://github.com/makeplane/plane) and [Worklenz](https://github.com/Worklenz/worklenz). Their source code was not copied. Adapted shadcn components retain their [license notice](../THIRD_PARTY_NOTICES.md).
