import { and, eq, desc, lt } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { workspaceContext, apiError } from "@/lib/server-context";
export async function GET(request: Request) {
  try {
    const { workspace: w } = await workspaceContext(request, "user.manage");
    const q = new URL(request.url).searchParams;
    const before = q.get("before");
    const date = before ? new Date(before) : null;
    if (date && Number.isNaN(date.getTime()))
      return Response.json({ error: "invalid" }, { status: 400 });
    const items = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.workspaceId, w.id),
          q.get("action") ? eq(auditLogs.action, q.get("action")!) : undefined,
          q.get("actorId")
            ? eq(auditLogs.actorId, q.get("actorId")!)
            : undefined,
          date ? lt(auditLogs.createdAt, date) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);
    return Response.json(
      { items, next: items.length === 50 ? items.at(-1)?.createdAt : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
