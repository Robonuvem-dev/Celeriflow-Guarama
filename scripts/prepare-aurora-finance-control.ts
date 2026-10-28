import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import type { JsonObject, JsonValue } from "../src/db/json";
import * as t from "../src/db/schema/finance-setup-tools";
import { createSetupEdition, openFinanceSetupConnection, publishSetupEdition, readSetupActor, readSetupAudit, readSetupBinding, readSetupEntry, readSetupYear, setupFingerprint, setupRequired } from "./lib/finance-setup-tools";
import { costSourceTypes, standardCostItems } from "../src/lib/financeiro/cost-types";
import { controlChecklistCatalog } from "../src/lib/c7/checklist-catalog";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-finance-control-2026-v1";
const decision = "Preparação operacional autorizada pelo responsável: contas exemplificativas com saldo inicial zero, fonte livre, naturezas oficiais de principal e parâmetros municipais estimados ajustáveis. Sem convênio bancário, lei ou saldo histórico presumido.";
const entities = [
  { id: "p0-current-exe", unitId: "p0-current-exe-ug-1", suffix: "exe", accountNumber: "10001-0" },
  { id: "p0-current-leg", unitId: "p0-current-leg-ug-1", suffix: "leg", accountNumber: "20001-1" },
];
const taxes = [
  { id: "tax_iptu", code: "1.1.1.2.50.0.1.00.00.00.00.00" },
  { id: "tax_itbi", code: "1.1.1.2.53.0.1.00.00.00.00.00" },
  { id: "tax_issqn", code: "1.1.1.4.51.1.1.00.00.00.00.00" },
];
const accountSourceId = "p1-tce-pr-account-2026-1.0d";
const accountHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const revenueSourceId = "p1-tce-pr-revenue-2026-1.0e";
const revenueHash = "2ee071dfb6ecf33462ff4ea047445dd1122786c735bb46ac0b8008952b501e97";
const cashCode = "1.1.1.1.1.19.00.00.00.00.00.00";
const sourceId = "aurora-source-1500";
const sourceName = "Recursos não vinculados de impostos";
const hash = createHash("sha256").update(JSON.stringify({ key, decision, entities, taxes, accountHash, revenueHash, cashCode, sourceId, sourceName, costSourceTypes, standardCostItems, controlChecklistCatalog })).digest("hex");
const object = (value: JsonValue): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));

