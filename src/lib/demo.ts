import en from "@/messages/en.json";
import type { Workspace, Task } from "./types";
export function createWorkspace(
  id: string,
  name: string,
  userId: string,
  userName: string,
  email: string,
): Workspace {
  return {
    id,
    name,
    currentUserId: userId,
    members: [
      { id: userId, name: userName, email, role: "owner", teamId: null },
    ],
    projects: [],
    tasks: [],
    events: [],
    departments: [],
    teams: [],
    statuses: en.demo.statuses.map((name, i) => ({
      id: `${id}-status-${i}`,
      name,
      category: (
        ["open", "open", "active", "review", "done", "active"] as const
      )[i],
      color: ["#92969b", "#787d85", "#437ee8", "#a477d1", "#399779", "#cf9543"][
        i
      ],
    })),
  };
}
export function createDemo(messages = en): Workspace {
  const w = createWorkspace(
    "demo",
    messages.demo.workspace,
    "person-0",
    messages.demo.people[0],
    "alex@example.com",
  );
  w.statuses = w.statuses.map((s, i) => ({ ...s, id: `status-${i}` }));
  w.members = messages.demo.people.map((name, i) => ({
    id: `person-${i}`,
    name,
    email: `person${i}@example.com`,
    role: i === 0 ? "owner" : "member",
    teamId: `team-${i % 2}`,
  }));
  w.departments = messages.demo.departments.map((name, i) => ({
    id: `department-${i}`,
    name,
  }));
  w.teams = messages.demo.teams.map((name, i) => ({
    id: `team-${i}`,
    name,
    departmentId: `department-${i}`,
  }));
  w.projects = messages.demo.projects.map((p, i) => ({
    id: `project-${i}`,
    name: p.name,
    description: p.description,
    code: ["WEB", "LAU", "OPS"][i],
    color: ["#6b8d79", "#b88d68", "#8480b3"][i],
    archived: false,
    visibility: "organization",
    memberIds: w.members.map((p) => p.id),
  }));
  const now = new Date();
  const date = (offset: number) =>
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + offset,
      ),
    ).toISOString();
  w.tasks = messages.demo.tasks.map((title, i): Task => ({
    id: `task-${i}`,
    number: 101 + i,
    title,
    description: messages.demo.description,
    projectId: `project-${i % 3}`,
    statusId: `status-${[2, 3, 2, 1, 1, 4, 0, 5, 4, 2, 3, 4][i]}`,
    priority: (
      [
        "high",
        "medium",
        "high",
        "medium",
        "urgent",
        "low",
        "medium",
        "high",
        "low",
        "medium",
        "high",
        "low",
      ] as const
    )[i],
    assigneeId: `person-${i % 4}`,
    reporterId: "person-0",
    dueDate: date(i - 3).slice(0, 10),
    startDate: date(-12).slice(0, 10),
    completedAt: [5, 8, 11].includes(i) ? date(-2) : null,
    createdAt: date(-15 + i),
    updatedAt: date(-1),
    estimatedHours: [4, 2, 12, 3, 8, 3, 2, 5, 2, 4, 3, 6][i],
    parentId: null,
    dependencyIds: [],
    tags: i % 2 ? [messages.demo.tags[0]] : [messages.demo.tags[1]],
    checklist: messages.demo.checklist.map((text, j) => ({
      id: `check-${i}-${j}`,
      text,
      done: j === 0,
    })),
    archived: false,
    deletedAt: null,
    version: 0,
  }));
  w.events = [
    {
      id: "event-0",
      taskId: "task-1",
      actorId: "person-1",
      action: "task.commented",
      text: messages.demo.comment,
      createdAt: date(0),
    },
    {
      id: "event-1",
      taskId: "task-5",
      actorId: "person-0",
      action: "task.reviewed",
      text: "",
      createdAt: date(-1),
    },
  ];
  return w;
}
