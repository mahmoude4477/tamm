import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
const base = "http://localhost:3000",
  password = "mfa-test-password-78Sz!";
function cookies(previous, response) {
  const jar = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i), c.slice(i + 1)];
      }),
  );
  for (const c of response.headers.getSetCookie()) {
    const pair = c.split(";")[0],
      i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function call(path, body, cookie = "", expected = 200) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: base,
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.clone().json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return { data, cookie: cookies(cookie, response) };
}
const signup = await call("/api/auth/sign-up/email", {
  name: "MFA Example",
  email: "mfa@example.com",
  password,
});
const enabled = await call(
  "/api/auth/two-factor/enable",
  { password },
  signup.cookie,
);
assert.equal(enabled.data.method, "totp");
assert.ok(enabled.data.backupCodes.length);
const secret = new URL(enabled.data.totpURI).searchParams.get("secret"),
  alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let bits = "";
for (const char of secret.toUpperCase().replaceAll("=", ""))
  bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
const bytes = [];
for (let i = 0; i + 8 <= bits.length; i += 8)
  bytes.push(parseInt(bits.slice(i, i + 8), 2));
const counter = Buffer.alloc(8);
counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest(),
  offset = digest.at(-1) & 15,
  code = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
const verified = await call(
  "/api/auth/two-factor/verify-totp",
  { code },
  enabled.cookie,
);
const session = await call("/api/auth/get-session", undefined, verified.cookie);
assert.equal(session.data.user.twoFactorEnabled, true);
const login = await call("/api/auth/sign-in/email", {
  email: "mfa@example.com",
  password,
});
assert.equal(login.data.twoFactorRedirect, true);
const second = await call(
  "/api/auth/two-factor/verify-backup-code",
  { code: enabled.data.backupCodes[0] },
  login.cookie,
);
const signedIn = await call("/api/auth/get-session", undefined, second.cookie);
assert.ok(signedIn.data.user.id);
const replay = await fetch(base + "/api/auth/two-factor/verify-backup-code", {
  method: "POST",
  headers: {
    Origin: base,
    Cookie: second.cookie,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ code: enabled.data.backupCodes[0] }),
});
assert.ok(replay.status >= 400, "Recovery codes must be one-time use");
await call("/api/auth/revoke-other-sessions", {}, second.cookie);
const revoked = await call("/api/auth/get-session", undefined, verified.cookie);
assert.equal(revoked.data, null);
await call("/api/auth/two-factor/disable", { password }, second.cookie);
execFileSync(
  process.execPath,
  [
    "scripts/accounts.mjs",
    "suspend",
    "--email",
    "mfa@example.com",
    "--actor",
    "owner@example.com",
  ],
  { stdio: "pipe" },
);
await call(
  "/api/auth/sign-in/email",
  { email: "mfa@example.com", password },
  "",
  403,
);
execFileSync(
  process.execPath,
  [
    "scripts/accounts.mjs",
    "activate",
    "--email",
    "mfa@example.com",
    "--actor",
    "owner@example.com",
  ],
  { stdio: "pipe" },
);
const restored = await call("/api/auth/sign-in/email", {
  email: "mfa@example.com",
  password,
});
assert.ok(restored.data.token);
console.log(
  "Account integration passed: TOTP, recovery-code replay prevention, session revocation, and audited suspension/reactivation.",
);
