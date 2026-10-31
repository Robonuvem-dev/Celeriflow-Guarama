import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { startGedOcrServer } from "../scripts/ged-ocr-server.mjs";

test("Tesseract real: imagem, PDF digitalizado, seleção de página/zona e fronteira HTTP autenticada", { timeout: 180_000 }, async () => {
  const apiKey = "isolated-ocr-test-key-never-a-production-secret";
  const service = await startGedOcrServer({ port: 0, apiKey, cachePath: join(tmpdir(), "opencode", "ged-ocr-cache") });
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  const canvas = createCanvas(1400, 700), context = canvas.getContext("2d");
  context.fillStyle = "white"; context.fillRect(0, 0, 1400, 700); context.fillStyle = "black"; context.font = "64px Arial";
  context.fillText("PROTOCOLO MUNICIPAL 2026", 70, 150);
  context.fillText("PROCESSO 4321", 70, 410);
  const image = canvas.toBuffer("image/png");
  const input = { contentBase64: image.toString("base64"), mimeType: "image/png", language: "por", pages: [] };
  const post = data => fetch(`${origin}/ocr`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(data) });
  try {
    assert.equal((await fetch(`${origin}/ocr`, { method: "POST" })).status, 401);
    const response = await post(input); assert.equal(response.status, 200);
    const full = await response.json(); assert.match(full.pages[0].text, /PROTOCOLO MUNICIPAL 2026/); assert.match(full.pages[0].text, /4321/); assert(full.pages[0].confidence > 0.4);
    const zone = { page: 1, label: "Processo", x: 0.02, y: 0.4, width: 0.95, height: 0.3, rotation: 0 };
    const zonal = await post({ ...input, pages: [1], zones: [zone], coordinateSystem: "normalized-top-left" });
    assert.equal(zonal.status, 200); const recognized = (await zonal.json()).pages[0]; assert.equal(recognized.label, "Processo"); assert.match(recognized.text, /PROCESSO 4321/); assert.doesNotMatch(recognized.text, /PROTOCOLO/);
    const pdf = await PDFDocument.create(); pdf.addPage([700, 350]); const embedded = await pdf.embedPng(image); pdf.addPage([700, 350]).drawImage(embedded, { x: 0, y: 0, width: 700, height: 350 });
    const scanned = await post({ ...input, mimeType: "application/pdf", contentBase64: Buffer.from(await pdf.save()).toString("base64"), pages: [2] });
    assert.equal(scanned.status, 200); const pages = (await scanned.json()).pages; assert.deepEqual(pages.map(page => page.page), [2]); assert.match(pages[0].text, /PROTOCOLO MUNICIPAL 2026/);
    assert.equal((await post({ ...input, pages: [2] })).status, 422);
    assert.equal((await post({ ...input, mimeType: "application/pdf" })).status, 422);
    assert.equal((await post({ ...input, pages: [1], zones: [{ ...zone, x: 0.9 }], coordinateSystem: "normalized-top-left" })).status, 422);
  } finally { await service.close(); }
});
