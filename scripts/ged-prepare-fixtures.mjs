// Data preparation only: no application calls, assertions, validation or database access.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph } from "docx";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import sharp from "sharp";
import { prepareGedPpsFixture } from "./ged-prepare-pps-fixture.mjs";

const destination = resolve(process.argv[2] || "docs/ged-poc-acervo");
await mkdir(destination, { recursive: true });
const manifest = [];
async function save(name, data, purpose) {
  const bytes = Buffer.from(data); await writeFile(join(destination, name), bytes);
  manifest.push({ filename: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), purpose, status: "GERADO_NAO_HOMOLOGADO" });
}
const text = "POC GED. educacaojasmim. Plano municipal de ensino. Documento sintetico sem dados pessoais.";
await save("educacao.txt", text, "Texto UTF-8 e pesquisa lexical/semantica");
await save("educacao-utf16.txt", Buffer.concat([Buffer.from([255, 254]), Buffer.from(text, "utf16le")]), "Normalizacao UTF-16");
await save("administracao.txt", "administracaotucano. Contratacao administrativa da POC.", "Outro setor");
await save("restrito.txt", "reservadopitangueira. Acesso exclusivo do setor B.", "Pesquisa negativa e isolamento");
await save("educacao.rtf", `{\\rtf1\\ansi ${text}}`, "RTF real");
await save("educacao.html", `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>POC GED</title></head><body><p>${text}</p></body></html>`, "HTML real");
await save("modelo.docx", await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Portaria {{numero}} - {{assunto}}"), new Paragraph(text)] }] })), "Modelo e formato DOCX");
const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("POC").addRows([["Assunto", "Valor"], [text, 123.45]]);
await save("educacao.xlsx", await workbook.xlsx.writeBuffer(), "Planilha real");
const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); pdf.addPage().drawText(text, { x: 40, y: 740, size: 10, font });
await save("educacao.pdf", await pdf.save(), "PDF com texto e nao declarado PDF/A");
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="500"><rect width="100%" height="100%" fill="white"/><text x="60" y="150" font-size="36" fill="black">POC GED - educacaojasmim</text><text x="60" y="230" font-size="28" fill="black">Plano municipal de ensino - pagina 1</text></svg>`);
const png = await sharp(svg).png().toBuffer();
await save("pagina-1.png", png, "Digitalizacao sintetica pagina 1");
await save("pagina-1.jpg", await sharp(png).jpeg().toBuffer(), "JPEG");
await save("pagina-1.gif", await sharp(png).gif().toBuffer(), "GIF");
await save("pagina-1.tiff", await sharp(png).tiff().toBuffer(), "TIFF");
const second = await sharp(Buffer.from(svg.toString().replace("pagina 1", "pagina 2"))).png().toBuffer();
await save("pagina-2.png", second, "Digitalizacao sintetica pagina 2 e reordenacao");
const { data: pixels, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const stride = Math.ceil(info.width * 3 / 4) * 4;
const bmp = Buffer.alloc(54 + stride * info.height); bmp.write("BM"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(info.width, 18); bmp.writeInt32LE(info.height, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const source = (y * info.width + x) * 3, target = 54 + (info.height - 1 - y) * stride + x * 3; bmp[target] = pixels[source + 2]; bmp[target + 1] = pixels[source + 1]; bmp[target + 2] = pixels[source]; }
await save("pagina-1.bmp", bmp, "BMP Windows sem compressao 24 bits");
const secondPixels = await sharp(second).removeAlpha().raw().toBuffer();
await save("duas-paginas.tiff", await sharp(Buffer.concat([pixels, secondPixels]), { raw: { width: info.width, height: info.height * 2, channels: 3, pageHeight: info.height } }).tiff().toBuffer(), "TIFF multipagina sintetico");
const scanned = await PDFDocument.create(); const image = await scanned.embedPng(png); const page = scanned.addPage([700, 250]); page.drawImage(image, { x: 0, y: 0, width: 700, height: 250 });
await save("digitalizado-sem-texto.pdf", await scanned.save(), "OCR e derivado pesquisavel");
const odt = new JSZip(); odt.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
odt.file("META-INF/manifest.xml", '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>');
odt.file("content.xml", `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text><text:p>${text}</text:p></office:text></office:body></office:document-content>`);
await save("educacao.odt", await odt.generateAsync({ type: "nodebuffer" }), "ODF texto real");
const formula = new JSZip(); formula.file("mimetype", "application/vnd.oasis.opendocument.formula", { compression: "STORE" });
formula.file("META-INF/manifest.xml", '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.formula"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>');
formula.file("content.xml", '<?xml version="1.0"?><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><annotation encoding="StarMath 5.0">a + b</annotation></semantics></math>');
await save("formula.odf", await formula.generateAsync({ type: "nodebuffer" }), "ODF formula sintetica");
const remaining = ["Versoes/assinaturas/vinculos gerados pelo fluxo da aplicacao na fase 11"];
if (process.argv.includes("--public")) {
  manifest.push(await prepareGedPpsFixture(destination));
  const base = "https://raw.githubusercontent.com/LibreOffice/core/master/";
  const sources = [
    ["referencia.doc", base + "sw/qa/extras/ww8import/data/changes-in-footnote.doc"],
    ["referencia.xls", base + "sc/qa/unit/data/xls/cell-borders.xls"],
    ["referencia.pptx", base + "sd/qa/unit/data/pptx/3columns.pptx"],
    ["referencia.ods", base + "sc/qa/unit/data/ods/3AnchorTypes.ods"],
    ["referencia.odp", base + "sd/qa/unit/data/TextFitting.odp"],
  ];
  const response = await fetch("https://api.github.com/repos/veraPDF/veraPDF-corpus/git/trees/master?recursive=1");
  if (!response.ok) throw new Error(`Corpus PDF/A indisponivel: ${response.status}`);
  const corpus = await response.json();
  for (const profile of ["1b", "2b"]) for (const expected of ["pass", "fail"]) {
    const candidate = corpus.tree.filter(item => item.path.startsWith(`PDF_A-${profile}/`) && item.path.endsWith(".pdf") && item.path.includes(`-${expected}-`)).sort((a, b) => a.size - b.size)[0];
    if (!candidate) throw new Error(`Amostra publica nao encontrada: ${profile}/${expected}`);
    sources.push([`referencia-pdfa-${profile}-${expected}.pdf`, `https://raw.githubusercontent.com/veraPDF/veraPDF-corpus/${corpus.sha}/${candidate.path.split("/").map(encodeURIComponent).join("/")}`]);
  }
  for (const [name, url] of sources) {
    const response = await fetch(url); if (!response.ok) throw new Error(`Download da amostra ${name}: ${response.status}`);
    await save(name, await response.arrayBuffer(), "Arquivo publico de referencia; resultado local nao executado");
    manifest[manifest.length - 1].sourceUrl = url;
    manifest[manifest.length - 1].sourceProject = url.includes("veraPDF") ? "veraPDF/veraPDF-corpus" : "LibreOffice/core";
  }
} else remaining.push("PPS/DOC/XLS/PPTX/ODS/ODP e corpus PDF/A: executar preparador com --public");
await writeFile(join(destination, "manifesto.json"), JSON.stringify({ generatedAt: new Date().toISOString(), status: "DADOS_PREPARADOS_TESTES_NAO_EXECUTADOS", files: manifest, requiredAdditionalFixtures: remaining }, null, 2));
console.log(`Acervo sintetico preparado em ${destination}. Sem testes ou homologacao.`);
