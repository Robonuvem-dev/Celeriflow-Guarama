import { once } from "node:events";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

/** Loopback storage boundary for the actual uploadFile/Vercel SDK. Database,
 * GED, revisions and audit remain their real production implementations. */
export async function createLaboratoryBlobStore() {
  const keys = ["VERCEL_BLOB_API_URL", "BLOB_READ_WRITE_TOKEN", "CELERIFLOW_INSTANCE_ID"] as const;
  const previous = keys.map(key => [key, process.env[key]] as const);
  const files = new Map<string, Buffer>();
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://localhost").searchParams.get("pathname");
      if (request.method !== "PUT" || !pathname) { response.writeHead(400).end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      files.set(pathname, bytes);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ url: `http://127.0.0.1:${port}/${pathname}`, downloadUrl: `http://127.0.0.1:${port}/${pathname}?download=1`, pathname, contentType: "application/pdf", contentDisposition: 'attachment; filename="laudo.pdf"', etag: createHash("sha256").update(bytes).digest("hex") }));
    } catch { response.writeHead(500).end(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("Porta do armazenamento local indisponível.");
  const port = address.port;
  process.env.VERCEL_BLOB_API_URL = `http://127.0.0.1:${port}`;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_diagnostics_fixture";
  process.env.CELERIFLOW_INSTANCE_ID = "diagnostics-fixture";
  return { files, async close() {
    try { server.closeIdleConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    finally { for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  } };
}
