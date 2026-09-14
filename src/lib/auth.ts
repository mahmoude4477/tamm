import "server-only";
import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization, twoFactor } from "better-auth/plugins";
import {
  defaultAc,
  ownerAc,
  adminAc,
  memberAc,
} from "better-auth/plugins/organization/access";
import { passkey } from "@better-auth/passkey";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendMail } from "./email";
import en from "@/messages/en.json";
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
      const session = ctx.path.startsWith("/organization/")
        ? await getSessionFromCtx(ctx)
        : ctx.context.session;
      if (session) {
        const [u] = await db
          .select({ banned: schema.user.banned })
          .from(schema.user)
          .where(eq(schema.user.id, session.user.id));
        if (u?.banned)
          throw new APIError("FORBIDDEN", { message: en.errors.suspended });
        const organizationId =
          typeof ctx.body?.organizationId === "string"
            ? ctx.body.organizationId
            : (session.session as { activeOrganizationId?: string })
                .activeOrganizationId;
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
          if (m?.active === false)
            throw new APIError("FORBIDDEN", { message: en.errors.suspended });
        }
      }
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
        member: memberAc,
        manager: memberAc,
        viewer: defaultAc.newRole({}),
      },
      sendInvitationEmail: async (data) =>
        sendMail(
          data.email,
          en.mail.inviteSubject,
          `${data.inviter.user.name} ${en.mail.inviteBody} ${data.organization.name}.\n\n${process.env.BETTER_AUTH_URL}/invite?id=${encodeURIComponent(data.id)}`,
        ),
      organizationHooks: {
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