export async function prepareFinanceControl(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const actor = await readSetupActor(tx, true);
      const sourceVersions = await tx.select().from(t.setupCatalogVersions).where(inArray(t.setupCatalogVersions.id, [accountSourceId, revenueSourceId]));
      if (!sourceVersions.some(version => version.id === accountSourceId && version.sourceHash === accountHash && version.year === 2026) || !sourceVersions.some(version => version.id === revenueSourceId && version.sourceHash === revenueHash && version.year === 2026)) throw new Error("Referências oficiais divergentes; preservar a configuração atual.");
      const cash = await readSetupEntry(tx, `${accountSourceId}:${cashCode}`);
      const cashAttributes = object(cash.attributes);
      if (cash.kind !== "ACCOUNT" || cashAttributes.postingAllowed !== true || cashAttributes.informationNature !== "P" || cashAttributes.balanceNature !== "D") throw new Error("Classificação bancária não escritural ou incompatível.");
      const revenueEntries = await tx.select().from(t.setupCatalogEntries).where(and(eq(t.setupCatalogEntries.versionId, revenueSourceId), eq(t.setupCatalogEntries.kind, "REVENUE"), inArray(t.setupCatalogEntries.code, taxes.map(tax => tax.code))));
      if (revenueEntries.length !== taxes.length || revenueEntries.some(entry => object(entry.attributes).postingAllowed !== true)) throw new Error("Naturezas analíticas de principal incompletas; conferir os códigos da referência.");
      const bank = setupRequired((await tx.select().from(t.setupBanks).where(eq(t.setupBanks.compe, "001")).limit(1))[0], "Banco");
      if (bank.status !== "ATIVO") throw new Error("Banco cadastral inativo.");
      const prior = await readSetupAudit(tx, "PREPARE_AURORA_FINANCE_CONTROL", key);
      if (prior && object(prior.payload).configurationHash !== hash) throw new Error("Preparação anterior divergente; nenhuma configuração será sobrescrita.");
      for (const entity of entities) {
        const binding = await readSetupBinding(tx, entity.unitId);
        if (binding.governmentEntityId !== entity.id) throw new Error("UG não pertence ao ente explícito.");
        const year = await readSetupYear(tx, entity.id);
        if (!["Preparação", "Aberto"].includes(year.status)) throw new Error("Exercício em fechamento não pode ser preparado.");
      }
      const existingSource = (await tx.select().from(t.setupSources).where(eq(t.setupSources.code, "1500")).limit(1))[0] ?? null;
      if (existingSource && existingSource.id !== sourceId) throw new Error("Fonte 1500 já cadastrada com outro ID; conciliar antes de preparar.");
      for (const tax of taxes) {
        const record = setupRequired((await tx.select().from(t.setupTaxes).where(eq(t.setupTaxes.id, tax.id)).limit(1))[0], "Tributo");
        if (!record.isActive) throw new Error(`Tributo inativo: ${tax.id}.`);
        const mapping = (await tx.select().from(t.setupTaxMappings).where(eq(t.setupTaxMappings.taxId, tax.id)).limit(1))[0] ?? null;
        if (mapping && (mapping.resourceSourceId !== sourceId || mapping.revenueNatureId !== `aurora-revenue:${tax.code}` || mapping.defaultBankAccountId !== `${key}:bank:exe`)) throw new Error(`Mapeamento preexistente divergente: ${tax.id}.`);
      }
      // Fingerprint of financial facts: configuration never creates or modifies municipal movements.
      const facts = async () => {
        const tables = ["AccountingTransaction", "AccountingEntry", "Revenue", "TaxAssessment", "TaxGuide", "TaxPayment", "TreasuryMovement", "Commitment", "Settlement", "Payment"] as const;
        const rows: Array<{ name: string; fingerprint: string }> = [];
        for (const name of tables) {
          rows.push({ name, fingerprint: await setupFingerprint(tx, name) });
        }
        return rows;
      };
      const before = await facts();
      if (apply && !prior) {
        await tx.insert(t.setupSources).values({ id: sourceId, code: "1500", name: sourceName }).onConflictDoNothing({ target: t.setupSources.id });
        const revenueVersionId = `${key}:revenue`;
        for (const entry of revenueEntries) await tx.insert(t.setupRevenueNatures).values({ id: `aurora-revenue:${entry.code}`, code: entry.code, name: entry.name }).onConflictDoNothing({ target: t.setupRevenueNatures.id });
        await createSetupEdition(tx, { id: revenueVersionId, year: 2026, label: "Aurora das Veredas — receitas tributárias e fonte livre", status: "DRAFT", sourceHash: hash, normativeReference: decision, createdById: actor.id }, [
          ...revenueEntries.map(entry => ({ kind: "REVENUE", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: `aurora-revenue:${entry.code}`, attributes: { ...object(entry.attributes), operational: true, mapped: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId: revenueSourceId, decision } })),
          { kind: "SOURCE", code: "1500", name: sourceName, degree: 1, canonicalId: sourceId, attributes: { operational: true, mapped: true, pocOnly: false, parameterOrigin: "OWNER_ESTIMATE", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", decision } },
        ]);
        await publishSetupEdition(tx, revenueVersionId);
        for (const entity of entities) {
          const year = await readSetupYear(tx, entity.id);
          if (year.status === "Preparação") {
            await tx.update(t.setupYears).set({ status: "Aberto" }).where(eq(t.setupYears.id, year.id));
            await tx.insert(t.setupAudits).values({ action: "STATUS_CHANGE", entityType: "FinancialYear", entityId: year.id, financialYearId: year.id, authorUsuarioId: actor.id, payload: { previousStatus: year.status, status: "Aberto", decision } });
          }
          const accountId = `${key}:account:${entity.suffix}`;
          const versionId = `${key}:bank:${entity.suffix}`;
          const bankCatalogHash = createHash("sha256").update(JSON.stringify({ configurationHash: hash, versionId, accountId, cashCode, entity })).digest("hex");
          await tx.insert(t.setupPlans).values({ id: accountId, code: `AURORA.BB.${entity.suffix.toUpperCase()}.1000`, name: `Banco do Brasil — ${entity.suffix === "exe" ? "Prefeitura" : "Câmara"} — ${entity.accountNumber}`, type: "Ativo" });
          await createSetupEdition(tx, { id: versionId, year: 2026, label: `Aurora das Veredas — razão bancário ${entity.suffix}`, sourceHash: bankCatalogHash, normativeReference: decision, status: "DRAFT", createdById: actor.id }, [{ kind: "ACCOUNT", code: cashCode, name: cash.name, degree: cash.degree, canonicalId: accountId, attributes: { ...cashAttributes, governmentEntityId: entity.id, budgetUnitId: entity.unitId, operational: true, mapped: true, pocOnly: false, sourceVersionId: accountSourceId, sourceEntryId: cash.id, parameterOrigin: "OWNER_ESTIMATE", decision } }]);
          await publishSetupEdition(tx, versionId);
          await tx.insert(t.setupBankAccounts).values({ id: versionId, bankId: bank.id, bankName: bank.name, agency: "0001", accountNumber: entity.accountNumber, accountType: "Movimento", accountingPlanId: accountId, budgetUnitId: entity.unitId, resourceSourceId: sourceId, currentBalance: 0, currentBalanceDecimal: new Decimal("0"), purpose: "Conta de movimentação municipal — parametrização inicial ajustável", isActive: true });
          await tx.insert(t.setupCostPolicies).values({ id: `${key}:policy:${entity.suffix}`, governmentEntityId: entity.id, effectiveFrom: new Date("2026-01-01"), enabled: true, sourceTypes: [...costSourceTypes], reason: decision, actorId: actor.id });
          const costObjectId = `${key}:cost-object:${entity.suffix}`;
          await tx.insert(t.setupCostObjects).values({ id: costObjectId, financialYearId: year.id, budgetUnitId: entity.unitId, code: "001", description: "Administração geral", detailedDescription: "Serviços administrativos municipais; estrutura inicial ajustável", sourceKey: key, sourceSnapshot: { decision, parameterOrigin: "OWNER_ESTIMATE" } });
          for (const item of standardCostItems) {
            const itemId = `${key}:item:${entity.suffix}:${item.identifier}`;
            await tx.insert(t.setupCostItems).values({ ...item, id: itemId, financialYearId: year.id, identificationClass: "TEXTO", detailedDescription: `${item.description} — classificação inicial ajustável` });
            await tx.insert(t.setupCostObjectItems).values({ objectId: costObjectId, itemId });
          }
          const planId = `${key}:plan:${entity.suffix}`;
          await tx.insert(t.setupControlPlans).values({ id: planId, title: "Plano anual de Controle Interno 2026", reference: decision, budgetUnitId: entity.unitId, ownerId: actor.id });
          await tx.insert(t.setupControlEvents).values({ planId, eventType: "PLAN_CREATED", actorId: actor.id, reason: decision, snapshot: { title: "Plano anual de Controle Interno 2026", reference: decision, budgetUnitId: entity.unitId, dueAt: null } });
          let number = 0;
          const groups = controlChecklistCatalog.flatMap(template => template.groups.map(group => ({ ...group, name: `${template.title} — ${group.name}`, items: group.items.map(item => ({ ...item, number: ++number })) })));
          await tx.insert(t.setupControlEvents).values({ planId, eventType: "CHECKLIST_PUBLISHED", actorId: actor.id, reason: "Verificações operacionais municipais", snapshot: json({ title: "Verificações operacionais municipais", category: "Gestão municipal", groups }) });
        }
        for (const tax of taxes) await tx.insert(t.setupTaxMappings).values({ taxId: tax.id, revenueNatureId: `aurora-revenue:${tax.code}`, resourceSourceId: sourceId, defaultBankAccountId: `${key}:bank:exe`, isActive: true });
        await tx.insert(t.setupAudits).values({ action: "PREPARE_AURORA_FINANCE_CONTROL", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, decision, parameterOrigin: "OWNER_ESTIMATE", entities, taxIds: taxes.map(tax => tax.id), bankSelection: "EXEMPLIFICATIVE_NOT_CONVENIO", openingBalances: "ZERO", before: json(before) } });
      }
      const after = await facts();
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Preservação dos fatos financeiros falhou; preparação revertida.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", configurationHash: hash, replay: Boolean(prior), actorId: actor.id, entities, taxIds: taxes.map(tax => tax.id), decision, financialFactsPreserved: true, profilesNext: "adopt-aurora-tax-accrual-profiles.ts --apply" };
    }, { timeoutMs: 180000 });
}
async function main() {
  const connection = openFinanceSetupConnection(20000);
  try { console.log(JSON.stringify(await prepareFinanceControl(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação operacional."); process.exitCode = 1; });
