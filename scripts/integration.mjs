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

// V1 collaboration, organization and account paths use the same live database.
async function api(
  cookie,
  path,
  { body, method = body ? "POST" : "GET", expected = 200 } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await r
    .clone()
    .json()
    .catch(() => null);
  assert.equal(r.status, expected, JSON.stringify(payload));
  return { payload, response: r };
}
const workspaceId = w.id,
  memberId = w.members.find((m) => m.email === "member@example.com").id;
w = await command(member, {
  type: "task.comment",
  id: task.id,
  text: "A comment with **formatting**",
  mentionedIds: [w.currentUserId],
});
const comment = w.events.at(-1);
await command(member, {
  type: "comment.edit",
  id: comment.id,
  text: "Revised comment",
});
await api(outsider, `/api/files?workspaceId=${workspaceId}&taskId=${task.id}`, {
  expected: 403,
});
const form = new FormData();
form.set("taskId", task.id);
form.set(
  "file",
  new Blob(["example attachment"], { type: "text/plain" }),
  "example.txt",
);
const upload = await fetch(`${base}/api/files?workspaceId=${workspaceId}`, {
  method: "POST",
  headers: { Cookie: member, Origin: base },
  body: form,
});
assert.equal(upload.status, 200, await upload.clone().text());
const fileId = (await upload.json()).id;
const downloaded = await api(
  member,
  `/api/files?workspaceId=${workspaceId}&id=${fileId}`,
);
assert.equal(await downloaded.response.text(), "example attachment");
await api(outsider, `/api/files?workspaceId=${workspaceId}&id=${fileId}`, {
  expected: 403,
});
await api(member, `/api/audit?workspaceId=${workspaceId}`, { expected: 403 });
const audit = await api(owner, `/api/audit?workspaceId=${workspaceId}`);
assert.ok(audit.payload.items.length);
const inbox = await api(owner, `/api/notifications?workspaceId=${workspaceId}`);
assert.ok(inbox.payload.items.some((n) => n.kind === "mention"));
await api(owner, `/api/notifications?workspaceId=${workspaceId}`, {
  body: { type: "read" },
});
await api(member, `/api/views?workspaceId=${workspaceId}`, {
  body: { name: "My overdue", filters: { overdue: true } },
});
const saved = await api(member, `/api/views?workspaceId=${workspaceId}`);
assert.equal(saved.payload.items.length, 1);
const ownerViews = await api(owner, `/api/views?workspaceId=${workspaceId}`);
assert.equal(ownerViews.payload.items.length, 0);
const invite = await api(owner, "/api/auth/organization/invite-member", {
  body: {
    email: "outsider@example.com",
    role: "member",
    organizationId: workspaceId,
  },
});
await api(outsider, "/api/auth/organization/accept-invitation", {
  body: { invitationId: invite.payload.id },
});
const joined = await api(outsider, `/api/workspace?workspaceId=${workspaceId}`);
assert.equal(joined.payload.workspace.id, workspaceId);
await command(owner, {
  type: "member.update",
  id: memberId,
  role: "member",
  teamId: null,
  active: false,
});
await api(member, `/api/workspace?workspaceId=${workspaceId}`).then((r) =>
  assert.equal(r.payload.workspace, null),
);
await api(member, `/api/files?workspaceId=${workspaceId}&id=${fileId}`, {
  expected: 403,
});
await command(owner, {
  type: "member.update",
  id: memberId,
  role: "member",
  teamId: null,
  active: true,
});
await api(member, "/api/auth/update-user", {
  body: { name: "Updated Example" },
});
const sessions = await api(member, "/api/auth/list-sessions");
assert.ok(sessions.payload.length > 0);
const passkey = await api(
  member,
  "/api/auth/passkey/generate-register-options",
);
assert.ok(passkey.payload.challenge);
// Capture reset mail locally; integration tests never send external messages.
await api(outsider, "/api/auth/request-password-reset", {
  body: { email: "outsider@example.com", redirectTo: "/reset-password" },
});
const { readdir, readFile } = await import("node:fs/promises");
const mailDirectory = process.env.MAIL_DIRECTORY;
assert.ok(mailDirectory);
const letters = await Promise.all(
  (await readdir(mailDirectory)).map(async (name) =>
    JSON.parse(await readFile(`${mailDirectory}/${name}`, "utf8")),
  ),
);
const reset = letters.find(
  (m) =>
    m.to === "outsider@example.com" && m.subject === "Reset your Tamm password",
);
assert.ok(reset);
const resetURL = new URL(reset.text.match(/https?:\/\/\S+/)[0]);
// Better Auth issues an intermediate URL which redirects to the application.
const redirect = await fetch(resetURL, { redirect: "manual" });
const target = new URL(redirect.headers.get("location"), base);
const token = target.searchParams.get("token");
assert.ok(token);
await api(outsider, "/api/auth/reset-password", {
  body: { token, newPassword: "replacement-test-password-59Vx!" },
});
console.log(
  "V1 integration passed: comments, scoped files, audit access, notifications, saved views, invitations, deactivation, profile, sessions, passkey options and password recovery.",
);
