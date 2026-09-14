import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../src/lib/demo";
import { applyCommand, visibleWorkspace } from "../src/lib/commands";
import { csvCell } from "../src/lib/reports";
test("member cannot edit someone else’s task", () => {
  const w = createDemo();
  w.currentUserId = "person-3";
  assert.throws(
    () =>
      applyCommand(w, {
        type: "task.update",
        id: "task-0",
        version: 0,
        data: { title: "Changed" },
      }),
    /forbidden/,
  );
});
test("task completion must go through review", () => {
  const w = createDemo();
  assert.throws(
    () =>
      applyCommand(w, {
        type: "task.update",
        id: "task-0",
        version: 0,
        data: { statusId: "status-4" },
      }),
    /review/,
  );
});
test("approval is blocked by unfinished checklist", () => {
  const w = createDemo();
  assert.throws(
    () =>
      applyCommand(w, {
        type: "task.review",
        id: "task-1",
        version: 0,
        approve: true,
        comment: "",
      }),
    /dependency/,
  );
});
test("transfer keeps assignment history and requires a reason", () => {
  const w = createDemo();
  assert.throws(
    () =>
      applyCommand(w, {
        type: "task.update",
        id: "task-0",
        version: 0,
        data: { assigneeId: "person-1" },
      }),
    /reason/,
  );
  const n = applyCommand(w, {
    type: "task.update",
    id: "task-0",
    version: 0,
    data: { assigneeId: "person-1" },
    reason: "Specialist review",
  });
  assert.equal(n.events.at(-1)?.previousAssigneeId, "person-0");
  assert.equal(n.events.at(-1)?.newAssigneeId, "person-1");
  assert.equal(w.tasks[0].assigneeId, "person-0");
});
test("stale version cannot overwrite another edit", () => {
  assert.throws(
    () =>
      applyCommand(createDemo(), {
        type: "task.update",
        id: "task-0",
        version: 3,
        data: { title: "Changed" },
      }),
    /conflict/,
  );
});
test("dependency cycles are rejected", () => {
  const w = createDemo();
  w.tasks[1].dependencyIds = ["task-0"];
  assert.throws(
    () =>
      applyCommand(w, {
        type: "task.update",
        id: "task-0",
        version: 0,
        data: { dependencyIds: ["task-1"] },
      }),
    /cycle/,
  );
});
test("private project data and its events are hidden", () => {
  const w = createDemo();
  w.currentUserId = "person-3";
  w.projects[0].visibility = "private";
  w.projects[0].memberIds = ["person-0"];
  const visible = visibleWorkspace(w);
  assert.ok(!visible.projects.some((p) => p.id === "project-0"));
  assert.ok(!visible.tasks.some((t) => t.projectId === "project-0"));
});
test("last owner cannot demote themself", () => {
  assert.throws(
    () =>
      applyCommand(createDemo(), {
        type: "member.update",
        id: "person-0",
        role: "member",
        teamId: null,
      }),
    /owner/,
  );
});
test("spreadsheet formula injection is escaped", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});

test("inactive members cannot execute commands", () => {
  const w = createDemo();
  w.members[0].active = false;
  assert.throws(
    () =>
      applyCommand(w, { type: "task.follow", id: "task-0", following: true }),
    /session/,
  );
});
test("the last active owner cannot be deactivated", () => {
  const w = createDemo();
  assert.throws(
    () =>
      applyCommand(w, {
        type: "member.update",
        id: w.currentUserId,
        role: "owner",
        teamId: null,
        active: false,
      }),
    /owner/,
  );
});
test("custom user managers cannot grant themselves broader privileges", () => {
  const w = createDemo();
  w.currentUserId = "person-3";
  const actor = w.members.find((m) => m.id === w.currentUserId)!;
  actor.permissions = ["user.manage"];
  assert.throws(
    () =>
      applyCommand(w, {
        type: "member.update",
        id: actor.id,
        role: "admin",
        teamId: null,
        customRoleId: null,
      }),
    /forbidden/,
  );
});
test("bulk changes reject a stale item without mutating the source", () => {
  const w = createDemo();
  const original = structuredClone(w);
  assert.throws(
    () =>
      applyCommand(w, {
        type: "task.bulk",
        items: [
          { id: "task-0", version: 0 },
          { id: "task-1", version: 99 },
        ],
        data: { priority: "urgent" },
      }),
    /conflict/,
  );
  assert.deepEqual(w, original);
});
test("configured workflow transitions are enforced", () => {
  const w = createDemo();
  const task = w.tasks[0];
  w.statuses.find((s) => s.id === task.statusId)!.allowedNextIds = ["status-1"];
  assert.throws(
    () =>
      applyCommand(w, {
        type: "task.update",
        id: task.id,
        version: 0,
        data: { statusId: "status-3" },
      }),
    /transition/,
  );
});
test("a member can edit and delete their own comment", () => {
  let w = createDemo();
  w.currentUserId = "person-3";
  w = applyCommand(w, {
    type: "task.comment",
    id: "task-0",
    text: "First draft",
  });
  const id = w.events.at(-1)!.id;
  w = applyCommand(w, { type: "comment.edit", id, text: "Revised draft" });
  assert.equal(w.events.at(-1)!.text, "Revised draft");
  w = applyCommand(w, { type: "comment.delete", id });
  assert.ok(w.events.at(-1)!.deletedAt);
  assert.equal(w.events.at(-1)!.text, "");
});
test("comments cannot be edited through a hidden project", () => {
  const w = createDemo();
  w.projects[0].visibility = "private";
  w.projects[0].memberIds = ["person-0"];
  w.currentUserId = "person-3";
  const event = w.events.find((e) => e.action === "task.commented")!;
  event.taskId = "task-0";
  event.actorId = w.currentUserId;
  assert.throws(
    () =>
      applyCommand(w, {
        type: "comment.edit",
        id: event.id,
        text: "Invisible",
      }),
    /forbidden/,
  );
});
test("secondary assignees can edit their assigned task", () => {
  const w = createDemo();
  w.currentUserId = "person-3";
  w.tasks[0].assigneeIds = ["person-3"];
  const n = applyCommand(w, {
    type: "task.update",
    id: "task-0",
    version: 0,
    data: { title: "Shared work" },
  });
  assert.equal(n.tasks[0].title, "Shared work");
});
