import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import * as t from "../src/db/schema/finance-setup-tools";
import { createSetupEdition, publishSetupEdition, adoptSetupBankSources, adoptSetupPostingRule } from "./lib/finance-setup-tools";
import { configureTaxFinancialMapping } from "../src/lib/tributacao";
import { configureTaxAccountingProfile } from "../src/lib/tributacao/accounting-profile";
import { populationContext } from "./lib/population-context";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const apply = process.argv.includes("--apply"), key = "municipal-financial-foundation-20261108";
const unitId = "aurora-system-v1:budget-unit:008", entityId = "p0-current-exe";
const sourceId = "aurora-mg-50k-v1:source-1.500.000:000";
const accountId = (code: string) => `${key}:account:${code}`;
const accountVersion = `${key}:accounts`, bankId = `${key}:bank`;
const reason = "Organização do razão municipal, da arrecadação e dos direitos tributários para os casos autorizados da carga de 2026.";
const taxes = [
  { id: "tax_iptu", revenue: "1.1.1.2.50.0.1.00.00.00.00.00", right: "1.1.2.1.1.01.05.00.00.00.00.00", vpa: "4.1.1.2.1.02.00.00.00.00.00.00", deduction: "4.1.1.2.1.97.02.00.00.00.00.00" },
  { id: "tax_itbi", revenue: "1.1.1.2.53.0.1.00.00.00.00.00", right: "1.1.2.1.1.01.06.00.00.00.00.00", vpa: "4.1.1.2.1.04.00.00.00.00.00.00", deduction: "4.1.1.2.1.97.04.00.00.00.00.00" },
  { id: "tax_issqn", revenue: "1.1.1.4.51.1.1.00.00.00.00.00", right: "1.1.2.1.1.01.07.00.00.00.00.00", vpa: "4.1.1.3.1.02.00.00.00.00.00.00", deduction: "4.1.1.3.1.97.02.00.00.00.00.00" },
];
const cash = "1.1.1.1.1.19.00.00.00.00.00.00", loss = "3.6.5.1.1.03.00.00.00.00.00.00";
const report = { mode: apply ? "APPLY" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), reused: false, references: {} as Record<string, unknown>, status: "RUNNING", error: "" };
async function main() {
  try {
    const context = await populationContext(), actor = { usuarioId: context.user.id, employeeId: context.user.employeeId };
    const rollback = new Error("POPULATION_PREVIEW_ROLLBACK");
    try {
      await withDatabaseTransaction(databaseConnection, tx => inDatabaseTransactionScope(databaseConnection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        const [prior] = await tx.select().from(t.setupAudits).where(and(eq(t.setupAudits.action, "MUNICIPAL_POPULATION_PACKAGE"), eq(t.setupAudits.entityId, key))).limit(1);
        if (prior) { report.reused = true; report.references = { receiptId: prior.id }; return; }
        const [binding] = await tx.select().from(t.setupBindings).where(eq(t.setupBindings.budgetUnitId, unitId));
        assert.equal(binding?.governmentEntityId, entityId);
        const [year] = await tx.select().from(t.setupYears).where(and(eq(t.setupYears.governmentEntityId, entityId), eq(t.setupYears.year, 2026)));
        assert.equal(year?.status, "Aberto");
        const [source] = await tx.select().from(t.setupSources).where(eq(t.setupSources.id, sourceId));
        assert.ok(source);
        const accountCodes = [cash, loss, ...taxes.flatMap(tax => [tax.right, tax.vpa, tax.deduction])];
        const entries = await tx.select().from(t.setupCatalogEntries).where(and(eq(t.setupCatalogEntries.versionId, "p1-tce-pr-account-2026-1.0d"), inArray(t.setupCatalogEntries.code, accountCodes)));
        assert.equal(entries.length, accountCodes.length);
        const object = (value: unknown) => value as Record<string, string | boolean>;
        for (const entry of entries) {
          const attributes = object(entry.attributes);
          assert.equal(attributes.postingAllowed, true, `Conta não escritural: ${entry.code}`);
          await tx.insert(t.setupPlans).values({ id: accountId(entry.code), code: entry.code, name: entry.name, type: attributes.balanceNature === "C" ? "Credora" : "Devedora" });
        }
        await createSetupEdition(tx, { id: accountVersion, year: 2026, label: "Razão municipal — arrecadação e direitos tributários", status: "DRAFT", sourceHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex"), normativeReference: reason, createdById: context.user.id }, entries.map(entry => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: accountId(entry.code), attributes: { ...object(entry.attributes), effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", governmentEntityId: entityId, budgetUnitId: unitId, operational: true, mapped: true, pocOnly: false, sourceVersionId: entry.versionId, sourceEntryId: entry.id } })));
        await publishSetupEdition(tx, accountVersion);
        const revenueEntries = await tx.select().from(t.setupCatalogEntries).where(and(eq(t.setupCatalogEntries.versionId, "p1-tce-pr-revenue-2026-1.0e"), inArray(t.setupCatalogEntries.code, taxes.map(tax => tax.revenue))));
        assert.equal(revenueEntries.length, 3);
        const revenueMap = new Map<string, string>();
        for (const entry of revenueEntries) {
          assert.equal(object(entry.attributes).postingAllowed, true);
          const [existing] = await tx.select().from(t.setupRevenueNatures).where(eq(t.setupRevenueNatures.code, entry.code));
          const id = existing?.id ?? `${key}:revenue:${entry.code}`;
          if (!existing) await tx.insert(t.setupRevenueNatures).values({ id, code: entry.code, name: entry.name });
          revenueMap.set(entry.code, id);
        }
        await createSetupEdition(tx, { id: `${key}:revenue`, year: 2026, label: "Naturezas de arrecadação e recursos ordinários", status: "DRAFT", sourceHash: createHash("sha256").update(JSON.stringify(revenueEntries)).digest("hex"), normativeReference: reason, createdById: context.user.id }, [
          ...revenueEntries.map(entry => ({ kind: "REVENUE", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: revenueMap.get(entry.code)!, attributes: { ...object(entry.attributes), operational: true, mapped: true, pocOnly: false, sourceVersionId: entry.versionId, sourceEntryId: entry.id } })),
          { kind: "SOURCE", code: source.code, name: source.name, degree: 1, canonicalId: source.id, attributes: { effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", operational: true, mapped: true, pocOnly: false } },
        ]);
        await publishSetupEdition(tx, `${key}:revenue`);
        const [bank] = await tx.select().from(t.setupBanks).where(and(eq(t.setupBanks.compe, "001"), eq(t.setupBanks.status, "ATIVO"))).limit(1);
        assert.ok(bank);
        await tx.insert(t.setupBankAccounts).values({ id: bankId, bankId: bank.id, bankName: bank.name, agency: "4821-0", accountNumber: "980110-8", accountType: "Movimento", budgetUnitId: unitId, resourceSourceId: source.id, accountingPlanId: accountId(cash), currentBalance: 0, currentBalanceDecimal: new Decimal(0), purpose: "Arrecadação municipal de tributos" });
        await adoptSetupBankSources(tx, actor, bankId, [source.id]);
        for (const tax of taxes) {
          await configureTaxFinancialMapping(databaseConnection, actor, { taxId: tax.id, revenueNatureId: revenueMap.get(tax.revenue)!, resourceSourceId: source.id, defaultBankAccountId: bankId });
          await configureTaxAccountingProfile(databaseConnection, actor, { taxId: tax.id, budgetUnitId: unitId, catalogVersionId: accountVersion, receivableAccountId: accountId(tax.right), revenueAccountId: accountId(tax.vpa), deductionAccountId: accountId(tax.deduction), lossAccountId: accountId(loss), effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), reason, idempotencyKey: `${key}:${tax.id}` });
        }
        await adoptSetupPostingRule(tx, actor, { eventCode: "RECEITA_ARRECADADA", eventName: "Arrecadação de receita tributária", debitAccountId: accountId(cash), creditAccountId: accountId(taxes[0].vpa), isReference: false, description: reason });
        report.references = { financialYearId: year.id, budgetUnitId: unitId, governmentEntityId: entityId, bankAccountId: bankId, resourceSourceId: source.id, accountVersion, accounts: entries.length, taxIds: taxes.map(tax => tax.id) };
        await tx.insert(t.setupAudits).values({ action: "MUNICIPAL_POPULATION_PACKAGE", entityType: "DATASET", entityId: key, authorUsuarioId: context.user.id, payload: { fictional: true, references: JSON.parse(JSON.stringify(report.references)) } });
        if (!apply) throw rollback;
      }), { timeoutMs: 240_000 });
    } catch (error) { if (error !== rollback) throw error; }
    report.status = "PASS";
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.message.slice(0, 600) : "Falha na fundação financeira"; process.exitCode = 1; }
  finally { const output = "docs/plano-populacao-2026-11-08/execucao/financeiro"; mkdirSync(output, { recursive: true }); writeFileSync(`${output}/${apply ? "foundation-applied" : "foundation-preview"}.json`, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2)); await databaseConnection.pool.end(); }
}
void main();
