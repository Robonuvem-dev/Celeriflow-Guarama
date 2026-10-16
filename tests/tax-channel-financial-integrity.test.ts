import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { configureTaxFinancialMapping } from "../src/lib/tributacao";
import { processCollectionReturn } from "../src/lib/tributacao/s2-service";
import { reverseTaxPayment } from "../src/lib/tributacao/payment-reversal";
import { issueScheduledAssessmentGuides } from "../src/lib/tributacao/scheduled-guides";
import { readAnnualTaxSummary } from "../src/lib/tributacao/annual-tax-summary";
import { selectDebtNoticeTargets, issueDebtNoticeBatch } from "../src/lib/tributacao/debt-notices";
import { createEconomicRegistrationWithProfile } from "../src/lib/tributacao/economic-profile";
import { updateEconomicRegistrationWithHistory } from "../src/lib/tributacao/economic-history";
import { readEconomicProfiles } from "../src/lib/tributacao/economic-query";
import { bulkChangeEconomicProfiles } from "../src/lib/tributacao/economic-operations";
import { publishFiscalCatalog } from "../src/lib/tributacao/configurable-cadastres";
import { issuePortalEconomicDocument, renderPortalEconomicDocument } from "../src/lib/tributacao/portal-economic-documents";

async function migrate(f: Awaited<ReturnType<typeof createPlanningExecutionFixture>>) {
  for (const name of ["20261015100000_tax_property_cadastral_history", "20261015120000_configured_fiscal_records", "20261015130000_economic_profile_history", "20261015220000_tax_channel_document_integrity"]) await f.pg.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
}

