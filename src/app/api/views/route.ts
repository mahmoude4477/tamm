import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { workspaceContext, checkOrigin, apiError } from "@/lib/server-context";
const filters = z
  .record(z.string().max(40), z.union([z.string().max(200), z.boolean()]))
  .refine((v) => Object.keys(v).length <= 20);
export async function GET(request: Request) {
  try {
    const { workspace: w } = await workspaceContext(request);
    return Response.json(
      {
        items: await db
          .select()
          .from(savedViews)
          .where(
            and(
              eq(savedViews.workspaceId, w.id),
              eq(savedViews.userId, w.currentUserId),
            ),
          ),
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
      .object({ name: z.string().trim().min(1).max(100), filters })
      .parse(await request.json());
    await db.insert(savedViews).values({
      id: crypto.randomUUID(),
      workspaceId: w.id,
      userId: w.currentUserId,
      ...body,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const { workspace: w } = await workspaceContext(request);
    const id = z
      .string()
      .min(1)
      .parse(new URL(request.url).searchParams.get("id"));
    await db
      .delete(savedViews)
      .where(
        and(
          eq(savedViews.id, id),
          eq(savedViews.workspaceId, w.id),
          eq(savedViews.userId, w.currentUserId),
        ),
      );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
