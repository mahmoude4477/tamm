import { setTimeout } from "node:timers/promises";
if (
  !process.env.JOBS_SECRET ||
  process.env.JOBS_SECRET.length < 32 ||
  !process.env.BETTER_AUTH_URL
)
  throw Error("Configure JOBS_SECRET and BETTER_AUTH_URL");
const once = process.argv.includes("--once");
do {
  try {
    const response = await fetch(
      new URL("/api/jobs", process.env.BETTER_AUTH_URL),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.JOBS_SECRET}` },
        signal: AbortSignal.timeout(300000),
      },
    );
    if (!response.ok) throw Error(`Job request failed (${response.status})`);
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        ...(await response.json()),
      }),
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Job request failed");
    if (once) process.exitCode = 1;
  }
  if (!once) await setTimeout(60000);
} while (!once);
