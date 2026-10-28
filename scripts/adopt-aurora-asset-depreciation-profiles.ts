import { config } from "dotenv";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-catalog";
import { accountingEvents, accountingPlans, accountingRules } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { assetCategories } from "../src/db/schema/assets";
import { users } from "../src/db/schema/identity";

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
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  try {
    const report = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${adoptionId}, 0))::text`);
      const [catalog] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, catalogId)).limit(1);
      if (!catalog || catalog.status !== "PUBLISHED" || catalog.sourceHash !== catalogHash) throw new Error("Contas municipais de depreciação divergentes.");
      const entries = await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, catalogId));
      const [actor] = await tx.select({ id: users.id }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.createdAt)).limit(1);
      if (!actor) throw new Error("Usuário ativo para adoção patrimonial indisponível.");
      const result = [];
      const [audit] = await tx.select({ id: financialAuditLogs.id }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ADOPT_ASSET_DEPRECIATION_PROFILES"), eq(financialAuditLogs.entityId, adoptionId))).limit(1);
      for (const profile of profiles) {
        const [category] = await tx.select().from(assetCategories).where(eq(assetCategories.code, profile.code)).limit(1);
        if (category && (category.name !== profile.name || category.lifeSpan !== profile.lifeSpan || !category.isActive)) throw new Error(`Categoria existente divergente: ${profile.code}; preservar e conciliar.`);
        const id = category?.id ?? profile.id;
        const account = (code: string) => {
          const matches = entries.filter(entry => entry.code === code && entry.kind === "ACCOUNT");
          if (matches.length !== 1) throw new Error(`Conta municipal sem vínculo único: ${code}.`);
          const attributes = matches[0].attributes;
          if (!attributes || typeof attributes !== "object" || Array.isArray(attributes) || attributes.operational !== true || attributes.pocOnly !== false || attributes.postingAllowed !== true) throw new Error(`Conta municipal indisponível: ${code}.`);
          return matches[0].canonicalId;
        };
        const debitAccountId = account(profile.realEstate ? "3.3.3.1.1.01.02.00.00.00.00.00" : "3.3.3.1.1.01.01.00.00.00.00.00");
        const creditAccountId = account(profile.credit);
        const [{ total: accountCount }] = await tx.select({ total: count() }).from(accountingPlans).where(inArray(accountingPlans.id, [debitAccountId, creditAccountId]));
        if (accountCount !== 2) throw new Error("Contas de depreciação inexistentes.");
        const eventCode = `ASSET_DEPRECIATION:${id}`;
        const [event] = await tx.select().from(accountingEvents).where(eq(accountingEvents.code, eventCode)).limit(1);
        const rules = event ? await tx.select().from(accountingRules).where(and(eq(accountingRules.eventId, event.id), eq(accountingRules.isActive, true))) : [];
        if (event && (!event.isActive || rules.length !== 1 || rules[0].isReference || rules[0].debitAccountId !== debitAccountId || rules[0].creditAccountId !== creditAccountId)) throw new Error(`Matriz patrimonial existente divergente: ${eventCode}.`);
        if (audit && (!category || !event)) throw new Error("Adoção auditada com configuração incompleta.");
        if (apply && !category) await tx.insert(assetCategories).values({ id, code: profile.code, name: profile.name, lifeSpan: profile.lifeSpan });
        if (apply && !event) {
          const [created] = await tx.insert(accountingEvents).values({ code: eventCode, name: `Depreciação — ${profile.name}`, description: decision }).returning({ id: accountingEvents.id });
          await tx.insert(accountingRules).values({ eventId: created.id, debitAccountId, creditAccountId, isReference: false, description: `${catalogId}; ${decision}` });
        }
        result.push({ ...profile, id, eventCode, debitAccountId, creditAccountId });
      }
      if (apply && !audit) await tx.insert(financialAuditLogs).values({ action: "ADOPT_ASSET_DEPRECIATION_PROFILES", entityType: "MunicipalAssetParameterization", entityId: adoptionId, authorUsuarioId: actor.id, payload: { catalogId, catalogHash, decision, profiles: result } });
      const [{ total: auditCount }] = await tx.select({ total: count() }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ADOPT_ASSET_DEPRECIATION_PROFILES"), eq(financialAuditLogs.entityId, adoptionId)));
      if ((apply || audit) && auditCount !== 1) throw new Error("Auditoria municipal patrimonial divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", adoptionId, catalogId, auditCount, decision, profiles: result };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
