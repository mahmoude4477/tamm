import type { Task, Workspace } from "./types";
/** Task numbers distinguish recurring or similarly named work in pickers. */
export function taskLabel(w: Workspace, task: Task): string {
  const code = w.projects.find(
    (project) => project.id === task.projectId,
  )?.code;
  return `${code ? `${code}-` : ""}${task.number} · ${task.title}`;
}
