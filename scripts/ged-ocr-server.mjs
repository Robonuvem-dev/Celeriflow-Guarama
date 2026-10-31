import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createGedOcrEngine } from "./ged-ocr-engine.mjs";

export async function startGedOcrServer({ host = "127.0.0.1", port = 3310, apiKey = "", cachePath, engine = createGedOcrEngine({ cachePath }) } = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && apiKey.length < 32) throw new Error("Configure GED_OCR_API_KEY com pelo menos 32 caracteres para acesso de rede.");
  await engine.initialize();
  let busy = false;
  const server = createServer(async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); };
    if (request.method === "GET" && request.url === "/health") { send(200, { ready: true, engine: "tesseract", language: "por", busy }); return; }
    if (request.method !== "POST" || request.url !== "/ocr") { send(404, { error: "Rota não encontrada." }); return; }
    if (apiKey) {
      const expected = Buffer.from(`Bearer ${apiKey}`), supplied = Buffer.from(request.headers.authorization ?? "");
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401, { error: "Credencial OCR inválida." }); return; }
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) { send(415, { error: "Envie JSON." }); return; }
    if (busy) { response.setHeader("Retry-After", "5"); send(429, { error: "OCR ocupado; repita a operação." }); return; }
    busy = true;
    try {
      let length = 0; const chunks = [];
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 28_100_000) { send(413, { error: "Requisição excede 20 MiB de original." }); return; }
        chunks.push(chunk);
      }
      const result = await engine.recognize(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      send(200, result);
    } catch { send(422, { error: "Não foi possível reconhecer o original; confira formato, páginas e zonas." }); }
    finally { busy = false; }
  });
  server.requestTimeout = 65_000;
  server.headersTimeout = 15_000;
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(port, host, accept); });
  return { server, async close() { server.closeAllConnections(); await new Promise(done => server.close(done)); await engine.terminate(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = await startGedOcrServer({ host: process.env.GED_OCR_HOST || "127.0.0.1", port: Number(process.env.GED_OCR_PORT || 3310), apiKey: process.env.GED_OCR_API_KEY || "", cachePath: process.env.GED_OCR_CACHE_PATH || join(tmpdir(), "opencode", "ged-ocr-cache") });
  console.log(JSON.stringify({ status: "READY", engine: "tesseract", language: "por", port: service.server.address().port }));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
}