test("Tributação: cota condicionada só reduz crédito no retorno integral; repetição e estorno preservam caixa e recomposição", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    await migrate(f); await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await f.db.tax.create({ data: { id: "iss", name: "ISS", taxType: "Imposto" } });
    await f.db.taxpayer.create({ data: { id: "payer", taxpayerType: "PF", status: "Ativo" } });
    await configureTaxFinancialMapping(f.db, f.actor, { taxId: "iss", revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" });
    const option = { code: "UNICA", name: "Cota única", dueDate: "2026-12-31", discountPercent: "10", debtCheck: "CURRENT", debtTaxIds: [], legalBasis: "Lei municipal informada" };
    const assessment = await f.db.taxAssessment.create({ data: { taxpayerId: "payer", taxId: "iss", year: 2026, originalValue: 100, originalValueDecimal: "100", finalValueDecimal: "100", calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug", paymentOptions: [option] } } });
    const unknown = await f.db.taxAssessment.create({ data: { taxpayerId: "payer", taxId: "iss", year: 2026, originalValue: 5, originalValueDecimal: "5", finalValueDecimal: "5" } });
    const emission = { assessmentId: assessment.id, expectedUpdatedAt: assessment.updatedAt.toISOString(), mode: "SINGLE" as const, singleDueDate: null, paymentOptionCode: "UNICA", reason: "Emissão anual conferida" };
    await assert.rejects(issueScheduledAssessmentGuides(f.db, f.actor, emission), /origem conciliada/);
    await f.db.taxAssessment.update({ where: { id: unknown.id }, data: { status: "Cancelado" } });
    const issued = await issueScheduledAssessmentGuides(f.db, f.actor, emission);
    const guide = await f.db.taxGuide.findUniqueOrThrow({ where: { id: issued.guideIds[0] } });
    assert.equal(guide.totalValueDecimal?.toFixed(2), "90.00");
    assert.equal((await f.db.taxAssessment.findUniqueOrThrow({ where: { id: assessment.id } })).finalValueDecimal?.toFixed(2), "100.00");
    const bankReturn = { idempotencyKey: "conditional-return", guideNumber: guide.guideNumber!, amount: "90", occurredAt: new Date(), status: "CONFIRMADO" as const, bankAccountId: "banco" };
    await assert.rejects(processCollectionReturn(f.db, f.actor, { ...bankReturn, amount: "89" }), /pagamento integral/);
    assert.equal(await f.db.taxPayment.count(), 0);
    const first = await processCollectionReturn(f.db, f.actor, bankReturn);
    assert.equal((await processCollectionReturn(f.db, f.actor, bankReturn)).id, first.id);
    const discounted = await f.db.taxAssessment.findUniqueOrThrow({ where: { id: assessment.id } });
    assert.equal(discounted.finalValueDecimal?.toFixed(2), "90.00"); assert.equal(discounted.discountValueDecimal?.toFixed(2), "10.00"); assert.equal(discounted.status, "Pago");
    const summary = await readAnnualTaxSummary(f.db, f.actor, { governmentEntityId: "ente", budgetUnitId: "ug", year: 2026, taxId: "iss", kind: "ALL" });
    assert.equal(summary.rows[0].paid, "90.00"); assert.equal(summary.rows[0].discounts, "10.00"); assert.equal(summary.rows[0].singleAssessments, 1);
    const payment = await f.db.taxPayment.findUniqueOrThrow({ where: { idempotencyKey: "BANK_RETURN:conditional-return" } });
    const reversal = { paymentId: payment.id, date: new Date(), reason: "Estorno do recebimento conciliado", idempotencyKey: "conditional-reverse" };
    await reverseTaxPayment(f.db, f.actor, reversal); await reverseTaxPayment(f.db, f.actor, reversal);
    const restored = await f.db.taxAssessment.findUniqueOrThrow({ where: { id: assessment.id } });
    assert.equal(restored.finalValueDecimal?.toFixed(2), "100.00"); assert.equal(restored.discountValueDecimal?.toFixed(2), "0.00");
    assert.equal(await f.db.taxRegistryEntry.count({ where: { entityId: assessment.id, category: "CONDITIONAL_DISCOUNT_REVERSAL" } }), 1);
    const history = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { entityId: assessment.id, category: "CONDITIONAL_DISCOUNT" } });
    await assert.rejects(f.db.taxRegistryEntry.delete({ where: { id: history.id } }), /imutável/);
  } finally { await f.close(); }
});

test("ISS: alteração geral de perfil/formulário, filtro de endereço, prévia obsoleta e documentos autenticados preservam posições", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    await migrate(f);
    await f.db.configuracaoPerfil.create({ data: { id: "citizen-profile", codigo: "CIDADAO", nome: "Cidadão", permissoes: "{}", ativo: true } });
    await f.db.usuario.create({ data: { id: "citizen", nome: "Interessado", email: "citizen@example.org", perfilId: "citizen-profile", ativo: true } });
    await f.db.taxpayer.create({ data: { id: "payer", taxpayerType: "PF", status: "Ativo" } });
    const address = { street: "Rua Municipal", number: "12", complement: "Sala 2", neighborhood: "Centro", city: "Município", state: "PR", zipCode: "85000-000" };
    const registration = await createEconomicRegistrationWithProfile(f.db, f.actor, { municipalInsc: "ISS-INTEGRITY", taxRegime: "Normal", taxpayerId: "payer", profile: { registrationId: "NEW", expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", accountantTaxpayerId: null, accountantCrc: "", companyType: "Autônomo", realEstateIds: [], primaryCnae: "1234567", secondaryCnaes: [], partners: [], contractNumber: "", contractDate: null, companyAddress: address, correspondenceAddress: address, latitude: null, longitude: null, provisionalUntil: null, validateCompanyDebt: false, validatePartnerDebts: false, documentIds: [], processId: null, reason: "Inclusão conferida" } });
    const catalog = await publishFiscalCatalog(f.db, f.actor, { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, kind: "FORMULARIO_EMPRESA", code: "COMPLEMENTO", name: "Informação econômica", active: true, fields: [{ key: "risk", label: "Risco especial", type: "BOOLEAN", required: true, options: [] }], neighborhoodId: null, streetId: null, landUnitValue: null, legalBasis: "Configuração municipal" });
    const filter = { governmentEntityId: "ente", query: "ISS-INTEGRITY" };
    const targets = (await readEconomicProfiles(f.db, f.actor, filter)).map(row => ({ id: row.id, updatedAt: row.updatedAt, profileVersion: row.profileVersion }));
    const change = { filter, targets, changes: {}, profilePatch: { companyAddress: { ...address, number: "99" } }, form: { catalogId: catalog.entityId, expectedCatalogVersion: catalog.version, expectedRecordVersions: { [registration.id]: 0 }, values: { risk: true } }, processId: null, reason: "Atualização geral conferida" };
    await assert.rejects(bulkChangeEconomicProfiles(f.db, f.actor, { ...change, form: { ...change.form, expectedRecordVersions: { [registration.id]: 1 } } }), /formulário.*alterado/);
    assert.equal((await readEconomicProfiles(f.db, f.actor, filter))[0].profile.companyAddress.number, "12");
    await bulkChangeEconomicProfiles(f.db, f.actor, change);
    assert.equal((await readEconomicProfiles(f.db, f.actor, filter))[0].profile.companyAddress.number, "99");
    await assert.rejects(bulkChangeEconomicProfiles(f.db, f.actor, change), /seleção/);
    await f.db.tax.create({ data: { id: "iss", name: "ISS", taxType: "Imposto" } });
    await f.db.taxAssessment.create({ data: { taxpayerId: "payer", economicRegistrationId: registration.id, taxId: "iss", year: 2026, originalValue: 100, originalValueDecimal: "100", finalValueDecimal: "100", calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" } } });
    await f.db.street.create({ data: { id: "street", name: "Rua Municipal", type: "Rua", city: "Município", state: "PR" } });
    const noticeFilter = { governmentEntityId: "ente", budgetUnitId: "ug", kind: "ECONOMIC" as const, year: 2026, taxId: "iss", taxpayerId: null, propertyId: null, economicRegistrationId: registration.id, streetId: "street", neighborhoodId: null, addressContains: "sala 2", minimumBalance: "0", overdueOnly: false };
    const preview = await selectDebtNoticeTargets(f.db, f.actor, noticeFilter);
    assert.equal(preview.targets.length, 1); assert.match(preview.targets[0].address, /99/);
    assert.equal((await selectDebtNoticeTargets(f.db, f.actor, { ...noticeFilter, addressContains: "Outro endereço" })).targets.length, 0);
    const refreshedTargets = (await readEconomicProfiles(f.db, f.actor, filter)).map(row => ({ id: row.id, updatedAt: row.updatedAt, profileVersion: row.profileVersion }));
    await bulkChangeEconomicProfiles(f.db, f.actor, { filter, targets: refreshedTargets, changes: {}, profilePatch: { companyAddress: { ...address, number: "100" } }, processId: null, reason: "Nova posição cadastral" });
    await assert.rejects(issueDebtNoticeBatch(f.db, f.actor, { filter: noticeFilter, expectedFingerprint: preview.fingerprint, type: "NOTICE", title: "Notificação", body: "Compareça para regularização.", legalBasis: "Legislação municipal", includeBankSlip: false, reason: "Seleção conferida" }), /alterad/);
    const now = await f.db.economicRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    const documentInput = { registrationId: registration.id, expectedUpdatedAt: now.updatedAt.toISOString(), kind: "REGISTRATION" as const, requestKey: randomUUID() };
    await assert.rejects(issuePortalEconomicDocument(f.db, "citizen", documentInput), /EMPRESA/);
    await f.db.taxpayerPortalAccess.create({ data: { id: "grant", usuarioId: "citizen", taxpayerId: "payer", scopes: ["EMPRESA", "CERTIDOES"], grantedByUsuarioId: "ana" } });
    const issued = await issuePortalEconomicDocument(f.db, "citizen", documentInput);
    assert.equal((await issuePortalEconomicDocument(f.db, "citizen", documentInput)).issuanceId, issued.issuanceId);
    assert.ok((await renderPortalEconomicDocument(f.db, "citizen", issued.issuanceId)).byteLength > 100);
    await assert.rejects(issuePortalEconomicDocument(f.db, "citizen", { ...documentInput, requestKey: randomUUID(), kind: "CESSATION" }), /Baixado/);
    await updateEconomicRegistrationWithHistory(f.db, f.actor, registration.id, { status: "Baixado" });
    const ceased = await f.db.economicRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    const cessation = await issuePortalEconomicDocument(f.db, "citizen", { ...documentInput, requestKey: randomUUID(), expectedUpdatedAt: ceased.updatedAt.toISOString(), kind: "CESSATION" });
    const frozen = await f.db.taxRegistryEntry.findUniqueOrThrow({ where: { id: cessation.issuanceId } });
    assert.equal((frozen.data as { status: string }).status, "Baixado");
    await assert.rejects(f.db.taxRegistryEntry.update({ where: { id: frozen.id }, data: { title: "Outro" } }), /imutável/);
    await f.db.taxpayerPortalAccess.update({ where: { id: "grant" }, data: { revokedAt: new Date() } });
    await assert.rejects(renderPortalEconomicDocument(f.db, "citizen", issued.issuanceId), /EMPRESA/);
  } finally { await f.close(); }
});
