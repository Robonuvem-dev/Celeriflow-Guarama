import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph } from "docx";
import { extractGedText, inspectGedBytes, requestGedOcr } from "../src/lib/documents/ged-storage";

test("extração lê bytes PDF/DOCX reais e preserva número de página e conteúdo pesquisável", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of ["Protocolo municipal 2026", "Contrato de aquisicao de veiculos"]) pdf.addPage().drawText(text, { font, size: 12, x: 50, y: 700 });
  const pages = await extractGedText("acervo.pdf", Buffer.from(await pdf.save()));
  assert.deepEqual(pages.map(page => page.page), [1, 2]);
  assert.match(pages[1].text, /Contrato de aquisicao/);
  assert.equal(pages[0].method, "PDF_TEXT");
  const word = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Ofício para {{nome}} e referência {{numero}}.")] }] }));
  const docx = await extractGedText("modelo.docx", word);
  assert.match(docx[0].text, /\{\{nome\}\}/);
  await assert.rejects(inspectGedBytes("arquivo.pdf", Buffer.from("texto comum")), /formato/);
  await assert.rejects(inspectGedBytes("arquivo.docx", Buffer.from("texto comum")));
});

test("adaptador OCR envia coordenadas/idioma e rejeita resposta de região ou página diferente", async () => {
  const previous = process.env.GED_OCR_ENDPOINT;
  const previousKey = process.env.GED_OCR_API_KEY;
  let returnedPage = 2;
  let received: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ pages: [{ page: returnedPage, label: "Número", text: "123/2026", confidence: 0.98 }] }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  process.env.GED_OCR_ENDPOINT = `http://127.0.0.1:${address.port}/ocr`;
  delete process.env.GED_OCR_API_KEY;
  const zone = { page: 2, label: "Número", x: 0.1, y: 0.2, width: 0.3, height: 0.1, rotation: 0 as const };
  try {
    const result = await requestGedOcr(Buffer.from("isolated fixture"), "application/pdf", [2], zone);
    assert.equal(result[0].text, "123/2026");
    assert.equal(received?.language, "por");
    assert.equal(received?.coordinateSystem, "normalized-top-left");
    assert.deepEqual(received?.zones, [zone]);
    returnedPage = 1;
    await assert.rejects(requestGedOcr(Buffer.from("fixture"), "application/pdf", [2], zone), /não corresponde/);
    delete process.env.GED_OCR_ENDPOINT;
    await assert.rejects(requestGedOcr(Buffer.from("fixture"), "application/pdf", []), /Configure/);
  } finally {
    if (previous === undefined) delete process.env.GED_OCR_ENDPOINT; else process.env.GED_OCR_ENDPOINT = previous;
    if (previousKey === undefined) delete process.env.GED_OCR_API_KEY; else process.env.GED_OCR_API_KEY = previousKey;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
