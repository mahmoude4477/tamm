import { integrationIdentity } from "@/lib/v2/integrations";
import { visibleWorkspace } from "@/lib/commands";
import { apiError } from "@/lib/server-context";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const { key, workspace } = await integrationIdentity(request, "tasks:read"),
      w = visibleWorkspace(workspace),
      q = new URL(request.url).searchParams;
    const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .parse(q.get("offset") || 0),
      limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(q.get("limit") || 50);
    const tasks = w.tasks
      .filter(
        (t) =>
          !t.deletedAt &&
          !t.archived &&
          (!key.projectId || t.projectId === key.projectId) &&
          (!q.get("projectId") || t.projectId === q.get("projectId")) &&
          (!q.get("statusId") || t.statusId === q.get("statusId")) &&
          (!q.get("search") ||
            t.title.toLowerCase().includes(q.get("search")!.toLowerCase())),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    return Response.json(
      {
        tasks: tasks.slice(offset, offset + limit),
        total: tasks.length,
        nextOffset: offset + limit < tasks.length ? offset + limit : null,
        projects: w.projects.filter(
          (p) =>
            !p.deletedAt &&
            !p.archived &&
            (!key.projectId || p.id === key.projectId),
        ),
        statuses: w.statuses,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
