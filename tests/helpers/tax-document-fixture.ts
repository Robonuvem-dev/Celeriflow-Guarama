import { createPlanningExecutionFixture } from "./planning-execution-fixture";
import { configureTaxFinancialMapping } from "../../src/lib/tributacao";
import { configureTaxAccountingProfile } from "../../src/lib/tributacao/accounting-profile";

export async function createTaxDocumentFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE") {
  const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
  try {
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    const binding = await f.db.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: "ug" } });
    for (const id of ["seller", "buyer-one", "buyer-two"]) await f.db.taxpayer.create({ data: { id, taxpayerType: "PF", status: "Ativo" } });
    for (const name of ["ISS", "ITBI"]) {
      await f.db.tax.create({ data: { id: name, name, taxType: "Imposto", isActive: true } });
      await configureTaxFinancialMapping(f.db, f.actor, { taxId: name, revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" });
    }
    const accounts = ["document-right", "document-vpa", "document-deduction", "document-loss", "document-debt-right", "document-debt-loss"];
    for (const [index, id] of accounts.entries()) await f.db.accountingPlan.create({ data: { id, code: `doc.${index}`, name: id, type: [0, 4].includes(index) ? "Ativo" : [3, 5].includes(index) ? "VPD" : "VPA" } });
    await f.db.planningCatalogVersion.create({ data: { id: "document-catalog", year: 2026, label: "Classificações da base isolada", normativeReference: "Fixture PostgreSQL isolada", sourceHash: "document-fixture", status: "DRAFT", createdById: "ana", entries: { create: accounts.map((id, index) => ({ kind: "ACCOUNT", degree: 7, code: `doc.${index}`, name: id, canonicalId: id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: index === 1 ? "C" : "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } })) } } });
    await f.db.planningCatalogVersion.update({ where: { id: "document-catalog" }, data: { status: "PUBLISHED" } });
    for (const taxId of ["ISS", "ITBI"]) await configureTaxAccountingProfile(f.db, f.actor, { taxId, budgetUnitId: "ug", catalogVersionId: "document-catalog", receivableAccountId: accounts[0], revenueAccountId: accounts[1], deductionAccountId: accounts[2], lossAccountId: accounts[3], effectiveFrom: new Date("2026-01-01"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), reason: "Perfil da base isolada", idempotencyKey: `document-profile:${taxId}` });
    await f.db.economicRegistration.create({ data: { id: "document-registration", municipalInsc: "DOC-01", taxpayerId: "seller", status: "Ativo" } });
    await f.db.taxServiceActivity.create({ data: { id: "document-activity", taxId: "ISS", code: "SERVICO", name: "Serviço", issRate: "5", isActive: true } });
    await f.db.taxParameter.create({ data: { id: "document-parameter", taxId: "ISS", code: "ISS", name: "ISS", calculationType: "PERCENTUAL_BASE", configuration: { formula: "PERCENTUAL_BASE", rate: "5", nfseCancellationDays: 10 }, effectiveFrom: new Date("2026-01-01") } });
    await f.db.nfseCredentialRequest.create({ data: { taxpayerId: "seller", economicRegistrationId: "document-registration", serviceActivityId: "document-activity", status: "HABILITADO", termsAcceptedAt: new Date("2026-01-01"), createdByUsuarioId: f.actor.usuarioId } });
    return { ...f, scope: { budgetUnitId: "ug", governmentEntityId: binding.governmentEntityId } };
  } catch (error) { await f.close(); throw error; }
}
