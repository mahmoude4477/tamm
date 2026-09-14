import { and, eq, isNull } from "drizzle-orm";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { attachments, auditLogs } from "@/db/schema";
import {
  workspaceContext,
  checkOrigin,
  apiError,
  lockedWorkspace,
} from "@/lib/server-context";
import { DomainError } from "@/lib/commands";
import { can, canSeeProject } from "@/lib/permissions";
import type { Workspace } from "@/lib/types";
const directory = () =>
  path.resolve(
    /*turbopackIgnore: true*/ process.env.UPLOAD_DIRECTORY ?? ".data/uploads",
  );
const maxSize = 10 * 1024 * 1024;
function scope(w: Workspace, taskId: string | null, projectId: string | null) {
  const task = taskId
    ? w.tasks.find((t) => t.id === taskId && !t.deletedAt)
    : null;
  if (taskId && projectId) throw new DomainError("invalid");
  const project = w.projects.find(
    (p) => p.id === (task?.projectId ?? projectId) && !p.deletedAt,
  );
  if ((taskId && !task) || !project || !canSeeProject(w, project.id))
    throw new DomainError("forbidden");
  return project.id;
}
function mimeFor(data: Buffer, name: string) {
  const ext = name.split(".").at(-1)?.toLowerCase();
  if (
    ext === "png" &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    ["jpg", "jpeg"].includes(ext ?? "") &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255
  )
    return "image/jpeg";
  if (ext === "pdf" && data.subarray(0, 5).toString() === "%PDF-")
    return "application/pdf";
  if (["txt", "csv"].includes(ext ?? "") && !data.includes(0)) {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return "text/plain";
  }
  throw new DomainError("file");
}
export async function GET(request: Request) {
  try {
    const { workspace: w } = await workspaceContext(request);
    const q = new URL(request.url).searchParams;
    const id = q.get("id");
    if (id) {
      const [file] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.id, id),
            eq(attachments.workspaceId, w.id),
            isNull(attachments.deletedAt),
          ),
        );
      if (!file) throw new DomainError("notFound");
      scope(w, file.taskId, file.projectId);
      const bytes = await readFile(
        path.join(/*turbopackIgnore: true*/ directory(), file.storageKey),
      );
      return new Response(bytes, {
        headers: {
          "Content-Type": file.mime,
          "Content-Length": String(bytes.length),
          "Content-Disposition": `${q.get("preview") === "true" && file.mime.startsWith("image/") ? "inline" : "attachment"}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox; default-src 'none'",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const taskId = q.get("taskId"),
      projectId = q.get("projectId");
    scope(w, taskId, projectId);
    const items = await db
      .select({
        id: attachments.id,
        name: attachments.name,
        size: attachments.size,
        mime: attachments.mime,
        taskId: attachments.taskId,
        projectId: attachments.projectId,
        uploadedBy: attachments.uploadedBy,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.workspaceId, w.id),
          taskId
            ? eq(attachments.taskId, taskId)
            : and(
                eq(attachments.projectId, projectId!),
                isNull(attachments.taskId),
              ),
          isNull(attachments.deletedAt),
        ),
      );
    return Response.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  let storageKey: string | undefined;
  try {
    checkOrigin(request);
    const { workspace: w, actor } = await workspaceContext(request);
    if (!can(actor.role, "file.upload", actor.permissions))
      throw new DomainError("forbidden");
    const reader = request.body?.getReader();
    if (!reader) throw new DomainError("invalid");
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxSize + 65536) {
        await reader.cancel();
        throw new DomainError("limit");
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > maxSize)
      throw new DomainError("file");
    const taskId = String(form.get("taskId") ?? "") || null,
      projectId = String(form.get("projectId") ?? "") || null;
    scope(w, taskId, projectId);
    const data = Buffer.from(await file.arrayBuffer());
    const mime = mimeFor(data, file.name);
    const name = path
      .basename(file.name)
      .replace(/[\x00-\x1f\x7f]/g, "")
      .slice(0, 200);
    storageKey = crypto.randomUUID();
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(/*turbopackIgnore: true*/ directory(), storageKey),
      data,
      {
        mode: 0o600,
        flag: "wx",
      },
    );
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const current = await lockedWorkspace(tx, w.id, w.currentUserId);
      scope(current, taskId, projectId);
      if (
        !can(
          current.members.find((m) => m.id === w.currentUserId)!.role,
          "file.upload",
          current.members.find((m) => m.id === w.currentUserId)!.permissions,
        )
      )
        throw new DomainError("forbidden");
      await tx.insert(attachments).values({
        id,
        workspaceId: w.id,
        taskId,
        projectId,
        name,
        size: file.size,
        mime,
        storageKey: storageKey!,
        uploadedBy: w.currentUserId,
      });
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: w.id,
        actorId: w.currentUserId,
        action: "file.uploaded",
        entityId: id,
        detail: { name, taskId, projectId },
      });
    });
    return Response.json({ id });
  } catch (e) {
    if (storageKey)
      await unlink(
        path.join(/*turbopackIgnore: true*/ directory(), storageKey),
      ).catch(() => {});
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const { workspace: w } = await workspaceContext(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new DomainError("invalid");
    await db.transaction(async (tx) => {
      const current = await lockedWorkspace(tx, w.id, w.currentUserId);
      const actor = current.members.find((m) => m.id === w.currentUserId)!;
      if (!can(actor.role, "file.upload", actor.permissions))
        throw new DomainError("forbidden");
      const [file] = await tx
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.id, id),
            eq(attachments.workspaceId, w.id),
            isNull(attachments.deletedAt),
          ),
        );
      if (!file) throw new DomainError("notFound");
      scope(current, file.taskId, file.projectId);
      if (
        file.uploadedBy !== actor.id &&
        !can(actor.role, "task.delete", actor.permissions)
      )
        throw new DomainError("forbidden");
      await tx
        .update(attachments)
        .set({ deletedAt: new Date() })
        .where(eq(attachments.id, id));
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        workspaceId: w.id,
        actorId: actor.id,
        action: "file.deleted",
        entityId: id,
        detail: { name: file.name },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
