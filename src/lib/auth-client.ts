"use client";
import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
export const authClient = createAuthClient({
  plugins: [
    organizationClient({ teams: { enabled: true } }),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.assign("/verify-2fa");
      },
    }),
    passkeyClient(),
  ],
});
