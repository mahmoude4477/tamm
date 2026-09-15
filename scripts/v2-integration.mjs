import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { testFetch as fetch } from "./test-http.mjs";
const base = "http://localhost:3000";
async function login(email) {
  const r = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test-only-password-49Qv!" }),
  });
  assert.equal(r.status, 200);
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
  const value = await r.json();
  assert.equal(r.status, status, JSON.stringify(value));
  return value;
}
const w = (await api("/api/workspace")).workspace,
  project = w.projects.find(
    (p) => p.visibility === "organization" && !p.archived,
  ),
  task = w.tasks.find(
    (t) => t.projectId === project.id && !t.archived && !t.deletedAt,
  ),
  privateProject = w.projects.find((p) => p.visibility === "private");
const url = `/api/extensions?workspaceId=${w.id}`;
const field = await api(url, {
  type: "field.save",
  name: "Asset code",
  kind: "text",
  projectId: project.id,
});
await api(url, {
  type: "field.value",
  taskId: task.id,
  fieldId: field.id,
  value: "ASSET-42",
});
assert.equal(
  (await api(url)).values.find((v) => v.fieldId === field.id).value,
  "ASSET-42",
);
await api(
  url,
  {
    type: "field.save",
    name: "Unauthorized",
    kind: "text",
    projectId: project.id,
  },
  member,
  403,
);
const number = await api(url, {
  type: "field.save",
  name: "Impact",
  kind: "number",
  projectId: project.id,
});
await api(
  url,
  { type: "field.value", taskId: task.id, fieldId: number.id, value: "42" },
  owner,
  400,
);
if (privateProject) {
  const f = await api(url, {
    type: "field.save",
    name: "Private field",
    kind: "text",
    projectId: privateProject.id,
  });
  assert.ok(
    !(await api(url, undefined, member)).fields.some((v) => v.id === f.id),
  );
}
const start = await api(url, { type: "time.start", taskId: task.id });
await api(url, { type: "time.start", taskId: task.id }, owner, 409);
await api(url, { type: "time.stop", id: start.id });
await api(url, { type: "time.stop", id: start.id }, owner, 409);
const entry = await api(url, {
  type: "time.save",
  taskId: task.id,
  startedAt: new Date(Date.now() - 7200000).toISOString(),
  minutes: 60,
  note: "Integration entry",
});
await api(url, { type: "time.delete", id: entry.id }, member, 403);
assert.ok(
  (await api(url)).totals.some((t) => t.taskId === task.id && t.minutes >= 60),
);
await api(url, {
  type: "time.save",
  id: entry.id,
  taskId: task.id,
  startedAt: new Date(Date.now() - 7200000).toISOString(),
  minutes: 30,
  note: "Corrected",
});
const key = await api(url, {
  type: "key.create",
  name: "Test integration",
  projectId: project.id,
  scopes: ["tasks:read", "tasks:write"],
  days: 1,
});
async function external(path, body, secret = key.secret, status = 200) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await r.json();
  assert.equal(r.status, status, JSON.stringify(value));
  return value;
}
const list = await external("/api/v2/tasks?limit=1");
assert.equal(list.tasks.length, 1);
assert.ok(list.projects.every((p) => p.id === project.id));
await external("/api/v2/commands", {
  type: "task.comment",
  id: task.id,
  text: "API integration comment",
});
if (privateProject) {
  const privateTask = w.tasks.find((t) => t.projectId === privateProject.id);
  if (privateTask)
    await external(
      "/api/v2/commands",
      { type: "task.comment", id: privateTask.id, text: "Forbidden" },
      key.secret,
      403,
    );
}
const read = await api(url, {
  type: "key.create",
  name: "Read only",
  projectId: project.id,
  scopes: ["tasks:read"],
  days: 1,
});
await external(
  "/api/v2/commands",
  { type: "task.comment", id: task.id, text: "Forbidden" },
  read.secret,
  403,
);
assert.ok(!(await api(url)).keys.some((k) => "hash" in k || "secret" in k));
await api(url, { type: "key.revoke", id: key.id });
await external("/api/v2/tasks", undefined, key.secret, 403);
const calendar = await api(url, {
  type: "key.create",
  name: "Calendar test",
  projectId: project.id,
  scopes: ["calendar:read"],
  days: 1,
});
let r = await fetch(base + `/api/calendar?token=${calendar.secret}`);
assert.equal(r.status, 200);
assert.match(await r.text(), /BEGIN:VCALENDAR\r\n/);
await api(url, { type: "key.revoke", id: calendar.id });
r = await fetch(base + `/api/calendar?token=${calendar.secret}`);
assert.equal(r.status, 403);
await api(
  url,
  {
    type: "hook.create",
    name: "Blocked destination",
    projectId: project.id,
    url: "http://169.254.169.254/metadata",
  },
  owner,
  403,
);
let received = [],
  attempt = 0;
const server = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  received.push({ headers: req.headers, body });
  res.writeHead(++attempt === 1 ? 503 : 204);
  res.end();
});
await new Promise((resolve) => server.listen(3199, "127.0.0.1", resolve));
try {
  const hook = await api(url, {
    type: "hook.create",
    name: "Test receiver",
    projectId: project.id,
    url: "http://127.0.0.1:3199/events",
  });
  const current = (await api("/api/workspace")).workspace.tasks.find(
    (t) => t.id === task.id,
  );
  await api("/api/workspace", {
    type: "task.update",
    id: task.id,
    version: current.version,
    data: { title: current.title + " hook" },
  });
  async function jobs() {
    const r = await fetch(base + "/api/jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.JOBS_SECRET}` },
    });
    assert.equal(r.status, 200, await r.clone().text());
  }
  await jobs();
  assert.ok(received.length);
  const message = received[0],
    expected = createHmac("sha256", hook.secret)
      .update(`${message.headers["x-tamm-timestamp"]}.${message.body}`)
      .digest("hex");
  assert.equal(message.headers["x-tamm-signature"], `sha256=${expected}`);
  assert.equal(JSON.parse(message.body).projectId, project.id);
  const failed = (await api(url)).deliveries.find(
    (d) => d.endpointId === hook.id && !d.deliveredAt,
  );
  assert.ok(failed);
  await api(url, { type: "hook.retry", id: failed.id });
  await jobs();
  assert.ok(
    (await api(url)).deliveries.some(
      (d) => d.id === failed.id && d.deliveredAt,
    ),
  );
  await api(url, { type: "hook.toggle", id: hook.id, enabled: false });
  // Restore the title used by the existing browser fixtures.
  const restored = (await api("/api/workspace")).workspace.tasks.find(
    (t) => t.id === task.id,
  );
  await api("/api/workspace", {
    type: "task.update",
    id: task.id,
    version: restored.version,
    data: { title: current.title },
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
}
await api(
  `/api/assistant?workspaceId=${w.id}`,
  { mode: "summary", projectId: project.id, prompt: "Summarize", locale: "en" },
  owner,
  500,
);
console.log(
  "V2 integration passed: typed fields, private scope, timers, time totals, scoped read/write keys, revocation, calendar subscriptions, signed webhook retries, and disabled AI.",
);
