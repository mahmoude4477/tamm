import test from "node:test";
import assert from "node:assert/strict";
import {
  nextOccurrence,
  captureRecurring,
  weekStart,
  day,
} from "../src/lib/planning/model";
import { capacityPlan } from "../src/lib/planning/capacity";
import { projectHealth } from "../src/lib/planning/analytics";
import { createDemo } from "../src/lib/demo";
const monthly = {
  frequency: "month" as const,
  interval: 1,
  anchorDate: "2028-01-31",
  endDate: null,
  timezone: "Asia/Riyadh",
};
test("monthly recurrence clamps short months without drifting from its anchor", () => {
  assert.equal(nextOccurrence(monthly, "2028-01-31"), "2028-02-29");
  assert.equal(nextOccurrence(monthly, "2028-02-29"), "2028-03-31");
  assert.equal(
    nextOccurrence({ ...monthly, interval: 3 }, "2028-01-31"),
    "2028-04-30",
  );
});
test("weekly schedules and ISO weeks cross year boundaries", () => {
  assert.equal(
    nextOccurrence(
      { ...monthly, frequency: "week", interval: 2 },
      "2026-12-28",
    ),
    "2027-01-11",
  );
  assert.equal(weekStart("2027-01-03"), "2026-12-28");
  assert.equal(day.safeParse("2026-02-30").success, false);
});
test("recurring snapshots retain children and only internal dependencies", () => {
  const w = createDemo(),
    root = w.tasks[0],
    child = {
      ...w.tasks[1],
      parentId: root.id,
      dependencyIds: [root.id, "outside"],
    };
  const snapshot = captureRecurring([root, child], root.id);
  assert.equal(snapshot.length, 2);
  assert.deepEqual(snapshot[1].dependencyIds, [root.id]);
  root.title = "changed";
  assert.notEqual(snapshot[0].title, root.title);
});
test("capacity shares remaining effort, respects leave, and separates unscheduled work", () => {
  const w = createDemo(),
    a = w.members[0],
    b = w.members[1];
  w.tasks = [
    {
      ...w.tasks[0],
      assigneeId: a.id,
      assigneeIds: [b.id],
      statusId: w.statuses.find((s) => s.category === "open")!.id,
      startDate: "2026-09-14",
      dueDate: "2026-09-18",
      estimatedHours: 20,
      actualHours: 4,
      deletedAt: null,
      archived: false,
    },
  ];
  const plan = capacityPlan(
    w,
    "2026-09-14",
    [{ userId: a.id, hours: 0 }],
    "2026-09-14",
  );
  assert.equal(plan.rows.find((r) => r.userId === a.id)!.allocated, 8);
  assert.equal(plan.rows.find((r) => r.userId === a.id)!.overloaded, true);
  assert.equal(plan.rows.find((r) => r.userId === b.id)!.allocated, 8);
  w.tasks[0].dueDate = null;
  assert.equal(
    capacityPlan(w, "2026-09-14", [], "2026-09-14").rows.find(
      (r) => r.userId === a.id,
    )!.unscheduled,
    8,
  );
});
test("capacity honors configurable working days", () => {
  const w = createDemo();
  w.settings = {
    transferPolicy: "team",
    timezone: "UTC",
    taskTypes: [],
    workingDays: [0, 1, 2, 3, 4],
  };
  w.tasks = [
    {
      ...w.tasks[0],
      statusId: w.statuses.find((s) => s.category === "open")!.id,
      assigneeId: w.members[0].id,
      assigneeIds: [],
      estimatedHours: 10,
      actualHours: 0,
      startDate: "2026-09-20",
      dueDate: "2026-09-21",
    },
  ];
  assert.equal(
    capacityPlan(w, "2026-09-14", [], "2026-09-14").rows[0].allocated,
    5,
  );
});
test("project health identifies delayed milestones and blocked work without employee scores", () => {
  const base = {
    open: 2,
    overdue: 0,
    blocked: 0,
    lateMilestones: 0,
    endDate: "2026-12-01",
    startDate: "2026-09-01",
    total: 4,
    completed: 2,
  };
  assert.equal(projectHealth(base, "2026-09-15"), "onTrack");
  assert.equal(projectHealth({ ...base, blocked: 1 }, "2026-09-15"), "atRisk");
  assert.equal(
    projectHealth({ ...base, lateMilestones: 1 }, "2026-09-15"),
    "delayed",
  );
});
