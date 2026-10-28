import { eq } from "drizzle-orm";
import { createTaxChainDatabase, firstTaxRow } from "./tax-chain-database";
import { taxpayers } from "../../src/db/schema/registry";
import { taxes } from "../../src/db/schema/taxation-core";
import { accountingPlans } from "../../src/db/schema/finance-accounting";
import { planningCatalogVersions, planningCatalogEntries, planningEntityUnits } from "../../src/db/schema/planning-catalog";
import { configureTaxFinancialMapping } from "../../src/lib/tributacao";
import { configureTaxAccountingProfile } from "../../src/lib/tributacao/accounting-profile";

export async function createTaxDocumentFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE") {
  const f = await createTaxChainDatabase(jurisdiction);
  try {
    const binding = firstTaxRow(await f.db.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, "ug")));
    for (const id of ["seller", "buyer-one", "buyer-two"]) await f.db.insert(taxpayers).values({ id, taxpayerType: "PF", status: "Ativo" });
    for (const name of ["ISS", "ITBI"]) {
      await f.db.insert(taxes).values({ id: name, name, taxType: "Imposto", isActive: true });
      await configureTaxFinancialMapping(f.connection, f.actor, { taxId: name, revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" });
    }
    const accounts = ["document-right", "document-vpa", "document-deduction", "document-loss", "document-debt-right", "document-debt-loss"];
    for (const [index, id] of accounts.entries()) await f.db.insert(accountingPlans).values({ id, code: `doc.${index}`, name: id, type: [0, 4].includes(index) ? "Ativo" : [3, 5].includes(index) ? "VPD" : "VPA" });
    await f.db.insert(planningCatalogVersions).values({ id: "document-catalog", year: 2026, label: "Classificações da base isolada", normativeReference: "Fixture PostgreSQL isolada", sourceHash: "document-fixture", status: "DRAFT", createdById: "ana" });
    await f.db.insert(planningCatalogEntries).values(accounts.map((id, index) => ({ versionId: "document-catalog", kind: "ACCOUNT", degree: 7, code: `doc.${index}`, name: id, canonicalId: id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: index === 1 ? "C" : "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } })));
    await f.db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "document-catalog"));
    for (const taxId of ["ISS", "ITBI"]) await configureTaxAccountingProfile(f.connection, f.actor, { taxId, budgetUnitId: "ug", catalogVersionId: "document-catalog", receivableAccountId: accounts[0], revenueAccountId: accounts[1], deductionAccountId: accounts[2], lossAccountId: accounts[3], effectiveFrom: new Date("2026-01-01"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), reason: "Perfil da base isolada", idempotencyKey: `document-profile:${taxId}` });
    await f.database.exec(`
      INSERT INTO "EconomicRegistration" (id,"municipalInsc","taxpayerId",status,"updatedAt") VALUES ('document-registration','DOC-01','seller','Ativo',CURRENT_TIMESTAMP);
      INSERT INTO "TaxServiceActivity" (id,"taxId",code,name,"issRate","isActive","updatedAt") VALUES ('document-activity','ISS','SERVICO','Serviço','5',true,CURRENT_TIMESTAMP);
      INSERT INTO "TaxParameter" (id,"taxId",code,name,"calculationType",configuration,"effectiveFrom","updatedAt") VALUES ('document-parameter','ISS','ISS','ISS','PERCENTUAL_BASE','{"formula":"PERCENTUAL_BASE","rate":"5","nfseCancellationDays":10}','2026-01-01',CURRENT_TIMESTAMP);
      INSERT INTO "NfseCredentialRequest" (id,"taxpayerId","economicRegistrationId","serviceActivityId",status,"termsAcceptedAt","createdByUsuarioId","updatedAt") VALUES ('document-credential','seller','document-registration','document-activity','HABILITADO','2026-01-01','ana',CURRENT_TIMESTAMP);
    `);
    return { ...f, scope: { budgetUnitId: "ug", governmentEntityId: binding.governmentEntityId } };
  } catch (error) { await f.close(); throw error; }
}
