import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { annotateConstructionPdf, assertConstructionArtifactSigned, constructionFileHash, generateConstructionPdf, renderConstructionTemplate } from "../src/lib/obras/construction-documents-policy";

test("PDF annotations preserve original bytes and render text, note, arrow and shapes in a separate revision", async () => {
  const original = await generateConstructionPdf({ title: "Projeto", body: "Conteúdo original preservado", stamp: "Carimbo", validationCode: "1234", demonstration: true }); const before = constructionFileHash(original);
  const annotations = ["TEXT", "NOTE", "ARROW", "RECTANGLE", "ELLIPSE"].map((kind, index) => ({ kind, page: 1, x: 50, y: 100 + index * 70, width: 180, height: 50, text: "Revisar projeto", color: "#0088ff", fontSize: 12 }));
  const result = await annotateConstructionPdf(original, annotations);
  assert.equal(constructionFileHash(original), before); assert.equal(result.originalHash, before); assert.notEqual(constructionFileHash(result.bytes), before); assert.equal(result.annotations.length, 5);
  const document = await PDFDocument.load(result.bytes); assert.equal(document.getPageCount(), 1);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = fileURLToPath(new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)).replaceAll("\\", "/");
  const sourceTask = getDocument({ data: original.slice(), standardFontDataUrl }); const revisedTask = getDocument({ data: result.bytes.slice(), standardFontDataUrl });
  const source = await sourceTask.promise; const revised = await revisedTask.promise;
  try {
    const sourcePage = await source.getPage(1); const revisedPage = await revised.getPage(1);
    const content = await revisedPage.getTextContent(); const strings = content.items.filter((item) => "str" in item).map((item) => "str" in item ? item.str : "").join(" ");
    assert.match(strings, /Conteúdo original preservado/); assert.equal(strings.match(/Revisar projeto/g)?.length, 2);
    assert.ok((await revisedPage.getOperatorList()).fnArray.length > (await sourcePage.getOperatorList()).fnArray.length, "Rendered drawing operators must survive PDF serialization");
  } finally { await sourceTask.destroy(); await revisedTask.destroy(); }
});
test("annotations reject out-of-page geometry, missing page and overflowing text", async () => {
  const original = await generateConstructionPdf({ title: "Teste", body: "Corpo", stamp: "Carimbo", validationCode: "abc", demonstration: false });
  await assert.rejects(annotateConstructionPdf(original, [{ kind: "RECTANGLE", page: 1, x: 590, y: 10, width: 100, height: 10 }]), /limites/);
  await assert.rejects(annotateConstructionPdf(original, [{ kind: "ARROW", page: 2, x: 10, y: 10 }]));
  await assert.rejects(annotateConstructionPdf(original, [{ kind: "TEXT", page: 1, x: 10, y: 10, width: 10, height: 10, text: "Texto que não cabe" }]), /não cabe/);
});
test("template placeholders are allowlisted and issue fields cannot be silently omitted", () => {
  assert.equal(renderConstructionTemplate("Alvará {{number}} — {{protocol}}", { number: "PERMIT-1/2026", protocol: "123" }), "Alvará PERMIT-1/2026 — 123");
  assert.throws(() => renderConstructionTemplate("{{privateKey}}", { privateKey: "secret" }), /desconhecido/);
  assert.throws(() => renderConstructionTemplate("{{number}}", {}), /desconhecido/);
});
test("publication gate rejects unsigned, partial, stale-hash and empty-signature versions", () => {
  const signed = { status: "SIGNED", hashSha256: "aaa" }; const signature = { status: "SIGNED", isRequired: true, documentHash: "aaa" };
  assert.doesNotThrow(() => assertConstructionArtifactSigned(signed, [signature]));
  for (const [version, signatures] of [[{ ...signed, status: "FINAL" }, [signature]], [signed, []], [signed, [{ ...signature, status: "PENDING" }]], [signed, [{ ...signature, documentHash: "bbb" }]]] as const) assert.throws(() => assertConstructionArtifactSigned(version, [...signatures]), /assinaturas/);
});
test("long templates produce genuine multipage PDFs with a demonstrative stamp", async () => {
  const bytes = await generateConstructionPdf({ title: "Habite-se", body: Array.from({ length: 160 }, (_, i) => `Linha ${i}: conteúdo do modelo`).join("\n"), stamp: "Prefeitura", validationCode: "code", demonstration: true }); const pdf = await PDFDocument.load(bytes); assert.ok(pdf.getPageCount() > 1); assert.match(Buffer.from(bytes).subarray(0, 8).toString(), /PDF/);
});
