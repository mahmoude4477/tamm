import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { integrationIdentity, checkKey } from "@/lib/v2/integrations";
import {
  applyCommand,
  commandSchema,
  DomainError,
  visibleWorkspace,
} from "@/lib/commands";
import { lockedWorkspace, apiError } from "@/lib/server-context";
import { saveWorkspace } from "@/db/workspace";
import { notifyChanges } from "@/lib/notifications";
export async function POST(request: Request) {
  try {
    const { key } = await integrationIdentity(request, "tasks:write"),
      raw = await request.text();
    if (raw.length > 100000) throw new DomainError("invalid");
    const c = commandSchema.parse(JSON.parse(raw));
    if (
      ![
        "task.create",
        "task.update",
        "task.review",
        "task.comment",
        "task.archive",
        "task.delete",
      ].includes(c.type)
    )
      throw new DomainError("forbidden");
    const result = await db.transaction(async (tx) => {
      const current = await lockedWorkspace(tx, key.workspaceId, key.userId);
      await checkKey(tx, key.id);
      const [account] = await tx
        .select()
        .from(s.user)
        .where(eq(s.user.id, key.userId));
      if (!account || account.banned) throw new DomainError("suspended");
      const next = applyCommand(current, c),
        changed = next.tasks.filter(
          (t) =>
            JSON.stringify(t) !==
            JSON.stringify(current.tasks.find((x) => x.id === t.id)),
        );
      if (key.projectId) {
        const target =
          "id" in c ? current.tasks.find((t) => t.id === c.id) : undefined;
        if (
          (target && target.projectId !== key.projectId) ||
          changed.some(
            (t) =>
              t.projectId !== key.projectId ||
              current.tasks.find(
                (x) => x.id === t.id && x.projectId !== key.projectId,
              ),
          )
        )
          throw new DomainError("forbidden");
        for (const t of changed)
          if (
            t.dependencyIds.some(
              (id) =>
                !next.tasks.some(
                  (x) => x.id === id && x.projectId === key.projectId,
                ),
            ) ||
            t.relatedIds?.some(
              (id) =>
                !next.tasks.some(
                  (x) => x.id === id && x.projectId === key.projectId,
                ),
            )
          )
            throw new DomainError("forbidden");
      }
      await saveWorkspace(tx, next, current);
      await notifyChanges(tx, current, next);
      await tx
        .insert(s.auditLogs)
        .values({
          id: crypto.randomUUID(),
          workspaceId: key.workspaceId,
          actorId: key.userId,
          action: c.type,
          entityId: changed[0]?.id ?? null,
          detail: { integrationKeyId: key.id, command: c },
        });
      return {
        tasks: visibleWorkspace(next).tasks.filter((t) =>
          changed.some((x) => x.id === t.id),
        ),
      };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
