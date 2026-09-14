import { setTimeout } from "node:timers/promises";

// Exercise the real limiter while allowing sequential fixture setup to wait.
export async function testFetch(input, init) {
  for (let attempt = 0; ; attempt++) {
    const response = await globalThis.fetch(input, init);
    if (response.status !== 429 || attempt === 3) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const seconds =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10;
    if (seconds > 60) return response;
    await response.arrayBuffer();
    await setTimeout(Math.ceil(seconds * 1000) + 100);
  }
}
