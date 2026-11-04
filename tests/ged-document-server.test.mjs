import assert from "node:assert/strict";
import test from "node:test";
import { parseVeraPdfReport } from "../scripts/ged-document-engine.mjs";
import { startGedDocumentServer } from "../scripts/ged-document-server.mjs";

test("veraPDF distingue conformidade, falha de validação e ausência de relatório PDF/A", () => {
  const report = compliant => `<?xml version="1.0"?><report><jobs><job><validationReport profileName="PDF/A-2b validation profile" isCompliant="${compliant}"><details passedRules="100" failedRules="${compliant ? 0 : 1}"/></validationReport></job></jobs></report>`;
  assert.equal(parseVeraPdfReport(report(true)).compliant, true);
  assert.equal(parseVeraPdfReport(report(false)).compliant, false);
  assert.throws(() => parseVeraPdfReport('<report><batchSummary compliant="1"/></report>'));
  assert.throws(() => parseVeraPdfReport(report(true).replace("PDF/A-2b", "PDF/UA-1")));
  assert.throws(() => parseVeraPdfReport('<!DOCTYPE report [<!ENTITY x SYSTEM "file:///etc/passwd">]><report/>'));
});

test("serviço documental exige chaves distintas e devolve retentativa durante conversão", async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  let notify;
  const entered = new Promise(resolve => { notify = resolve; });
  let converted = 0;
  const conversionKey = "conversion-test-key-not-a-production-secret";
  const pdfaKey = "pdfa-test-key-not-a-production-secret";
  const service = await startGedDocumentServer({ port: 0, conversionKey, pdfaKey, engine: {
    initialize: async () => {},
    convert: async () => { converted++; notify(); await wait; return { pdfBase64: Buffer.from("%PDF-1.7").toString("base64") }; },
    validate: async () => ({ compliant: false, profile: "PDF/A-1b", report: "not compliant" }),
  } });
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  const post = (path, key) => fetch(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: "{}" });
  try {
    assert.equal((await post("/convert", pdfaKey)).status, 401);
    assert.equal((await post("/pdfa", conversionKey)).status, 401);
    const pending = post("/convert", conversionKey);
    await entered;
    assert.equal((await post("/convert", conversionKey)).status, 429);
    assert.equal((await fetch(`${origin}/health`)).status, 200);
    release();
    assert.equal((await pending).status, 200);
    assert.equal(converted, 1);
    const validation = await post("/pdfa", pdfaKey);
    assert.equal(validation.status, 200);
    assert.equal((await validation.json()).compliant, false);
  } finally { release(); await service.close(); }
});
