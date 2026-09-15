import "server-only";
import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization, twoFactor } from "better-auth/plugins";
import {
  defaultAc,
  ownerAc,
  adminAc,
} from "better-auth/plugins/organization/access";
import { passkey } from "@better-auth/passkey";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { can, permissionKeys } from "./permissions";
import type { Role } from "./types";
import { sendMail } from "./email";
import en from "@/messages/en.json";
// Invitation access is always checked against application permissions below.
const delegatedInvitations = defaultAc.newRole({
  invitation: ["create", "cancel"],
  ac: ["read"],
});
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.ALLOW_REGISTRATION !== "true",
    minPasswordLength: 12,
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendMail(
        user.email,
        en.mail.resetSubject,
        `${en.mail.resetBody}\n\n${url}`,
      ),
  },
  emailVerification: {
    sendOnSignUp: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendMail(
        user.email,
        en.mail.verifySubject,
        `${en.mail.verifyBody}\n\n${url}`,
      ),
  },
  rateLimit: { enabled: true },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // A suspended installation account cannot create or continue a session.
      const email =
        typeof ctx.body?.email === "string"
          ? ctx.body.email.toLowerCase()
          : null;
      if (email) {
        const [u] = await db
          .select({ banned: schema.user.banned })
          .from(schema.user)
          .where(eq(schema.user.email, email));
        if (u?.banned)
          throw new APIError("FORBIDDEN", { message: en.errors.suspended });
      }
      const session = await getSessionFromCtx(ctx);
      if (session) {
        const [u] = await db
          .select({ banned: schema.user.banned })
          .from(schema.user)
          .where(eq(schema.user.id, session.user.id));
        if (u?.banned)
          throw new APIError("FORBIDDEN", { message: en.errors.suspended });
        let organizationId =
          typeof ctx.body?.organizationId === "string"
            ? ctx.body.organizationId
            : typeof ctx.query?.organizationId === "string"
              ? ctx.query.organizationId
              : (session.session as { activeOrganizationId?: string })
                  .activeOrganizationId;
        if (typeof ctx.body?.invitationId === "string") {
          const [invite] = await db
            .select()
            .from(schema.invitation)
            .where(eq(schema.invitation.id, ctx.body.invitationId));
          if (invite) organizationId = invite.organizationId;
        }
        if (typeof ctx.body?.teamId === "string") {
          const [team] = await db
            .select()
            .from(schema.teams)
            .where(eq(schema.teams.id, ctx.body.teamId));
          if (team) organizationId = team.workspaceId;
        }
        if (organizationId && ctx.path.startsWith("/organization/")) {
          const [m] = await db
            .select()
            .from(schema.memberships)
            .where(
              and(
                eq(schema.memberships.workspaceId, organizationId),
                eq(schema.memberships.userId, session.user.id),
              ),
            );
          if (
            [
              "/organization/invite-member",
              "/organization/cancel-invitation",
              "/organization/create-team",
              "/organization/update-team",
              "/organization/add-team-member",
              "/organization/remove-team-member",
            ].includes(ctx.path)
          ) {
            if (!m)
              throw new APIError("FORBIDDEN", { message: en.errors.forbidden });
            const [role] = m.customRoleId
              ? await db
                  .select()
                  .from(schema.customRoles)
                  .where(
                    and(
                      eq(schema.customRoles.id, m.customRoleId),
                      eq(schema.customRoles.workspaceId, m.workspaceId),
                    ),
                  )
              : [];
            const permissions = m.customRoleId
              ? (role?.permissions ?? [])
              : undefined;
            if (!can(m.role, "user.manage", permissions))
              throw new APIError("FORBIDDEN", { message: en.errors.forbidden });
            if (ctx.path === "/organization/invite-member") {
              const requestedRole = ctx.body?.role;
              if (
                typeof requestedRole !== "string" ||
                !["owner", "admin", "manager", "member", "viewer"].includes(
                  requestedRole,
                ) ||
                permissionKeys.some(
                  (permission) =>
                    can(requestedRole as Role, permission) &&
                    !can(m.role, permission, permissions),
                )
              )
                throw new APIError("FORBIDDEN", {
                  message: en.errors.forbidden,
                });
            }
          }
          if (m?.active === false)
            throw new APIError("FORBIDDEN", { message: en.errors.suspended });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const actions: Record<string, string> = {
        "/organization/invite-member": "invitation.created",
        "/organization/accept-invitation": "invitation.accepted",
        "/organization/cancel-invitation": "invitation.cancelled",
      };
      const action = actions[ctx.path];
      if (
        !action ||
        !ctx.context.session ||
        ctx.context.returned instanceof APIError
      )
        return;
      const result = ctx.context.returned as { id?: string };
      const id =
        typeof ctx.body?.invitationId === "string"
          ? ctx.body.invitationId
          : result?.id;
      if (!id) return;
      const [invitation] = await db
        .select()
        .from(schema.invitation)
        .where(eq(schema.invitation.id, id));
      if (!invitation) return;
      await db.insert(schema.auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: invitation.organizationId,
        actorId: ctx.context.session.user.id,
        action,
        entityId: id,
        detail: {
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
        },
      });
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [u] = await db
            .select({ banned: schema.user.banned })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId));
          if (!u || u.banned) return false;
          return { data: session };
        },
      },
    },
  },
  plugins: [
    organization({
      schema: {
        organization: { modelName: "workspaces" },
        member: {
          modelName: "memberships",
          fields: { organizationId: "workspaceId" },
        },
        team: { modelName: "teams", fields: { organizationId: "workspaceId" } },
      },
      teams: { enabled: true, defaultTeam: { enabled: false } },
      disableOrganizationDeletion: true,
      roles: {
        owner: ownerAc,
        admin: adminAc,
        member: delegatedInvitations,
        manager: delegatedInvitations,
        viewer: delegatedInvitations,
      },
      sendInvitationEmail: async (data) =>
        sendMail(
          data.email,
          en.mail.inviteSubject,
          `${data.inviter.user.name} ${en.mail.inviteBody} ${data.organization.name}.\n\n${process.env.BETTER_AUTH_URL}/invite?id=${encodeURIComponent(data.id)}`,
        ),
      organizationHooks: {
        beforeUpdateMemberRole: async () => {
          throw new APIError("BAD_REQUEST", {
            message: en.errors.useAdministration,
          });
        },
        beforeRemoveMember: async () => {
          throw new APIError("BAD_REQUEST", {
            message: en.errors.deactivateInstead,
          });
        },
        beforeDeleteTeam: async () => {
          throw new APIError("BAD_REQUEST", {
            message: en.errors.deactivateInstead,
          });
        },
        beforeAcceptInvitation: async ({ user }) => {
          if (
            process.env.REQUIRE_EMAIL_VERIFICATION === "true" &&
            !user.emailVerified
          )
            throw new APIError("FORBIDDEN", { message: en.errors.verifyEmail });
        },
      },
    }),
    twoFactor({ issuer: "Tamm" }),
    passkey({ rpName: "Tamm" }),
  ],
});
