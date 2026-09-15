import { and, eq, desc, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import {
  getIdentity,
  resolveMembership,
  checkOrigin,
  apiError,
} from "@/lib/server-context";
import { notificationKinds } from "@/lib/notifications";
import { DomainError } from "@/lib/commands";
async function context(request: Request) {
  const identity = await getIdentity(request),
    member = await resolveMembership(
      request,
      identity.user.id,
      identity.session.activeOrganizationId,
    );
  if (!member) throw new DomainError("forbidden");
  return member;
}
export async function GET(request: Request) {
  try {
    const m = await context(request);
    const rows = await db
      .select({ item: s.notifications })
      .from(s.notifications)
      .leftJoin(s.tasks, eq(s.tasks.id, s.notifications.taskId))
      .leftJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
      .where(
        and(
          eq(s.notifications.workspaceId, m.workspaceId),
          eq(s.notifications.userId, m.userId),
          or(
            isNull(s.notifications.taskId),
            and(
              isNull(s.tasks.deletedAt),
              isNull(s.projects.deletedAt),
              or(
                eq(s.projects.visibility, "organization"),
                sql`${["owner", "admin"].includes(m.role)}`,
                sql`exists(select 1 from project_member pm where pm.project_id=${s.projects.id} and pm.user_id=${m.userId})`,
              ),
            ),
          ),
        ),
      )
      .orderBy(desc(s.notifications.createdAt))
      .limit(100);
    const [preferences] = await db
      .select()
      .from(s.notificationPreferences)
      .where(
        and(
          eq(s.notificationPreferences.workspaceId, m.workspaceId),
          eq(s.notificationPreferences.userId, m.userId),
        ),
      );
    return Response.json(
      {
        items: rows.map((r) => r.item),
        enabledKinds: preferences?.enabledKinds ?? notificationKinds,
        emailEnabled: preferences?.emailEnabled ?? false,
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
    const m = await context(request);
    const body = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("read"),
          ids: z.array(z.string()).max(100).optional(),
        }),
        z.object({
          type: z.literal("preferences"),
          enabledKinds: z.array(z.enum(notificationKinds)).max(7),
          emailEnabled: z.boolean().default(false),
        }),
      ])
      .parse(await request.json());
    if (body.type === "read")
      await db
        .update(s.notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(s.notifications.workspaceId, m.workspaceId),
            eq(s.notifications.userId, m.userId),
            body.ids ? inArray(s.notifications.id, body.ids) : undefined,
          ),
        );
    else
      await db
        .insert(s.notificationPreferences)
        .values({
          id: crypto.randomUUID(),
          workspaceId: m.workspaceId,
          userId: m.userId,
          enabledKinds: body.enabledKinds,
          emailEnabled: body.emailEnabled,
        })
        .onConflictDoUpdate({
          target: [
            s.notificationPreferences.workspaceId,
            s.notificationPreferences.userId,
          ],
          set: {
            enabledKinds: body.enabledKinds,
            emailEnabled: body.emailEnabled,
          },
        });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
