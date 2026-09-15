import assert from "node:assert/strict";
import { testFetch as fetch } from "./test-http.mjs";
const base = "http://localhost:3000";
async function login(email) {
  const r = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test-only-password-49Qv!" }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
const owner = await login("owner@example.com"),
  member = await login("member@example.com");
async function api(path, body, cookie = owner, status = 200) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return data;
}
let w = (await api("/api/workspace")).workspace;
const workspaceId = w.id,
  project = w.projects.find(
    (p) => p.visibility === "organization" && !p.archived,
  ),
  source = w.tasks.find(
    (t) => t.projectId === project.id && !t.deletedAt && !t.parentId,
  ),
  date = new Date().toISOString().slice(0, 10);
const url = `/api/planning?workspaceId=${workspaceId}`;
const compact = await api(
  `/api/workspace?workspaceId=${workspaceId}&content=metadata`,
);
assert.equal(compact.workspace.tasks.length, 0);
assert.equal(compact.workspace.events.length, 0);
assert.ok(compact.workspace.projects.length);
await api(url, {
  type: "milestone.save",
  name: "V1.5 checkpoint",
  projectId: project.id,
  dueDate: date,
  taskIds: [source.id],
});
let planning = await api(url);
const milestone = planning.milestones.find((m) => m.name === "V1.5 checkpoint");
assert.equal(milestone.total, 1);
await api(
  url,
  {
    type: "milestone.save",
    id: milestone.id,
    name: "Forbidden",
    projectId: project.id,
    dueDate: date,
    taskIds: [],
  },
  member,
  403,
);
await api(url, {
  type: "capacity.save",
  userId: w.currentUserId,
  week: date,
  hours: 12,
});
planning = await api(url);
assert.equal(
  planning.capacity.rows.find((r) => r.userId === w.currentUserId).capacity,
  12,
);
await api(url, { type: "capacity.calendar", workingDays: [0, 1, 2, 3, 4] });
planning = await api(url);
assert.deepEqual(planning.capacity.workingDays, [0, 1, 2, 3, 4]);
await api(url, {
  type: "recurrence.create",
  name: "Weekly operations",
  taskId: source.id,
  schedule: {
    frequency: "week",
    interval: 1,
    anchorDate: date,
    endDate: null,
    timezone: "UTC",
  },
});
const rule = (await api(url)).rules.find((r) => r.name === "Weekly operations");
await api("/api/jobs", {}, owner, 403);
async function jobs() {
  const r = await fetch(base + "/api/jobs", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.JOBS_SECRET}` },
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
await Promise.all([jobs(), jobs()]);
await jobs();
planning = await api(url);
const runs = planning.runs.filter((r) => r.recurringId === rule.id);
assert.equal(runs.length, 1);
assert.ok(runs[0].taskIds.length);
assert.notEqual(runs[0].taskIds[0], source.id);
w = (await api("/api/workspace")).workspace;
const generated = w.tasks.find((t) => t.id === runs[0].taskIds[0]);
assert.equal(
  w.statuses.find((s) => s.id === generated.statusId).category,
  "open",
);
assert.ok(generated.checklist.every((c) => !c.done));
const analytics = await api(`/api/analytics?workspaceId=${workspaceId}`);
assert.ok(analytics.projects.some((p) => p.id === project.id));
assert.ok(analytics.projects.every((p) => typeof p.open === "number"));
await api(`/api/analytics?workspaceId=${workspaceId}`, undefined, member, 403);
await api(`/api/notifications?workspaceId=${workspaceId}`, {
  type: "preferences",
  enabledKinds: ["due", "overdue"],
  emailEnabled: true,
});
await api("/api/workspace", {
  type: "task.update",
  id: generated.id,
  version: generated.version,
  data: { dueDate: date },
});
await jobs();
const inbox = await api(`/api/notifications?workspaceId=${workspaceId}`);
assert.ok(
  inbox.items.some((n) => n.taskId === generated.id && n.kind === "due"),
);
assert.equal(inbox.emailEnabled, true);
const { readdir, readFile } = await import("node:fs/promises");
const messages = await Promise.all(
  (await readdir(process.env.MAIL_DIRECTORY)).map((f) =>
    readFile(`${process.env.MAIL_DIRECTORY}/${f}`, "utf8").then(JSON.parse),
  ),
);
assert.ok(
  messages.some(
    (m) =>
      m.to === "owner@example.com" &&
      m.subject === "Tamm workspace notification",
  ),
);
console.log(
  "V1.5 integration passed: milestones, capacity, recurring idempotency, scoped aggregates, compact workspace loading, scheduled notifications and email opt-in.",
);
