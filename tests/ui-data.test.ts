import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLabel } from "../src/lib/status-label";
import { createWorkspace } from "../src/lib/demo";
import en from "../src/messages/en.json";
import ar from "../src/messages/ar.json";
import { readRequest } from "../src/lib/read-request";

test("default statuses translate, while renamed and custom statuses keep their names", () => {
  const w = createWorkspace(
    "fixture",
    "Workspace",
    "owner",
    "Owner",
    "owner@example.com",
  );
  assert.equal(statusLabel(w.statuses[1], ar), ar.demo.statuses[1]);
  assert.equal(statusLabel(w.statuses[2], ar), ar.demo.statuses[2]);
  assert.equal(statusLabel(w.statuses[1], en), en.demo.statuses[1]);
  assert.equal(
    statusLabel({ ...w.statuses[1], name: "Legal review" }, ar),
    "Legal review",
  );
  assert.equal(
    statusLabel({ ...w.statuses[1], id: "custom", name: "To do" }, ar),
    "To do",
  );
  assert.equal(statusLabel(undefined, ar), "");
});

test("concurrent reads share transport, consumers can abort independently, and later reads are fresh", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let finish!: (response: Response) => void;
  globalThis.fetch = async () => {
    calls++;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  };
  try {
    const controller = new AbortController();
    const first = readRequest("/api/fixture", { signal: controller.signal });
    const aborted = assert.rejects(first, { name: "AbortError" });
    const second = readRequest("/api/fixture");
    const third = readRequest("/api/fixture");
    controller.abort();
    finish(Response.json({ version: 1 }));
    await aborted;
    assert.deepEqual(await (await second).json(), { version: 1 });
    assert.deepEqual(await (await third).json(), { version: 1 });
    assert.equal(calls, 1);
    const fresh = readRequest("/api/fixture");
    assert.equal(calls, 2);
    finish(Response.json({ version: 2 }));
    assert.deepEqual(await (await fresh).json(), { version: 2 });
  } finally {
    globalThis.fetch = original;
  }
});
