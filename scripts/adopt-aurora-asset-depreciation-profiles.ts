import { config } from "dotenv";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const adoptionId = "aurora-asset-depreciation-profiles-2026-v1";
const catalogId = "aurora-asset-depreciation-accounts-2026-v1";
const catalogHash = "0790aa2cbf586a64a72f7327e14b8869e49b7223deeeefb732d6a4f70f5cfce5";
const profiles = [
  { id: "aurora-asset-category-machinery", code: "MUNICIPAL:MAQUINAS", name: "Máquinas, aparelhos, equipamentos e ferramentas", lifeSpan: 120, credit: "1.2.3.8.1.01.01.00.00.00.00.00", realEstate: false },
  { id: "aurora-asset-category-it", code: "MUNICIPAL:INFORMATICA", name: "Bens de informática", lifeSpan: 60, credit: "1.2.3.8.1.01.02.00.00.00.00.00", realEstate: false },
  { id: "aurora-asset-category-furniture", code: "MUNICIPAL:MOBILIARIO", name: "Móveis e utensílios", lifeSpan: 120, credit: "1.2.3.8.1.01.03.00.00.00.00.00", realEstate: false },
  { id: "aurora-asset-category-vehicles", code: "MUNICIPAL:VEICULOS", name: "Veículos", lifeSpan: 60, credit: "1.2.3.8.1.01.05.00.00.00.00.00", realEstate: false },
  { id: "aurora-asset-category-other", code: "MUNICIPAL:DEMAIS_MOVEIS", name: "Demais bens móveis", lifeSpan: 60, credit: "1.2.3.8.1.01.99.00.00.00.00.00", realEstate: false },
  { id: "aurora-asset-category-buildings", code: "MUNICIPAL:IMOVEIS", name: "Edificações e demais bens imóveis depreciáveis", lifeSpan: 600, credit: "1.2.3.8.1.02.99.00.00.00.00.00", realEstate: true },
];
const decision = "Aurora das Veredas — vidas úteis iniciais estimadas em meses: máquinas/móveis 120, informática/veículos/demais móveis 60, edificações 600. Classificação e vida útil devem acompanhar avaliação na implantação; terrenos não integram categoria depreciável. Categorias e bens antigos preservados.";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${adoptionId}, 0))::text`;
      const catalog = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: catalogId }, include: { entries: true } });
      if (catalog.status !== "PUBLISHED" || catalog.sourceHash !== catalogHash) throw new Error("Contas municipais de depreciação divergentes.");
      const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      const result = [];
      const audit = await tx.financialAuditLog.findFirst({ where: { action: "ADOPT_ASSET_DEPRECIATION_PROFILES", entityId: adoptionId } });
      for (const profile of profiles) {
        const category = await tx.assetCategory.findUnique({ where: { code: profile.code } });
        if (category && (category.name !== profile.name || category.lifeSpan !== profile.lifeSpan || !category.isActive)) throw new Error(`Categoria existente divergente: ${profile.code}; preservar e conciliar.`);
        const id = category?.id ?? profile.id;
        const account = (code: string) => {
          const matches = catalog.entries.filter(entry => entry.code === code && entry.kind === "ACCOUNT");
          if (matches.length !== 1) throw new Error(`Conta municipal sem vínculo único: ${code}.`);
          const attributes = matches[0].attributes as Prisma.JsonObject;
          if (attributes.operational !== true || attributes.pocOnly !== false || attributes.postingAllowed !== true) throw new Error(`Conta municipal indisponível: ${code}.`);
          return matches[0].canonicalId;
        };
        const debitAccountId = account(profile.realEstate ? "3.3.3.1.1.01.02.00.00.00.00.00" : "3.3.3.1.1.01.01.00.00.00.00.00");
        const creditAccountId = account(profile.credit);
        if (await tx.accountingPlan.count({ where: { id: { in: [debitAccountId, creditAccountId] } } }) !== 2) throw new Error("Contas de depreciação inexistentes.");
        const eventCode = `ASSET_DEPRECIATION:${id}`;
        const event = await tx.accountingEventCatalog.findUnique({ where: { code: eventCode }, include: { rules: { where: { isActive: true } } } });
        if (event && (!event.isActive || event.rules.length !== 1 || event.rules[0].isReference || event.rules[0].debitAccountId !== debitAccountId || event.rules[0].creditAccountId !== creditAccountId)) throw new Error(`Matriz patrimonial existente divergente: ${eventCode}.`);
        if (audit && (!category || !event)) throw new Error("Adoção auditada com configuração incompleta.");
        if (apply && !category) await tx.assetCategory.create({ data: { id, code: profile.code, name: profile.name, lifeSpan: profile.lifeSpan } });
        if (apply && !event) await tx.accountingEventCatalog.create({ data: { code: eventCode, name: `Depreciação — ${profile.name}`, description: decision, rules: { create: { debitAccountId, creditAccountId, isReference: false, description: `${catalogId}; ${decision}` } } } });
        result.push({ ...profile, id, eventCode, debitAccountId, creditAccountId });
      }
      if (apply && !audit) await tx.financialAuditLog.create({ data: { action: "ADOPT_ASSET_DEPRECIATION_PROFILES", entityType: "MunicipalAssetParameterization", entityId: adoptionId, authorUsuarioId: actor.id, payload: { catalogId, catalogHash, decision, profiles: result } } });
      const auditCount = await tx.financialAuditLog.count({ where: { action: "ADOPT_ASSET_DEPRECIATION_PROFILES", entityId: adoptionId } });
      if ((apply || audit) && auditCount !== 1) throw new Error("Auditoria municipal patrimonial divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", adoptionId, catalogId, auditCount, decision, profiles: result };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
