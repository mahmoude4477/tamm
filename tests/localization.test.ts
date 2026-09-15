import { test } from "node:test";
import assert from "node:assert/strict";
import en from "../src/messages/en.json";
import ar from "../src/messages/ar.json";
function paths(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) =>
      paths(v, `${prefix}.${k}`),
    );
  return [prefix];
}
test("Arabic and English dictionaries cover the same interface copy", () =>
  assert.deepEqual(paths(ar).sort(), paths(en).sort()));
