import assert from "node:assert/strict";
const base = "http://localhost:3000";
async function signup(name, email) {
  const r = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ name, email, password: "test-only-password-49Qv!" }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  return cookie;
}
async function command(cookie, body, expected = 200) {
  const r = await fetch(base + "/api/workspace", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  const payload = await r.json();
  assert.equal(r.status, expected, JSON.stringify(payload));
  return payload.workspace ?? payload;
}
const owner = await signup("Example Owner", "owner@example.com");
const member = await signup("Example Member", "member@example.com");
const outsider = await signup("Example Outsider", "outsider@example.com");
let w = await command(owner, {
  type: "workspace.create",
  name: "Integration workspace",
});
w = await command(owner, { type: "member.add", email: "member@example.com" });
w = await command(owner, {
  type: "project.create",
  data: {
    name: "Shared project",
    code: "SHR",
    description: "",
    color: "#315643",
    visibility: "organization",
    memberIds: w.members.map((m) => m.id),
  },
});
const projectId = w.projects[0].id;
w = await command(owner, {
  type: "task.create",
  data: {
    title: "Review delivery",
    description: "Integration task",
    projectId,
    statusId: w.statuses.find((s) => s.category === "open").id,
    priority: "high",
    assigneeId: w.currentUserId,
    dueDate: null,
    startDate: null,
    estimatedHours: 2,
    parentId: null,
    dependencyIds: [],
    tags: [],
    checklist: [],
  },
});
const task = w.tasks[0];
await command(
  member,
  {
    type: "task.update",
    id: task.id,
    version: 0,
    data: { title: "Unauthorized edit" },
  },
  403,
);
await command(
  owner,
  {
    type: "task.update",
    id: task.id,
    version: 99,
    data: { title: "Stale update" },
  },
  409,
);
w = await command(owner, {
  type: "task.update",
  id: task.id,
  version: 0,
  data: { statusId: w.statuses.find((s) => s.category === "review").id },
});
w = await command(owner, {
  type: "task.review",
  id: task.id,
  version: 1,
  approve: true,
  comment: "Reviewed",
});
assert.ok(w.tasks[0].completedAt);
w = await command(owner, {
  type: "project.create",
  data: {
    name: "Private project",
    code: "PRV",
    description: "Private context",
    color: "#315643",
    visibility: "private",
    memberIds: [w.currentUserId],
  },
});
const memberRead = await fetch(base + "/api/workspace", {
  headers: { Cookie: member },
}).then((r) => r.json());
assert.equal(memberRead.workspace.projects.length, 1);
const outsiderRead = await fetch(base + "/api/workspace", {
  headers: { Cookie: outsider },
}).then((r) => r.json());
assert.equal(outsiderRead.workspace, null);
const badOrigin = await fetch(base + "/api/workspace", {
  method: "POST",
  headers: {
    Origin: "https://example.com",
    Cookie: owner,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "task.delete", id: task.id }),
});
assert.equal(badOrigin.status, 403);
console.log(
  "Integration passed: account/session, relational persistence, authorization, stale writes, review, private visibility, isolation, and origin checks.",
);
