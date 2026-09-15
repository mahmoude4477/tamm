import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/lib/planning/jobs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.JOBS_SECRET,
    provided =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(provided) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  )
    return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    return Response.json(await runJobs(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
