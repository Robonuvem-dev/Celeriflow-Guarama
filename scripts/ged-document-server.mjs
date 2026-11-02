import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGedDocumentEngine } from "./ged-document-engine.mjs";

export async function startGedDocumentServer({ host = "127.0.0.1", port = 3312, conversionKey = "", pdfaKey = "", engine = createGedDocumentEngine() } = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && (conversionKey.length < 32 || pdfaKey.length < 32)) throw new Error("Configure as chaves de conversão e PDF/A com pelo menos 32 caracteres.");
  await engine.initialize();
  let busy = false;
  const server = createServer(async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); };
    if (request.method === "GET" && request.url === "/health") { send(200, { ready: true, engines: ["libreoffice", "verapdf"], busy }); return; }
    if (request.method !== "POST" || !["/convert", "/pdfa"].includes(request.url)) { send(404, { error: "Rota não encontrada." }); return; }
    const key = request.url === "/convert" ? conversionKey : pdfaKey;
    if (key) {
      const expected = Buffer.from(`Bearer ${key}`), supplied = Buffer.from(request.headers.authorization ?? "");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) { send(401, { error: "Credencial inválida." }); return; }
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) { send(415, { error: "Envie JSON." }); return; }
    if (busy) { response.setHeader("Retry-After", "5"); send(429, { error: "Processamento ocupado; repita a operação." }); return; }
    busy = true;
    try {
      let length = 0;
      const chunks = [];
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 28_100_000) { send(413, { error: "Original superior ao limite." }); return; }
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      send(200, await (request.url === "/convert" ? engine.convert(input) : engine.validate(input)));
    } catch { send(422, { error: "Falha no processamento; confira formato, limites ou disponibilidade das ferramentas." }); }
    finally { busy = false; }
  });
  server.requestTimeout = 90_000;
  server.headersTimeout = 15_000;
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(port, host, accept); });
  return { server, async close() { await new Promise(done => server.close(done)); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = await startGedDocumentServer({ host: process.env.GED_DOCUMENT_HOST || "127.0.0.1", port: Number(process.env.GED_DOCUMENT_PORT || 3312), conversionKey: process.env.GED_CONVERSION_API_KEY || "", pdfaKey: process.env.GED_PDFA_API_KEY || "" });
  console.log(JSON.stringify({ status: "READY", engines: ["libreoffice", "verapdf"], port: service.server.address().port }));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
}
