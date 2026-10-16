import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const metadata = JSON.parse(readFileSync("docs/poc-p0/fontes/CBO_MTE_METADATA.json", "utf8")) as { sha256: string; url: string; capturedAt: string; encoding: string };
const bytes = readFileSync("docs/poc-p0/fontes/CBO_MTE_OCUPACAO.csv");
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== metadata.sha256 || metadata.encoding !== "windows-1252") throw new Error("Hash ou codificação CBO divergente.");
const lines = new TextDecoder("windows-1252", { fatal: true }).decode(bytes).split(/\r?\n/);
if (lines.shift() !== "CODIGO;TITULO") throw new Error("Cabeçalho CBO inesperado.");
const rows = lines.filter((line) => line.trim()).map((line) => {
  const match = /^(\d{6});([^;\r\n"]+)$/.exec(line);
  if (!match) throw new Error(`Registro CBO fora do formato simples da fonte: ${line.slice(0, 100)}`);
  return { code: match[1], name: match[2].trim() };
});
if (rows.length < 2000 || new Set(rows.map((row) => row.code)).size !== rows.length) throw new Error("Quantidade CBO inesperada ou códigos duplicados.");
const versionId = `p1-mte-cbo-capture-${hash.slice(0, 16)}`;

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const previous = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      const local = await tx.healthCbo.findMany({ where: { code: { in: rows.map((row) => row.code) } }, select: { id: true, code: true, description: true } });
      const localByCode = new Map(local.map((row) => [row.code, row]));
      const compatible = rows.filter((row) => localByCode.get(row.code)?.description === row.name);
      const conflicts = rows.filter((row) => localByCode.has(row.code) && localByCode.get(row.code)?.description !== row.name).map((row) => ({ code: row.code, official: row.name, local: localByCode.get(row.code)!.description }));
      if (previous) {
        if (previous.sourceHash !== hash || previous.status !== "DRAFT" || previous.entries.length !== rows.length) throw new Error("Versão CBO existente divergente; preservar revisão local.");
        const entries = new Map(previous.entries.map((entry) => [entry.code, entry]));
        for (const row of rows) {
          const entry = entries.get(row.code);
          if (!entry || entry.kind !== "CBO" || entry.name !== row.name || entry.canonicalId !== `UNMAPPED:CBO:${row.code}`) throw new Error(`De-para CBO alterado: ${row.code}; não sobrescrever.`);
        }
      } else if (apply) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        await tx.planningCatalogVersion.create({ data: { id: versionId, year: new Date(metadata.capturedAt).getUTCFullYear(), label: "CBO MTE — captura ocupações (vigência a conciliar)", sourceHash: hash, status: "DRAFT", createdById: actor.id, normativeReference: `CBO 2002, Portaria MTE 397/2002. Fonte ${metadata.url}; captura ${metadata.capturedAt}. Data de vigência individual não declarada no CSV; revisão pendente.` } });
        await tx.planningCatalogEntry.createMany({ data: rows.map((row) => ({ versionId, kind: "CBO", code: row.code, name: row.name, parentCode: row.code.slice(0, 4), degree: 5, canonicalId: `UNMAPPED:CBO:${row.code}`, attributes: { sourceUrl: metadata.url, sourceHash: hash, capturedAt: metadata.capturedAt, encoding: metadata.encoding, mapped: false, effectiveDatesVerified: false } })) });
        await tx.financialAuditLog.create({ data: { action: "IMPORT_CBO_DRAFT", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { sourceHash: hash, entries: rows.length, status: "DRAFT", adopted: false } } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, sourceHash: hash, sourceUrl: metadata.url, entries: rows.length, status: "DRAFT", adopted: false, existingCanonicalCandidates: compatible.length, conflicts, canonicalMappingPending: true, effectiveDatesVerified: false };
    }, { timeout: 120000 });
    if (apply) writeFileSync("docs/poc-p0/CATALOGO_CBO_P1.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
