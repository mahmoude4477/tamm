import { and, eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications, notificationPreferences } from "@/db/schema";
import { workspaceContext, checkOrigin, apiError } from "@/lib/server-context";
import { notifyDue, notificationKinds } from "@/lib/notifications";
import { canSeeProject } from "@/lib/permissions";
export async function GET(request: Request) {
  try {
    const { workspace: w } = await workspaceContext(request);
    await db.transaction((tx) => notifyDue(tx, w));
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, w.id),
          eq(notifications.userId, w.currentUserId),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    const [preferences] = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.workspaceId, w.id),
          eq(notificationPreferences.userId, w.currentUserId),
        ),
      );
    return Response.json(
      {
        items: rows.filter(
          (n) =>
            !n.taskId ||
            w.tasks.some(
              (t) =>
                t.id === n.taskId &&
                !t.deletedAt &&
                canSeeProject(w, t.projectId),
            ),
        ),
        enabledKinds: preferences?.enabledKinds ?? notificationKinds,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { workspace: w } = await workspaceContext(request);
    const body = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("read"),
          ids: z.array(z.string()).max(100).optional(),
        }),
        z.object({
          type: z.literal("preferences"),
          enabledKinds: z.array(z.enum(notificationKinds)).max(7),
        }),
      ])
      .parse(await request.json());
    if (body.type === "read")
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.workspaceId, w.id),
            eq(notifications.userId, w.currentUserId),
            body.ids ? inArray(notifications.id, body.ids) : undefined,
          ),
        );
    else
      await db
        .insert(notificationPreferences)
        .values({
          id: crypto.randomUUID(),
          workspaceId: w.id,
          userId: w.currentUserId,
          enabledKinds: body.enabledKinds,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.workspaceId,
            notificationPreferences.userId,
          ],
          set: { enabledKinds: body.enabledKinds },
        });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
