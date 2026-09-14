import "server-only";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "@/db";
import { memberships, user, workspaces } from "@/db/schema";
import { loadWorkspace, type Transaction } from "@/db/workspace";
import { DomainError } from "./commands";
import { can, type Permission } from "./permissions";
export async function getIdentity(request: Request) {
  const identity = await auth.api.getSession({ headers: request.headers });
  if (!identity) throw new DomainError("session");
  const [account] = await db
    .select({ banned: user.banned })
    .from(user)
    .where(eq(user.id, identity.user.id));
  if (!account || account.banned) throw new DomainError("suspended");
  return identity;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !process.env.BETTER_AUTH_URL ||
    origin !== new URL(process.env.BETTER_AUTH_URL).origin
  )
    throw new DomainError("forbidden");
}
export async function resolveMembership(
  request: Request,
  userId: string,
  activeId?: string | null,
) {
  const id =
    request.headers.get("x-workspace-id") ||
    new URL(request.url).searchParams.get("workspaceId") ||
    activeId;
  const query = id
    ? and(
        eq(memberships.workspaceId, id),
        eq(memberships.userId, userId),
        eq(memberships.active, true),
      )
    : and(eq(memberships.userId, userId), eq(memberships.active, true));
  const [member] = await db.select().from(memberships).where(query).limit(1);
  return member;
}
export async function workspaceContext(
  request: Request,
  permission?: Permission,
) {
  const identity = await getIdentity(request);
  const member = await resolveMembership(
    request,
    identity.user.id,
    identity.session.activeOrganizationId,
  );
  if (!member) throw new DomainError("forbidden");
  const workspace = await db.transaction((tx) =>
    loadWorkspace(tx, member.workspaceId, identity.user.id),
  );
  const actor = workspace.members.find((m) => m.id === identity.user.id)!;
  if (
    actor.active === false ||
    (permission && !can(actor.role, permission, actor.permissions))
  )
    throw new DomainError("forbidden");
  return { identity, member, workspace, actor };
}
export async function lockedWorkspace(
  tx: Transaction,
  workspaceId: string,
  userId: string,
) {
  await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for("update");
  const w = await loadWorkspace(tx, workspaceId, userId);
  if (!w.members.some((m) => m.id === userId && m.active !== false))
    throw new DomainError("forbidden");
  return w;
}
export function apiError(error: unknown) {
  const code =
    error instanceof DomainError
      ? error.code
      : typeof error === "object" &&
          error &&
          "domain" in error &&
          "code" in error
        ? String(error.code)
        : "invalid";
  return Response.json(
    { error: code },
    {
      status:
        code === "session"
          ? 401
          : code === "conflict"
            ? 409
            : code === "invalid"
              ? 400
              : 403,
    },
  );
}
