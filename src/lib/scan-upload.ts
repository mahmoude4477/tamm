import { createConnection } from "node:net";
// ClamAV INSTREAM sends only bytes, never user-provided paths or commands.
export async function scanUpload(
  data: Buffer,
  options = {
    host: process.env.CLAMAV_HOST,
    port: Number(process.env.CLAMAV_PORT ?? 3310),
    timeout: 10000,
  },
) {
  if (!options.host) return;
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({
      host: options.host!,
      port: options.port,
    });
    let reply = "",
      settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };
    socket.setTimeout(options.timeout, () =>
      finish(Error("scannerUnavailable")),
    );
    socket.on("error", () => finish(Error("scannerUnavailable")));
    socket.on("end", () => {
      if (!settled) finish(Error("scannerUnavailable"));
    });
    socket.on("data", (chunk) => {
      reply += chunk.toString();
      if (reply.length > 4096) return finish(Error("scannerUnavailable"));
      if (reply.includes("\0")) {
        const result = reply.split("\0")[0];
        finish(
          result.endsWith(": OK")
            ? undefined
            : Error(result.endsWith(" FOUND") ? "file" : "scannerUnavailable"),
        );
      }
    });
    socket.on("connect", async () => {
      try {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < data.length; offset += 65536) {
          const chunk = data.subarray(offset, offset + 65536),
            size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          await new Promise<void>((resolve, reject) =>
            socket.write(chunk, (e) => (e ? reject(e) : resolve())),
          );
        }
        socket.write(Buffer.alloc(4));
      } catch {
        finish(Error("scannerUnavailable"));
      }
    });
  });
}
