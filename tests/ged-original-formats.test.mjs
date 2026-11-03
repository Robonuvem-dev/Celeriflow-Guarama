import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { build } from "esbuild";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph } from "docx";

let storage, policy;
const fixture = { served: Buffer.alloc(0) }, samples = new Map();
before(async () => {
  const result = await build({ entryPoints: ["src/lib/documents/ged-storage.ts", "src/lib/documents/ged-policy.ts"], outdir: "fixture", bundle: true, write: false, platform: "node", format: "cjs", packages: "external", tsconfig: "tsconfig.json", logLevel: "silent", plugins: [{ name: "original-storage", setup(b) {
    b.onResolve({ filter: /^@\/lib\/platform\/blob$/ }, () => ({ path: "blob", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export function getBlobDocumentPrefix(){return "fixture/"}export async function getFile(){return {statusCode:200,stream:new Response(fixture.served).body};}', loader: "js" }));
  } }] });
  for (const output of result.outputFiles) { const compiled = { exports: {} }; new Function("require", "module", "exports", "fixture", output.text)(createRequire(import.meta.url), compiled, compiled.exports, fixture); if (output.path.endsWith("ged-storage.js")) storage = compiled.exports; else policy = compiled.exports; }
  samples.set("docx", await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Lei municipal integral em Word")] }] })));
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("Mapa").addRow(["Material", "Valor", "123.45"]); samples.set("xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
  for (const [extension, mimetype] of [["odt", "application/vnd.oasis.opendocument.text"], ["ods", "application/vnd.oasis.opendocument.spreadsheet"], ["odf", "application/vnd.oasis.opendocument.formula"]]) {
    const zip = new JSZip(); zip.file("mimetype", mimetype, { compression: "STORE" }); zip.file("content.xml", '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"><office:body/></office:document-content>'); samples.set(extension, await zip.generateAsync({ type: "nodebuffer" }));
  }
  samples.set("rtf", Buffer.from("{\\rtf1\\ansi Texto legal integral}"));
});
test("Word/LibreOffice/Excel usam os MIME da main e preservam bytes, nome e hash do original", async () => {
  for (const [extension, bytes] of samples) {
    const copy = Buffer.from(bytes), inspected = await storage.inspectGedBytes(`original.${extension.toUpperCase()}`, bytes);
    assert.equal(inspected.mimeType, policy.gedMimeTypes[extension]); assert.equal(inspected.byteLength, bytes.length);
    assert.equal(inspected.hashSha256, createHash("sha256").update(bytes).digest("hex")); assert.deepEqual(bytes, copy);
    fixture.served = bytes; assert.deepEqual(await storage.readGedBytes("https://storage.fixture/original", inspected.hashSha256), bytes);
    assert(policy.gedAcceptedExtensions.split(",").includes(`.${extension}`));
  }
});
test("DOC/XLS legados conferem assinatura OLE; esta prova não equivale a interpretar o conteúdo binário", async () => {
  const oleHeaderFixture = Buffer.from("d0cf11e0a1b11ae10000000000000000", "hex");
  for (const extension of ["doc", "xls"]) {
    assert.equal((await storage.inspectGedBytes(`legacy.${extension}`, oleHeaderFixture)).mimeType, policy.gedMimeTypes[extension]);
    await assert.rejects(storage.inspectGedBytes(`falso.${extension}`, Buffer.from("texto renomeado")), /formato/);
  }
});
test("pacotes com extensão divergente, MIME ODF incorreto, executáveis e tamanho inválido são rejeitados", async () => {
  await assert.rejects(storage.inspectGedBytes("falso.xlsx", samples.get("docx")), /formato/);
  await assert.rejects(storage.inspectGedBytes("falso.docx", samples.get("xlsx")), /formato/);
  await assert.rejects(storage.inspectGedBytes("falso.ods", samples.get("odt")), /formato/);
  await assert.rejects(storage.inspectGedBytes("falso.exe", samples.get("docx")), /suportado/);
  assert.throws(() => policy.gedFileType("arquivo.__proto__"), /suportado/);
  await assert.rejects(storage.inspectGedBytes("vazio.odt", Buffer.alloc(0)), /vazio/);
  await assert.rejects(storage.inspectGedBytes("grande.doc", Buffer.alloc(storage.GED_MAX_BYTES + 1)), /20 MiB/);
});
test("limites de descompressão e divergência de hash permanecem ativos", async () => {
  const zip = new JSZip(); zip.file("[Content_Types].xml", "<Types/>"); zip.file("xl/workbook.xml", "x".repeat(31 * 1024 * 1024));
  await assert.rejects(storage.inspectGedBytes("grande.xlsx", await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })), /descompressão/);
  fixture.served = samples.get("odt"); await assert.rejects(storage.readGedBytes("https://storage.fixture/original", "0".repeat(64)), /integridade/);
});
test("original não depende de conversor; indexação Office indisponível é explícita e não chama OCR", async () => {
  for (const extension of ["odt", "xlsx", "rtf"]) await assert.rejects(storage.extractGedText(`original.${extension}`, samples.get(extension)), /Original preservado.*indexação/);
  const pages = await storage.extractGedText("original.docx", samples.get("docx")); assert.match(pages[0].text, /Lei municipal integral/);
});
