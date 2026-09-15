# Integrations and optional assistant

[Back to README](../README.md)

Open **Tools & integrations** in a persistent workspace. Credentials are generated there and displayed once. API credentials are available to members with `user.manage`; calendar credentials can be created by any active member. Each key has a project scope (or all projects visible to its creator), explicit capabilities, and an expiry of 1–365 days. Store it outside source control. Revoke and replace a key to rotate it.

## Task API

Send `Authorization: Bearer <key>` over HTTPS to your own Tamm installation. Keys inherit their creator's current project visibility and action permissions; inactive or suspended accounts cannot use them. The token hash is stored, not the token. Keys accept at most 120 requests per minute. A rate-limited active key receives 429 with Retry-After. Invalid, expired, revoked, or insufficient-scope keys receive a non-success response. Cookie authentication does not substitute for an API key on these endpoints.

| Endpoint | Capability | Result |
| --- | --- | --- |
| `GET /api/v2/tasks` | `tasks:read` | Tasks plus visible projects and statuses |
| `POST /api/v2/commands` | `tasks:write` | Apply an allowed task command with normal permissions and review rules |
| `GET /api/calendar?token=…` | `calendar:read` | iCalendar feed for visible task due dates and milestones |

Task query parameters: `limit` (1–100, default 50), `offset` (default 0), `projectId`, `statusId`, and `search`. The response includes `tasks`, `projects`, `statuses`, `total`, and `nextOffset`. Pagination is not a snapshot across requests; consumers should deduplicate IDs during concurrent edits.

Supported commands: `task.create`, `task.update`, `task.review`, `task.comment`, `task.archive`, and `task.delete`. Deletion is soft deletion. Updates and review operations require the current task `version`; stale writes return 409. Scope and workflow rejections return 403; malformed input returns 400. Mutations are audited. `task.create` is not idempotent: after a network timeout, check whether the task exists before retrying.

```json
{
  "type": "task.update",
  "id": "task-id-from-the-list",
  "version": 0,
  "data": { "title": "Updated title", "priority": "high" }
}
```

```json
{
  "type": "task.comment",
  "id": "task-id-from-the-list",
  "text": "Update from the internal system"
}
```

```json
{
  "type": "task.create",
  "data": {
    "title": "Review the imported request",
    "description": "Created by an internal integration.",
    "projectId": "project-id-from-the-list",
    "statusId": "open-status-id-from-the-list",
    "priority": "medium",
    "assigneeId": null,
    "dueDate": null,
    "startDate": null,
    "estimatedHours": 0,
    "parentId": null,
    "dependencyIds": [],
    "tags": [],
    "checklist": []
  }
}
```

The complete validated command definitions are in [commands.ts](../src/lib/commands.ts). The API is a task-integration interface for internal systems, including GIS request systems; it does not include built-in vendor-specific GIS or Microsoft Teams account provisioning.

## Calendar subscriptions

Create a calendar key and copy its subscription URL into Outlook, Google Calendar, or another iCalendar client that can reach your installation. It is a read-only feed; refresh frequency is controlled by the calendar client. A one-time **Download calendar** action is also available. Revoking the key stops future refreshes; it cannot remove copies already cached by another application. Subscription URLs contain bearer credentials: avoid sharing them or recording their query strings in proxy logs. An internal-only Tamm server may be unreachable by cloud calendar services.

## Signed webhooks

Operators configure two environment variables before an administrator adds an endpoint:

```dotenv
WEBHOOK_ALLOWED_ORIGINS=https://integration.example.com
WEBHOOK_SECRET_KEY=
```

Use comma-separated **exact origins**, including a port when needed. Internal HTTP endpoints can be explicitly allowed for a trusted network. Redirects are rejected. Generate a separate random secret of at least 32 characters for `WEBHOOK_SECRET_KEY`; keep it stable and include it in your encrypted configuration backup. Changing it invalidates existing encrypted signing keys, so recreate endpoints after changing it.

Each endpoint is scoped to one project. It sends activity event IDs, event types, workspace/project/task IDs, and occurrence time. It does not send task descriptions, comments, or attachments; fetch authorized details with the task API. Events before endpoint creation are excluded. Pausing stops delivery; resuming catches up with events since creation.

Delivery uses the existing worker. Endpoints are polled in least-recently-checked order so busy endpoints cannot permanently starve others. Each invocation queues up to 50 new events per selected endpoint and attempts at most 20 deliveries globally. Failed deliveries retry with exponential delay, up to five attempts. Administrators see recent status codes and can retry failed deliveries. Delivery is **at least once**, so deduplicate by `X-Tamm-Id` or the event ID. Endpoint access is checked against its creator's current account and project membership at dispatch time.

Verify the signature over the **unchanged request body**, prefixed with the timestamp and a period:

```text
HMAC-SHA256(signing_secret, X-Tamm-Timestamp + "." + raw_body)
```

Compare this hex digest in constant time with `X-Tamm-Signature` after removing its `sha256=` prefix. Reject timestamps outside your chosen replay window (for example, five minutes), deduplicate delivery IDs, and return a 2xx status after accepting the event. Each retry receives a fresh timestamp/signature. The UI shows the endpoint signing secret once; it is encrypted at rest using the operator key.

## Optional assistant

AI is off by default. An operator can enable a local [Ollama OpenAI-compatible endpoint](https://docs.ollama.com/api/openai-compatibility) or a compatible hosted service:

```dotenv
AI_ENABLED=true
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=
AI_MODEL=your-installed-model
AI_DAILY_LIMIT=20
```

The provider must support `POST /chat/completions`, `messages`, non-streaming output, and `max_tokens`. Configure a model that exists on your provider. Hosted services may charge for requests; Tamm does not provision an account or purchase credits.

Members with `task.create` can request task drafts, project summaries, and work plans. The UI asks them to confirm sending the prompt and selected project context to the configured provider. Summaries and plans include at most 100 visible active task titles, statuses, due dates, and estimates; drafts send only the prompt and project name. The UI presents editable text for review and copying. The assistant has no tools and cannot modify records or perform assignments. Treat suggestions as drafts, not verified facts. Requests reserve a daily quota before calling the provider; failed attempts count toward the quota. Audit entries store the mode and project, not prompts or generated text.

## Current operating limits

Extensions and the task API reuse the workspace snapshot authorization model. They should be sized with the existing snapshot-based features. Time entry lists show at most 1,000 rows per date range; SQL totals cover all matching entries. Time reports use UTC start dates, with ranges up to 366 days. Tracked time is independent of the manually set `actualHours` field; the report compares tracked hours to task estimates. Each timer is capped at 24 hours and can be corrected after stopping. Workspaces serialize changes to avoid overlapping active timers and competing field writes.

Hijri display uses the browser's Umm al-Qura calendar support. Stored dates, scheduling, exports, and date inputs remain Gregorian; the preference changes display formatting only.
