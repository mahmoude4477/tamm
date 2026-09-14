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
