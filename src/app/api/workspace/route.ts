import { notifyChanges } from "@/lib/notifications";
import {
  getIdentity,
  resolveMembership,
  checkOrigin,
  apiError,
} from "@/lib/server-context";
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
export async function GET(request: Request) {
  try {
    const session = await getIdentity(request);
    const m = await resolveMembership(
      request,
      session.user.id,
      session.session.activeOrganizationId,
    );
    if (!m) return Response.json({ workspace: null });
    const data = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, m.workspaceId))
        .for("update");
      let w = await loadWorkspace(tx, m.workspaceId, session.user.id);
      if (!w.statuses.length) {
        w.statuses = createWorkspace(
          w.id,
          w.name,
          session.user.id,
          session.user.name,
          session.user.email,
        ).statuses;
        await saveWorkspace(tx, w);
      }
      return w;
    });
    return Response.json(
      { workspace: visibleWorkspace(data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const session = await getIdentity(request);
    const raw = await request.text();
    if (raw.length > 100000)
      return Response.json({ error: "invalid" }, { status: 413 });
    const body = JSON.parse(raw);
    if (body.type === "workspace.create") {
      const { name } = z
        .object({ name: z.string().trim().min(1).max(100) })
        .parse(body);
      const organization = await auth.api.createOrganization({
        headers: request.headers,
        body: { name, slug: `tamm-${crypto.randomUUID()}` },
      });
      if (!organization) throw new DomainError("invalid");
      const w = await db.transaction(async (tx) => {
        await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, organization.id))
          .for("update");
        const current = await loadWorkspace(
          tx,
          organization.id,
          session.user.id,
        );
        current.statuses = createWorkspace(
          current.id,
          name,
          session.user.id,
          session.user.name,
          session.user.email,
        ).statuses;
        await saveWorkspace(tx, current);
        return current;
      });
      return Response.json({ workspace: w });
    }
    const m = await resolveMembership(
      request,
      session.user.id,
      session.session.activeOrganizationId,
    );
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
      if (!membership || !membership.active) throw new DomainError("forbidden");
      const current = await loadWorkspace(tx, row.id, session.user.id);
      const actor = current.members.find((x) => x.id === session.user.id);
      if (!actor) throw new DomainError("forbidden");
      actor.role = membership.role as Role;
      let next = current;
      if (body.type === "member.add") {
        if (!can(actor.role, "user.manage", actor.permissions))
          throw new DomainError("forbidden");
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
        await tx.insert(memberships).values({
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
      await notifyChanges(tx, current, next);
      await tx
        .update(workspaces)
        .set({ version: row.version + 1 })
        .where(eq(workspaces.id, row.id));
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: row.id,
        actorId: session.user.id,
        action: body.type,
        entityId: body.id ?? null,
        detail: {
          command: body,
          before: body.id
            ? (current.tasks.find((t) => t.id === body.id) ??
              current.projects.find((p) => p.id === body.id) ??
              current.members.find((m) => m.id === body.id))
            : null,
          after: body.id
            ? (next.tasks.find((t) => t.id === body.id) ??
              next.projects.find((p) => p.id === body.id) ??
              next.members.find((m) => m.id === body.id))
            : null,
        },
      });
      return visibleWorkspace(next);
    });
    return Response.json(
      { workspace: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
