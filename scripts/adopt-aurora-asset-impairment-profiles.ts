import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-asset-impairment-accounts-2026-v1";
const decision = "Aurora das Veredas — redução a valor recuperável do imobilizado em VPD e conta redutora por categoria; avaliação fundamentada e sem reclassificação retroativa dos bens existentes.";
const groups = [
  { code: "MUNICIPAL:MAQUINAS", group: "01.01" },
  { code: "MUNICIPAL:INFORMATICA", group: "01.02" },
  { code: "MUNICIPAL:MOBILIARIO", group: "01.03" },
  { code: "MUNICIPAL:VEICULOS", group: "01.05" },
  { code: "MUNICIPAL:DEMAIS_MOVEIS", group: "01.99" },
  { code: "MUNICIPAL:IMOVEIS", group: "02.99" },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial patrimonial divergente.");
      const codes = groups.flatMap(row => [`3.6.1.5.1.${row.group}.00.00.00.00.00`, `1.2.3.9.1.${row.group}.00.00.00.00.00`]);
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceId, kind: "ACCOUNT", code: { in: codes } }, orderBy: { code: "asc" } });
      if (entries.length !== codes.length) throw new Error("Contas oficiais de impairment incompletas.");
      const canonical = new Map<string, string>();
      for (const entry of entries) {
        const a = entry.attributes as Prisma.JsonObject;
        if (a.postingAllowed !== true || a.informationNature !== "P" || a.balanceNature !== (entry.code.startsWith("1.") ? "C" : "D") || a.effectiveFrom !== "2026-01-01" || a.effectiveUntil !== "2026-12-31") throw new Error(`Conta inválida: ${entry.code}.`);
        const existing = await tx.accountingPlan.findUnique({ where: { code: entry.code } });
        const type = entry.code.startsWith("1.") ? "Ativo" : "VPD";
        if (existing && (existing.name !== entry.name || existing.type !== type)) throw new Error(`Conta existente divergente: ${entry.code}.`);
        canonical.set(entry.code, existing?.id ?? `aurora-account:${entry.code}`);
      }
      const hash = createHash("sha256").update(JSON.stringify({ sourceHash, decision, entries: entries.map(row => ({ code: row.code, name: row.name, attributes: row.attributes })) })).digest("hex");
      const catalog = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      if (catalog && (catalog.status !== "PUBLISHED" || catalog.sourceHash !== hash || catalog.entries.length !== entries.length || catalog.entries.some(row => {
        const original = entries.find(entry => entry.code === row.code);
        const a = row.attributes as Prisma.JsonObject;
        return !original || row.name !== original.name || row.canonicalId !== canonical.get(row.code) || a.sourceEntryId !== original.id || a.operational !== true || a.pocOnly !== false || a.postingAllowed !== true;
      }))) throw new Error("Edição publicada de impairment divergente.");
      const profiles = [];
      for (const row of groups) {
        const category = await tx.assetCategory.findUniqueOrThrow({ where: { code: row.code } });
        if (!category.isActive) throw new Error(`Categoria inativa: ${row.code}.`);
        const eventCode = `ASSET_IMPAIRMENT:${category.id}`;
        const debitAccountId = canonical.get(`3.6.1.5.1.${row.group}.00.00.00.00.00`)!;
        const creditAccountId = canonical.get(`1.2.3.9.1.${row.group}.00.00.00.00.00`)!;
        const event = await tx.accountingEventCatalog.findUnique({ where: { code: eventCode }, include: { rules: { where: { isActive: true } } } });
        if (event && (!event.isActive || event.rules.length !== 1 || event.rules[0].isReference || event.rules[0].debitAccountId !== debitAccountId || event.rules[0].creditAccountId !== creditAccountId)) throw new Error(`Matriz existente divergente: ${eventCode}.`);
        profiles.push({ categoryId: category.id, eventCode, debitAccountId, creditAccountId, exists: !!event });
      }
      const audit = await tx.financialAuditLog.findFirst({ where: { action: "ADOPT_ASSET_IMPAIRMENT_PROFILES", entityId: versionId } });
      if (audit && (!catalog || profiles.some(row => !row.exists))) throw new Error("Adoção auditada incompleta.");
      if (apply) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        for (const entry of entries) await tx.accountingPlan.upsert({ where: { code: entry.code }, update: {}, create: { id: canonical.get(entry.code)!, code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "VPD" } });
        if (!catalog) {
          await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — impairment patrimonial 2026 v1", sourceHash: hash, normativeReference: decision, status: "DRAFT", createdById: actor.id, entries: { create: entries.map(entry => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: canonical.get(entry.code)!, attributes: { ...(entry.attributes as Prisma.JsonObject), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId: sourceId, decision } })) } } });
          await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        }
        for (const profile of profiles.filter(row => !row.exists)) await tx.accountingEventCatalog.create({ data: { code: profile.eventCode, name: `Redução a valor recuperável — ${profile.categoryId}`, description: decision, rules: { create: { debitAccountId: profile.debitAccountId, creditAccountId: profile.creditAccountId, isReference: false, description: versionId } } } });
        if (!audit) await tx.financialAuditLog.create({ data: { action: "ADOPT_ASSET_IMPAIRMENT_PROFILES", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, decision, profiles } } });
      }
      const auditCount = await tx.financialAuditLog.count({ where: { action: "ADOPT_ASSET_IMPAIRMENT_PROFILES", entityId: versionId } });
      if ((audit || apply) && auditCount !== 1) throw new Error("Auditoria de impairment divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, auditCount, accountCount: entries.length, profiles };
    }, { timeout: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
