import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { milestones } from "@/db/schema";
import { integrationIdentity } from "@/lib/v2/integrations";
import { escapeCalendar, foldCalendar } from "@/lib/v2/model";
import { visibleWorkspace } from "@/lib/commands";
import { workspaceContext, apiError } from "@/lib/server-context";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams,
      token = q.has("token"),
      ctx = token
        ? await integrationIdentity(request, "calendar:read", true)
        : null;
    const w = visibleWorkspace(
        ctx?.workspace ?? (await workspaceContext(request)).workspace,
      ),
      projectId = ctx?.key.projectId || q.get("projectId"),
      projects = w.projects.filter(
        (p) =>
          !p.deletedAt && !p.archived && (!projectId || p.id === projectId),
      );
    const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, ""),
      lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tamm//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
      ];
    const event = (id: string, title: string, date: string, url: string) => {
      const next = new Date(Date.parse(date) + 86400000)
        .toISOString()
        .slice(0, 10);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${id}@tamm`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${next.replaceAll("-", "")}`,
        `SUMMARY:${escapeCalendar(title)}`,
        `URL:${url}`,
        "END:VEVENT",
      );
    };
    for (const t of w.tasks.filter(
      (t) =>
        !t.deletedAt &&
        !t.archived &&
        t.dueDate &&
        projects.some((p) => p.id === t.projectId),
    )) {
      event(
        t.id,
        t.title,
        t.dueDate!,
        `${process.env.BETTER_AUTH_URL}/workspace?task=${encodeURIComponent(t.id)}&workspaceId=${encodeURIComponent(w.id)}`,
      );
    }
    if (projects.length) {
      const ms = await db
        .select()
        .from(milestones)
        .where(
          and(
            eq(milestones.workspaceId, w.id),
            inArray(
              milestones.projectId,
              projects.map((p) => p.id),
            ),
            eq(milestones.archived, false),
          ),
        );
      for (const m of ms)
        event(
          m.id,
          m.name,
          m.dueDate,
          `${process.env.BETTER_AUTH_URL}/workspace?workspaceId=${encodeURIComponent(w.id)}`,
        );
    }
    lines.push("END:VCALENDAR");
    return new Response(lines.map(foldCalendar).join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=tamm.ics",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
