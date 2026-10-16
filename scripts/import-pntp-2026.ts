import { config } from "dotenv";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { put, get } from "@vercel/blob";
import { getBlobDocumentPrefix } from "../src/lib/platform/blob";
import { pntpApplicableEntities } from "../src/lib/transparencia/pntp-policy";
config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply"), cycle = 2026;
const source = "https://cdn.atricon.org.br/2026/08/criterios_pntp_2026.zip";
async function main() {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) }); if (!response.ok) throw new Error(`Matriz PNTP HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()), sourceHash = createHash("sha256").update(bytes).digest("hex"), zip = await JSZip.loadAsync(bytes);
  const file = Object.values(zip.files).find(file => !file.dir && file.name.endsWith(".xlsx")); if (!file) throw new Error("Planilha oficial não encontrada.");
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.async("nodebuffer"));
  const sheet = workbook.worksheets.find(sheet => sheet.getRow(1).getCell(1).text === "MATRIZ"); if (!sheet) throw new Error("Cabeçalho da matriz mudou.");
  const rows: { id: string; matrix: string; dimension: string; code: string; title: string; importance: string; facets: Record<string, boolean>; applicableEntities: string[] }[] = [];
  sheet.eachRow((row, number) => {
    const matrix = row.getCell(1).text.trim(), code = row.getCell(3).text.trim().replace(/\.$/, ""), title = row.getCell(4).text.trim();
    if (number === 1 || !/^\d+\.\d+$/.test(code) || !title || !matrix) return;
    const facets = Object.fromEntries(["availability", "updated", "history", "reports", "search"].map((name, index) => [name, !row.getCell(6 + index).text.toLocaleLowerCase("pt-BR").includes("não se aplica")]));
    rows.push({ id: `${cycle}:${matrix}:${code}`, matrix, dimension: row.getCell(2).text.trim(), code, title, importance: row.getCell(5).text.trim(), facets, applicableEntities: pntpApplicableEntities(matrix) });
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Critérios duplicados na matriz.");
  const { prisma } = await import("../src/lib/prisma");
  try {
    if (apply) {
      for (const row of rows) {
        const previous = await prisma.transparencyCriterion.findUnique({ where: { id: row.id } });
        if (previous && previous.sourceHash !== sourceHash) throw new Error("Fonte PNTP alterada; versionar a matriz antes de substituir evidências.");
        await prisma.transparencyCriterion.upsert({ where: { id: row.id }, update: {}, create: { ...row, cycle, sourceHash, sourceUrl: source } });
      }
      for (const artifact of [{ id: "pntp-matrix-2026", title: "PNTP 2026 — matriz oficial de critérios", url: source, bytes, contentType: "application/zip", filename: "criterios-pntp-2026.zip" }, { id: "pntp-guide-2026", title: "PNTP 2026 — cartilha oficial", url: "https://cdn.atricon.org.br/2026/08/Cartilha-PNTP-2026.pdf", bytes: null, contentType: "application/pdf", filename: "cartilha-pntp-2026.pdf" }]) {
        if (await prisma.transparencyPublication.findUnique({ where: { id: artifact.id } })) continue;
        let document=artifact.bytes;if(!document){const response=await fetch(artifact.url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Cartilha PNTP HTTP ${response.status}`);document=Buffer.from(await response.arrayBuffer());if(document.subarray(0,5).toString()!=="%PDF-")throw new Error("Cartilha oficial não retornou PDF.");}
        const hash = createHash("sha256").update(document).digest("hex");
        const blob = await put(`${getBlobDocumentPrefix()}transparencia/metodologia/${artifact.filename}`, document, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN, contentType: artifact.contentType, addRandomSuffix: true });
        const stored = await get(blob.url, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN }); if (!stored || createHash("sha256").update(Buffer.from(await new Response(stored.stream).arrayBuffer())).digest("hex") !== hash) throw new Error("Metodologia não confirmada no Blob.");
        await prisma.transparencyPublication.create({ data: { id: artifact.id, title: artifact.title, entity: "prefeitura", collectionSlug: "publicacoes", year: cycle, group: "Metodologia / PNTP", referencePeriod: "Ciclo 2026", source: "DOCUMENTOS", status: "PUBLISHED", publishedAt: new Date(), values: { origin: "Atricon — metodologia nacional, não avaliação do município", sourceReference: artifact.url, sizeBytes: document.length }, fileUrl: blob.url, filePathname: blob.pathname, filename: artifact.filename, contentType: artifact.contentType, sha256: hash } });
      }
    }
    console.log(JSON.stringify({ mode: apply ? "IMPORTED" : "READ_ONLY", source, sourceHash, criteria: rows.length, prefeitura: rows.filter(row => row.applicableEntities.includes("prefeitura")).length, camara: rows.filter(row => row.applicableEntities.includes("camara")).length }));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
