import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const file = "docs/poc-p0/fontes/CNAE_IBGE_API_V2_SUBCLASSES.json";
const metadata = JSON.parse(readFileSync("docs/poc-p0/fontes/CNAE_IBGE_API_V2_METADATA.json", "utf8")) as { sha256: string; url: string; capturedAt: string; entries: number };
const bytes = readFileSync(file);
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== metadata.sha256) throw new Error("Hash CNAE diverge da fonte capturada.");
const rows = z.array(z.object({ id: z.string().regex(/^\d{7}$/), descricao: z.string().min(1), classe: z.object({ id: z.string().regex(/^\d{5}$/) }).passthrough() }).passthrough()).parse(JSON.parse(bytes.toString("utf8")));
if (rows.length !== metadata.entries || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("CNAE com códigos duplicados ou quantidade divergente.");
const versionId = `p1-ibge-cnae-capture-${hash.slice(0, 16)}`;

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const previous = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      if (previous) {
        if (previous.sourceHash !== hash || previous.status !== "DRAFT" || previous.entries.length !== rows.length) throw new Error("Versão CNAE existente divergente; preservar revisão local.");
        const entries = new Map(previous.entries.map((entry) => [entry.code, entry]));
        for (const row of rows) {
          const entry = entries.get(row.id);
          if (!entry || entry.kind !== "CNAE" || entry.name !== row.descricao || entry.parentCode !== row.classe.id || entry.canonicalId !== `UNMAPPED:CNAE:${row.id}`) throw new Error(`De-para CNAE alterado: ${row.id}; não sobrescrever.`);
        }
      } else if (apply) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        await tx.planningCatalogVersion.create({ data: { id: versionId, year: new Date(metadata.capturedAt).getUTCFullYear(), label: "CNAE IBGE — captura API v2 (vigência a conciliar)", sourceHash: hash, status: "DRAFT", createdById: actor.id, normativeReference: `Fonte ${metadata.url}; captura ${metadata.capturedAt}. API v2 não declara versão normativa nem vigência. Não adotar sem conciliação.` } });
        await tx.planningCatalogEntry.createMany({ data: rows.map((row) => ({ versionId, kind: "CNAE", code: row.id, name: row.descricao, parentCode: row.classe.id, degree: 5, canonicalId: `UNMAPPED:CNAE:${row.id}`, attributes: { sourceUrl: metadata.url, sourceHash: hash, capturedAt: metadata.capturedAt, sourceRecord: row, mapped: false, versionVerified: false, effectiveDatesVerified: false } })) });
        await tx.financialAuditLog.create({ data: { action: "IMPORT_CNAE_DRAFT", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { sourceHash: hash, entries: rows.length, status: "DRAFT", adopted: false } } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, sourceHash: hash, sourceUrl: metadata.url, entries: rows.length, status: "DRAFT", adopted: false, canonicalMappingPending: true, effectiveDatesVerified: false };
    }, { timeout: 120000 });
    if (apply) writeFileSync("docs/poc-p0/CATALOGO_CNAE_P1.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
