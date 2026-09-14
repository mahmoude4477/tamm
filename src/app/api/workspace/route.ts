import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { loadWorkspace, saveWorkspace } from "@/db/workspace";
import { workspaces, memberships, auditLogs, user } from "@/db/schema";
import {
  applyCommand,
  commandSchema,
  DomainError,
  visibleWorkspace,
} from "@/lib/commands";
import { createWorkspace } from "@/lib/demo";
import type { Role } from "@/lib/types";
import { can } from "@/lib/permissions";
export const dynamic = "force-dynamic";
async function identity() {
  return auth.api.getSession({ headers: await headers() });
}
export async function GET() {
  const session = await identity();
  if (!session) return Response.json({ error: "session" }, { status: 401 });
  const [m] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, session.user.id))
    .limit(1);
  if (!m) return Response.json({ workspace: null });
  const data = await db.transaction((tx) =>
    loadWorkspace(tx, m.workspaceId, session.user.id),
  );
  const current = data.members.find((x) => x.id === session.user.id);
  if (!current) return Response.json({ error: "session" }, { status: 403 });
  current.role = m.role as Role;
  return Response.json(
    { workspace: visibleWorkspace(data) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !process.env.BETTER_AUTH_URL ||
    origin !== new URL(process.env.BETTER_AUTH_URL).origin
  )
    return Response.json({ error: "forbidden" }, { status: 403 });
  const session = await identity();
  if (!session) return Response.json({ error: "session" }, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 100000)
      return Response.json({ error: "invalid" }, { status: 413 });
    const body = JSON.parse(raw);
    if (body.type === "workspace.create") {
      const { name } = z
        .object({ name: z.string().trim().min(1).max(100) })
        .parse(body);
      const w = await db.transaction(async (tx) => {
        await tx
          .select()
          .from(user)
          .where(eq(user.id, session.user.id))
          .for("update");
        const [existing] = await tx
          .select()
          .from(memberships)
          .where(eq(memberships.userId, session.user.id));
        if (existing) throw new DomainError("conflict");
        const id = crypto.randomUUID();
        const w = createWorkspace(
          id,
          name,
          session.user.id,
          session.user.name,
          session.user.email,
        );
        await tx.insert(workspaces).values({ id, name });
        await tx
          .insert(memberships)
          .values({
            id: crypto.randomUUID(),
            workspaceId: id,
            userId: session.user.id,
            role: "owner",
          });
        await saveWorkspace(tx, w);
        return w;
      });
      return Response.json({ workspace: w });
    }
    const [m] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, session.user.id))
      .limit(1);
    if (!m) throw new DomainError("session");
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, m.workspaceId))
        .for("update");
      const [membership] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, m.workspaceId),
            eq(memberships.userId, session.user.id),
          ),
        );
      if (!membership) throw new DomainError("forbidden");
      const current = await loadWorkspace(tx, row.id, session.user.id);
      const actor = current.members.find((x) => x.id === session.user.id);
      if (!actor) throw new DomainError("forbidden");
      actor.role = membership.role as Role;
      let next = current;
      if (body.type === "member.add") {
        if (!can(actor.role, "user.manage")) throw new DomainError("forbidden");
        const { email } = z.object({ email: z.email().max(254) }).parse(body);
        const [account] = await tx
          .select()
          .from(user)
          .where(eq(user.email, email.toLowerCase()));
        if (!account) throw new DomainError("email");
        if (current.members.some((x) => x.id === account.id))
          throw new DomainError("conflict");
        next = structuredClone(current);
        next.members.push({
          id: account.id,
          name: account.name,
          email: account.email,
          role: "member",
          teamId: null,
        });
        await tx
          .insert(memberships)
          .values({
            id: crypto.randomUUID(),
            workspaceId: row.id,
            userId: account.id,
            role: "member",
          });
      } else {
        const command = commandSchema.parse(body);
        next = applyCommand(current, command);
        if (command.type === "member.update")
          await tx
            .update(memberships)
            .set({ role: command.role })
            .where(
              and(
                eq(memberships.workspaceId, row.id),
                eq(memberships.userId, command.id),
              ),
            );
      }
      await saveWorkspace(tx, next, current);
      await tx
        .update(workspaces)
        .set({ version: row.version + 1 })
        .where(eq(workspaces.id, row.id));
      await tx
        .insert(auditLogs)
        .values({
          id: crypto.randomUUID(),
          workspaceId: row.id,
          actorId: session.user.id,
          action: body.type,
          entityId: body.id ?? null,
          detail: { command: body },
        });
      return visibleWorkspace(next);
    });
    return Response.json(
      { workspace: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DomainError)
      return Response.json(
        { error: error.code },
        { status: error.code === "conflict" ? 409 : 403 },
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "invalid" }, { status: 400 });
    console.error("Workspace operation failed");
    return Response.json({ error: "invalid" }, { status: 500 });
  }
}
