import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { scanUpload } from "../src/lib/scan-upload";
for (const result of [
  "stream: OK\0",
  "stream: Eicar-Test-Signature FOUND\0",
  "stream: ERROR\0",
]) {
  test(`upload scanner handles ${result.replaceAll("\0", "")}`, async () => {
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on("data", (data) => {
        buffer = Buffer.concat([buffer, data]);
        if (buffer.length >= 10 + 4 + 7 + 4) socket.write(result);
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const promise = scanUpload(Buffer.from("example"), {
        host: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
        timeout: 2000,
      });
      if (result.includes(": OK")) await promise;
      else
        await assert.rejects(
          promise,
          result.includes("FOUND") ? /file/ : /scannerUnavailable/,
        );
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
}
