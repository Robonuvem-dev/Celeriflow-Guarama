import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { createHash } from "node:crypto";

config({ path: ".env.local", quiet: true }); config({ quiet: true }); neonConfig.webSocketConstructor = ws;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const object = (value: Prisma.JsonValue): Prisma.InputJsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.InputJsonObject : {};
async function main() {
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }) });
  try {
    const apply = process.argv.includes("--apply");
    const originals = await db.planningCatalogVersion.findMany({ where: { id: { in: ["p1-poc-catalog-2024", "p1-poc-catalog-2025", "p1-poc-catalog-2026", "p1-poc-catalog-2027", "p1-poc-tax-matrix-2026-v1"] } }, include: { entries: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } });
    const before = hash(originals);
    const sources = await db.resourceSource.findMany(), revenues = await db.revenueNature.findMany(), expenses = await db.expenseNature.findMany();
    const lookup = { SOURCE: sources, REVENUE: revenues, EXPENSE: expenses };
    const plan = originals.map(source => ({ source, id: `aurora-names-v2:${source.id}`, label: source.id.includes("tax-matrix") ? "Aurora das Veredas — matriz tributária de referência 2026" : `Aurora das Veredas — classificações de referência ${source.year}`, rows: source.entries.map(entry => {
      const canonical = lookup[entry.kind as keyof typeof lookup]?.find(row => row.id === entry.canonicalId);
      return { id: `aurora-names-v2:${entry.id}`, kind: entry.kind, code: source.status === "PUBLISHED" ? entry.code : canonical?.code || entry.code, name: canonical?.name || entry.name, parentCode: entry.parentCode, degree: entry.degree, canonicalId: entry.canonicalId, attributes: { ...object(entry.attributes), presentationPredecessorEntryId: entry.id, presentationPredecessorVersionId: source.id, presentationEffectiveFrom: "2026-10-14" } as Prisma.InputJsonObject };
    }) }));
    const results = [];
    const actor = apply ? await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } }, select: { id: true } }) : null;
    for (const item of plan) {
      const sourceHash = hash({ source: item.source.sourceHash, label: item.label, rows: item.rows });
      const existing = await db.planningCatalogVersion.findUnique({ where: { id: item.id }, include: { _count: { select: { entries: true } } } });
      if (existing && (existing.sourceHash !== sourceHash || existing._count.entries !== item.rows.length)) throw new Error("Revisão existente diverge da origem; não sobrescrever.");
      if (apply && !existing) await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('AURORA_NAME_CATALOG_REVISION_V2'))`;
        const current = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: item.source.id }, include: { entries: { orderBy: { id: "asc" } } } });
        if (hash(current) !== hash(item.source)) throw new Error("Origem alterada durante a prévia.");
        await tx.planningCatalogVersion.create({ data: { id: item.id, year: item.source.year, label: item.label, normativeReference: "Revisão cadastral de nomes autorizada pelo responsável em 14/10/2026. Procedência e limitações da edição de origem preservadas em seus metadados; sem homologação normativa presumida.", sourceHash, createdById: actor!.id, status: "DRAFT", entries: { create: item.rows } } });
        if (item.source.status === "PUBLISHED") await tx.planningCatalogVersion.update({ where: { id: item.id }, data: { status: "PUBLISHED" } });
        await tx.financialAuditLog.create({ data: { action: "MUNICIPAL_CATALOG_NAME_REVISION", entityType: "PlanningCatalogVersion", entityId: item.id, authorUsuarioId: actor!.id, payload: { sourceVersionId: item.source.id, sourceHash: item.source.sourceHash, revisionHash: sourceHash, entries: item.rows.length, oldVersionPreserved: true, fictional: true, authorizationsPreserved: true } } });
      }, { timeout: 120000 });
      results.push({ source: item.source.id, version: item.id, status: item.source.status, entries: item.rows.length, created: apply && !existing, reused: Boolean(existing) });
    }
    const after = await db.planningCatalogVersion.findMany({ where: { id: { in: originals.map(row => row.id) } }, include: { entries: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } });
    if (hash(after) !== before) throw new Error("Edições históricas divergiram durante a revisão.");
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "PREVIEW", results, historyPreserved: true }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na revisão dos catálogos."); process.exitCode = 1; });
