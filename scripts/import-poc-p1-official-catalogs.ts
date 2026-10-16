import { config } from "dotenv";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const sources = [
  { kind: "ACCOUNT", file: "PCASPM_PR_2026_v1.0d.xlsx", sheet: "PCASP-TCE-PR-2026", header: 5, codeColumn: 14, yearColumn: 15, nameColumn: 16, version: "1.0d", publishedAt: "2026-03-24", hash: "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a" },
  { kind: "REVENUE", file: "PC_RECEITA_PR_2026_v1.0e.xlsx", sheet: "Plano Receita 2026", header: 7, codeColumn: 14, yearColumn: 15, nameColumn: 16, version: "1.0e", publishedAt: "2026-10-09", hash: "2ee071dfb6ecf33462ff4ea047445dd1122786c735bb46ac0b8008952b501e97" },
  { kind: "EXPENSE", file: "PC_DESPESA_PR_2026_v1.0h.xlsx", sheet: "PC Desp-2026", header: 7, codeColumn: 8, yearColumn: 9, nameColumn: 10, version: "1.0h", publishedAt: "2026-08-05", hash: "e98bff8e02c48e92c762ab425d64d219849754e4dab34f4be491dfa7f3ef4ecb" },
] as const;

function cellText(value: ExcelJS.CellValue): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value).trim();
  if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  if ("text" in value) return String(value.text).trim();
  throw new Error("Célula sem resultado textual preservado; não executar fórmulas do arquivo.");
}

async function parseSource(source: typeof sources[number]) {
  const file = `docs/poc-p0/fontes/${source.file}`;
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (hash !== source.hash) throw new Error(`Hash divergente: ${file}`);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { worksheets: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore", entries: "ignore" });
  const entries: Prisma.PlanningCatalogEntryCreateManyInput[] = [];
  const codes = new Set<string>();
  const id = `p1-tce-pr-${source.kind.toLowerCase()}-2026-${source.version}`;
  let found = false;
  let headings: string[] = [];
  for await (const sheet of reader) {
    for await (const row of sheet) {
      if (sheet.name !== source.sheet) continue;
      found = true;
      if (row.number === source.header) {
        headings = Array.from({ length: source.kind === "ACCOUNT" ? 28 : source.kind === "REVENUE" ? 24 : 14 }, (_, index) => cellText(row.getCell(index + 1).value));
        if (!/Conta|Código|CÓDIGO/.test(headings[source.codeColumn - 1]) || !/Ano/.test(headings[source.yearColumn - 1])) throw new Error(`Cabeçalho inesperado: ${source.sheet}`);
      }
      if (row.number <= source.header) continue;
      const code = cellText(row.getCell(source.codeColumn).value);
      if (!code || !/^\d+(\.\d+)+$/.test(code)) continue;
      const year = cellText(row.getCell(source.yearColumn).value);
      if (year !== "2026") throw new Error(`Ano divergente em ${source.sheet}:${row.number}`);
      const name = cellText(row.getCell(source.nameColumn).value);
      if (!name || codes.has(code)) throw new Error(`Conta vazia/duplicada: ${source.sheet}:${row.number}:${code}`);
      codes.add(code);
      const columns: Record<string, string> = {};
      headings.forEach((heading, index) => { if (heading) columns[heading] = cellText(row.getCell(index + 1).value); });
      const segments = code.split(".");
      let degree = segments.length;
      while (degree > 1 && /^0+$/.test(segments[degree - 1])) degree--;
      const level = source.kind === "ACCOUNT" ? columns.tpEscrituracao : source.kind === "REVENUE" ? columns.idTipoNivelConta : columns["Nível (S/A)"];
      if (!["S", "N", "A"].includes(level)) throw new Error(`Nível inválido: ${source.sheet}:${row.number}:${level}`);
      entries.push({ id: `${id}:${code}`, versionId: id, kind: source.kind, code, name,
        canonicalId: `UNMAPPED:TCE_PR:${source.kind}:${code}`, degree,
        attributes: { authority: "TCE_PR_SIM_AM", sourceFile: source.file, sourceSheet: source.sheet, sourceRow: row.number, sourceHash: hash, externalCode: code, publishedAt: source.publishedAt, effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", mapped: false, homologated: false, postingAllowed: source.kind === "ACCOUNT" ? level === "S" : level === "A", balanceNature: source.kind === "ACCOUNT" ? columns.tpNaturezaSaldo : null, informationNature: source.kind === "ACCOUNT" ? columns.tpNaturezaInformacao : null, columns } });
    }
  }
  if (!found || entries.length < 100) throw new Error(`Aba/quantidade inválida: ${source.sheet}`);
  const byCode = new Set(entries.map((entry) => entry.code));
  for (const entry of entries) {
    const segments = entry.code.split(".");
    for (let index = entry.degree - 1; index >= 1; index--) {
      const candidate = segments.map((segment, position) => position < index ? segment : "0".repeat(segment.length)).join(".");
      if (byCode.has(candidate) && candidate !== entry.code) { entry.parentCode = candidate; break; }
    }
  }
  return { id, source, entries };
}

async function main() {
  // Parse and verify every source before starting any database mutation.
  const catalogs = [];
  for (const source of sources) catalogs.push(await parseSource(source));
  const summary = catalogs.map(({ id, source, entries }) => ({ id, ...source, entries: entries.length, postingAllowed: entries.filter((entry) => (entry.attributes as Prisma.JsonObject).postingAllowed).length, status: "DRAFT", mapped: false }));
  if (apply) {
    const { prisma } = await import("../src/lib/prisma");
    try {
      const actor = await prisma.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      await prisma.$transaction(async (tx) => {
        for (const { id, source, entries } of catalogs) {
          const prior = await tx.planningCatalogVersion.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
          if (prior) {
            if (prior.sourceHash !== source.hash || prior._count.entries !== entries.length) throw new Error(`Versão existente divergente: ${id}`);
            continue;
          }
          await tx.planningCatalogVersion.create({ data: { id, year: 2026, label: `TCE-PR SIM-AM ${source.kind} 2026 ${source.version}`, normativeReference: `Fonte oficial preservada em docs/poc-p0/fontes/README.md; versão ${source.version}. De-para local ainda em revisão.`, sourceHash: source.hash, status: "DRAFT", createdById: actor.id } });
          for (let offset = 0; offset < entries.length; offset += 300) await tx.planningCatalogEntry.createMany({ data: entries.slice(offset, offset + 300) });
          await tx.financialAuditLog.create({ data: { action: "IMPORT_OFFICIAL_CATALOG", entityType: "PlanningCatalogVersion", entityId: id, authorUsuarioId: actor.id, payload: { sourceHash: source.hash, sourceFile: source.file, sourceSheet: source.sheet, entries: entries.length, mapped: false, homologated: false } } });
        }
      }, { timeout: 180000 });
      writeFileSync("docs/poc-p0/CATALOGOS_OFICIAIS_P1.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), mode: "ADDITIVE_IDEMPOTENT", catalogs: summary }, null, 2)}\n`);
    } finally { await prisma.$disconnect(); }
  }
  console.log(JSON.stringify({ mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", catalogs: summary }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
