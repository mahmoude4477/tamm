import "server-only";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { loadWorkspace, type Transaction } from "@/db/workspace";
import { DomainError } from "../commands";
import { canSeeProject } from "../permissions";
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => `tamm_${randomBytes(32).toString("base64url")}`;
function cipherKey() {
  const key = process.env.WEBHOOK_SECRET_KEY;
  if (!key || key.length < 32) throw new DomainError("unavailable");
  return createHash("sha256").update(key).digest();
}
export function seal(secret: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", cipherKey(), iv);
  return Buffer.concat([
    iv,
    c.update(secret),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
export function unseal(value: string) {
  const b = Buffer.from(value, "base64"),
    c = createDecipheriv("aes-256-gcm", cipherKey(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString();
}
export function validateHookUrl(value: string) {
  const url = new URL(value);
  const allowed = (process.env.WEBHOOK_ALLOWED_ORIGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed.includes(url.origin)
  )
    throw new DomainError("forbidden");
  return url;
}
export async function integrationIdentity(
  request: Request,
  scope: string,
  queryToken = false,
) {
  const value = queryToken
    ? new URL(request.url).searchParams.get("token")
    : request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!value || !/^tamm_[A-Za-z0-9_-]{43}$/.test(value))
    throw new DomainError("session");
  const result = await db.execute<{ id: string }>(
    sql`update integration_key set requests=case when window_at<now()-interval '1 minute' then 1 else requests+1 end,window_at=case when window_at<now()-interval '1 minute' then now() else window_at end where hash=${hashToken(value)} and revoked_at is null and expires_at>now() and (window_at<now()-interval '1 minute' or requests<120) returning id`,
  );
  if (!result.rows[0]) {
    const [active] = await db
      .select()
      .from(s.integrationKeys)
      .where(
        and(
          eq(s.integrationKeys.hash, hashToken(value)),
          sql`${s.integrationKeys.revokedAt} is null and ${s.integrationKeys.expiresAt}>now()`,
        ),
      );
    throw new DomainError(active ? "limit" : "forbidden");
  }
  const [key] = await db
    .select()
    .from(s.integrationKeys)
    .where(eq(s.integrationKeys.id, result.rows[0].id));
  if (!key.scopes.includes(scope)) throw new DomainError("forbidden");
  const [account] = await db
    .select()
    .from(s.user)
    .where(eq(s.user.id, key.userId));
  if (!account || account.banned) throw new DomainError("suspended");
  const workspace = await db.transaction((tx) =>
    loadWorkspace(tx, key.workspaceId, key.userId),
  );
  if (
    !workspace.members.some((m) => m.id === key.userId && m.active !== false) ||
    (key.projectId && !canSeeProject(workspace, key.projectId))
  )
    throw new DomainError("forbidden");
  return { key, workspace };
}
export async function checkKey(tx: Transaction, id: string) {
  const [key] = await tx
    .select()
    .from(s.integrationKeys)
    .where(eq(s.integrationKeys.id, id));
  if (!key || key.revokedAt || key.expiresAt < new Date())
    throw new DomainError("forbidden");
  return key;
}
// The worker's global advisory lock serializes dispatch. Unique endpoint/event pairs make enqueue idempotent.
export async function deliverWebhooks() {
  const endpoints = await db
    .select()
    .from(s.webhookEndpoints)
    .where(eq(s.webhookEndpoints.enabled, true))
    .orderBy(s.webhookEndpoints.lastPolledAt, s.webhookEndpoints.id)
    .limit(100);
  let delivered = 0,
    attempts = 0;
  for (const endpoint of endpoints.slice(0, 100)) {
    try {
      await db
        .update(s.webhookEndpoints)
        .set({ lastPolledAt: new Date() })
        .where(eq(s.webhookEndpoints.id, endpoint.id));
      validateHookUrl(endpoint.url);
      const [account] = await db
        .select()
        .from(s.user)
        .where(eq(s.user.id, endpoint.userId));
      const w = await db.transaction((tx) =>
        loadWorkspace(tx, endpoint.workspaceId, endpoint.userId),
      );
      const project = w.projects.find((p) => p.id === endpoint.projectId);
      if (
        !account ||
        account.banned ||
        !canSeeProject(w, endpoint.projectId) ||
        !project ||
        project.deletedAt ||
        project.archived
      )
        continue;
      await db.execute(sql`insert into webhook_delivery(id,workspace_id,endpoint_id,event_id,payload)
   select gen_random_uuid()::text,e.workspace_id,${endpoint.id},e.id,jsonb_build_object('id',e.id,'type',e.action,'workspaceId',e.workspace_id,'projectId',${endpoint.projectId}::text,'taskId',e.task_id,'occurredAt',e.created_at)
   from activity_event e left join task t on t.id=e.task_id where e.workspace_id=${endpoint.workspaceId} and coalesce(e.project_id,t.project_id)=${endpoint.projectId} and e.created_at::timestamptz>=${endpoint.createdAt} and e.action not like 'comment.%'
   and not exists(select 1 from webhook_delivery d where d.endpoint_id=${endpoint.id} and d.event_id=e.id) order by e.created_at,e.id limit 50 on conflict do nothing`);
      const pending = await db
        .select()
        .from(s.webhookDeliveries)
        .where(
          and(
            eq(s.webhookDeliveries.endpointId, endpoint.id),
            sql`${s.webhookDeliveries.deliveredAt} is null and ${s.webhookDeliveries.attempts}<5 and ${s.webhookDeliveries.nextAt}<=now()`,
          ),
        )
        .orderBy(s.webhookDeliveries.nextAt)
        .limit(10);
      for (const d of pending) {
        if (attempts++ >= 20) return delivered;
        let status = 0;
        try {
          const body = JSON.stringify(d.payload),
            stamp = Math.floor(Date.now() / 1000).toString(),
            signature = createHmac("sha256", unseal(endpoint.encryptedSecret))
              .update(`${stamp}.${body}`)
              .digest("hex");
          const r = await fetch(endpoint.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Tamm-Id": d.id,
              "X-Tamm-Timestamp": stamp,
              "X-Tamm-Signature": `sha256=${signature}`,
            },
            body,
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          status = r.status;
          await r.body?.cancel();
        } catch {}
        const ok = status >= 200 && status < 300;
        await db
          .update(s.webhookDeliveries)
          .set({
            attempts: d.attempts + 1,
            lastStatus: status,
            deliveredAt: ok ? new Date() : null,
            nextAt: new Date(
              Date.now() + Math.min(3600, 60 * 2 ** d.attempts) * 1000,
            ),
          })
          .where(eq(s.webhookDeliveries.id, d.id));
        if (ok) delivered++;
      }
    } catch {
      /* Endpoint failures remain retryable; no credentials or payloads in logs. */
    }
  }
  return delivered;
}
