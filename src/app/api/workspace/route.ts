import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loadWorkspace, saveWorkspace } from "@/db/workspace";
import { workspaces, memberships, auditLogs, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  applyCommand,
  commandSchema,
  DomainError,
  visibleWorkspace,
} from "@/lib/commands";
import {
  getIdentity,
  resolveMembership,
  checkOrigin,
  apiError,
} from "@/lib/server-context";
import { notifyChanges } from "@/lib/notifications";
import { createWorkspace } from "@/lib/demo";
import { can } from "@/lib/permissions";
import type { Workspace } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const identity = await getIdentity(request),
      member = await resolveMembership(
        request,
        identity.user.id,
        identity.session.activeOrganizationId,
      );
    if (!member)
      return Response.json(
        { workspace: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    let data = await db.transaction(
      (tx) => loadWorkspace(tx, member.workspaceId, identity.user.id),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    if (!data.statuses.length)
      data = await db.transaction(async (tx) => {
        await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, member.workspaceId))
          .for("update");
        const current = await loadWorkspace(
          tx,
          member.workspaceId,
          identity.user.id,
        );
        if (!current.statuses.length) {
          current.statuses = createWorkspace(
            current.id,
            current.name,
            identity.user.id,
            identity.user.name,
            identity.user.email,
          ).statuses;
          await saveWorkspace(tx, current);
        }
        return current;
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
    const identity = await getIdentity(request);
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
      const workspace = await db.transaction(async (tx) => {
        await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, organization.id))
          .for("update");
        const current = await loadWorkspace(
          tx,
          organization.id,
          identity.user.id,
        );
        current.statuses = createWorkspace(
          current.id,
          name,
          identity.user.id,
          identity.user.name,
          identity.user.email,
        ).statuses;
        await saveWorkspace(tx, current);
        await tx
          .insert(auditLogs)
          .values({
            id: crypto.randomUUID(),
            workspaceId: current.id,
            actorId: identity.user.id,
            action: "workspace.created",
            entityId: current.id,
            detail: { name },
          });
        return current;
      });
      return Response.json(
        { workspace },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const member = await resolveMembership(
      request,
      identity.user.id,
      identity.session.activeOrganizationId,
    );
    if (!member) throw new DomainError("forbidden");
    const workspace = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, member.workspaceId))
        .for("update");
      if (!row) throw new DomainError("forbidden");
      const current = await loadWorkspace(tx, row.id, identity.user.id),
        actor = current.members.find((m) => m.id === identity.user.id);
      if (!actor || actor.active === false) throw new DomainError("forbidden");
      let next = current;
      if (body.type === "member.add") {
        if (!can(actor.role, "user.manage", actor.permissions))
          throw new DomainError("forbidden");
        const { email } = z.object({ email: z.email().max(254) }).parse(body);
        const [account] = await tx
          .select()
          .from(user)
          .where(eq(user.email, email.toLowerCase()));
        if (!account || account.banned) throw new DomainError("email");
        if (current.members.some((m) => m.id === account.id))
          throw new DomainError("conflict");
        next = structuredClone(current);
        next.members.push({
          id: account.id,
          name: account.name,
          email: account.email,
          role: "member",
          teamId: null,
          active: true,
        });
        await tx
          .insert(memberships)
          .values({
            id: crypto.randomUUID(),
            workspaceId: row.id,
            userId: account.id,
            role: "member",
          });
        next.events.push({
          id: crypto.randomUUID(),
          actorId: actor.id,
          taskId: null,
          action: "member.added",
          text: account.name,
          createdAt: new Date().toISOString(),
        });
      } else next = applyCommand(current, commandSchema.parse(body));
      await saveWorkspace(tx, next, current);
      await notifyChanges(tx, current, next);
      await tx
        .update(workspaces)
        .set({ version: row.version + 1 })
        .where(eq(workspaces.id, row.id));
      const entityId =
        body.id ??
        next.tasks.find((t) => !current.tasks.some((old) => old.id === t.id))
          ?.id ??
        next.projects.find(
          (p) => !current.projects.some((old) => old.id === p.id),
        )?.id ??
        next.members.find(
          (m) => !current.members.some((old) => old.id === m.id),
        )?.id ??
        next.customRoles?.find(
          (r) => !current.customRoles?.some((old) => old.id === r.id),
        )?.id;
      await tx
        .insert(auditLogs)
        .values({
          id: crypto.randomUUID(),
          workspaceId: row.id,
          actorId: actor.id,
          action: body.type,
          entityId: entityId ?? null,
          detail: {
            command: body,
            before: auditEntity(current, { ...body, id: entityId }),
            after: auditEntity(next, { ...body, id: entityId }),
          },
        });
      return visibleWorkspace(next);
    });
    return Response.json(
      { workspace },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
function auditEntity(
  w: Workspace,
  body: { id?: string; type: string; items?: { id: string }[] },
) {
  if (body.items)
    return w.tasks.filter((t) => body.items!.some((i) => i.id === t.id));
  if (body.type === "settings.update")
    return { name: w.name, settings: w.settings };
  if (body.type === "workflow.reorder") return w.statuses;
  return (
    [
      w.tasks,
      w.projects,
      w.members,
      w.statuses,
      w.teams,
      w.departments,
      w.customRoles ?? [],
      w.events,
    ]
      .flat()
      .find((item) => item.id === body.id) ?? null
  );
}
