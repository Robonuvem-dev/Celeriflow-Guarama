import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { configureTaxFinancialMapping } from "../src/lib/tributacao";
import { publishItbiExpiryPolicy, cancelOverdueItbiProcesses } from "../src/lib/tributacao/itbi-expiry";

test("ITBI vencido: política, prazo, pagamentos, compensações, transferência e rollback documental", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    for (const migration of ["20261015200000_itbi_process_evidence", "20261015220000_tax_channel_document_integrity", "20261015230000_itbi_field_history"]) await f.pg.exec(await readFile(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    await f.db.tax.create({ data: { id: "ITBI", name: "ITBI", taxType: "Imposto" } });
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await configureTaxFinancialMapping(f.db, f.actor, { taxId: "ITBI", revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" });
    await f.db.taxpayer.create({ data: { id: "payer", taxpayerType: "PF", status: "Ativo" } });
    await f.db.realEstate.create({ data: { id: "property" } });
    await f.db.itbiTransactionType.create({ data: { id: "type", code: "VENDA", name: "Compra e venda", rate: "2" } });
    const today = new Date(); const utc = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
    const due = utc(-31).toISOString().slice(0, 10);
    for (const id of ["expired", "boundary", "paid", "compensated", "unpaid", "transferred", "non-taxable", "unknown", "rollback", "missing-date"]) {
      await f.db.itbiDeclaration.create({ data: { id, declarationNumber: `ITBI-${id}`, status: id === "non-taxable" ? "NAO_TRIBUTAVEL" : "PROTOCOLADA", transactionTypeId: "type", realEstateId: "property", transmittedFraction: "100", declaredPropertyValue: "1000", taxableBase: "1000", appliedRate: "2", taxAmount: "20", cadastralUpdatedAt: id === "transferred" ? new Date() : null, calculationSnapshot: id === "unknown" ? { dueDate: due } : { governmentEntityId: "ente", budgetUnitId: "ug", ...(id === "missing-date" ? {} : { dueDate: id === "boundary" ? utc(-30).toISOString().slice(0, 10) : due }) }, createdByUsuarioId: "ana" } });
    }
    for (const id of ["paid", "compensated", "unpaid"]) {
      const assessment = await f.db.taxAssessment.create({ data: { id: `assessment-${id}`, year: today.getUTCFullYear(), taxId: "ITBI", taxpayerId: "payer", realEstateId: "property", originalValue: 20, originalValueDecimal: "20", finalValueDecimal: "20", status: "Emitido", calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" } } });
      const guide = await f.db.taxGuide.create({ data: { assessmentId: assessment.id, totalValue: 20, totalValueDecimal: "20", dueDate: utc(-31), status: "Emitida" } });
      await f.db.itbiDeclaration.update({ where: { id }, data: { assessmentId: assessment.id, guideId: guide.id } });
      if (id === "paid") await f.db.taxPayment.create({ data: { guideId: guide.id, amountPaid: 1, amountPaidDecimal: "1", paymentDate: new Date(), paymentMethod: "Manual", status: "Confirmado" } });
      else if (id === "compensated") await f.db.taxRegistryEntry.create({ data: { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_MOVEMENT", title: "Compensação parcial", status: "EFETIVADO", data: { operation: "COMPENSAR", amount: "1.00" } } });
    }
    const document = await f.db.document.create({ data: { title: "Comprovante", documentType: "ITBI", fileUrl: "/isolated-itbi-evidence.pdf", status: "Válido" } });
    await f.db.itbiDeclaration.update({ where: { id: "rollback" }, data: { documentId: document.id } });
    const config = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, active: true, overdueDays: 30, extinguishUnpaidAssessment: true, legalBasis: "Regra municipal fundamentada de cancelamento" };
    await publishItbiExpiryPolicy(f.db, f.actor, config);
    const input = { governmentEntityId: "ente", budgetUnitId: "ug", expectedPolicyVersion: 1 };
    await assert.rejects(cancelOverdueItbiProcesses(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizado/);
    await assert.rejects(cancelOverdueItbiProcesses(f.db, f.actor, { ...input, expectedPolicyVersion: 2 }), /alterada/);
    await f.pg.exec(`CREATE FUNCTION reject_expiry_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='ITBI_AUTOMATIC_CANCELLATION' AND NEW."entityId"='rollback' THEN RAISE EXCEPTION 'expiry rollback'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_expiry_fixture BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION reject_expiry_fixture();`);
    const result = await cancelOverdueItbiProcesses(f.db, f.actor, input);
    const statuses = new Map(result.results.map(row => [row.id, row.status]));
    assert.equal(result.cancelled, 2); assert.equal(statuses.get("expired"), "CANCELADA"); assert.equal(statuses.get("unpaid"), "CANCELADA");
    assert.equal((await f.db.taxAssessment.findUniqueOrThrow({ where: { id: "assessment-unpaid" } })).finalValueDecimal?.toFixed(2), "0.00");
    assert.equal((await f.db.taxGuide.findFirstOrThrow({ where: { assessmentId: "assessment-unpaid" } })).status, "Cancelada");
    assert.equal(statuses.get("boundary"), "DENTRO_DO_PRAZO");
    assert.equal(statuses.get("paid"), "PAGAMENTO_OU_COMPENSACAO"); assert.equal(statuses.get("compensated"), "PAGAMENTO_OU_COMPENSACAO");
    assert.equal(statuses.get("transferred"), "PRESERVADO"); assert.equal(statuses.get("missing-date"), "SEM_VENCIMENTO_CONCILIADO");
    assert.equal(statuses.has("non-taxable"), false); assert.equal(statuses.has("unknown"), false);
    assert.equal(statuses.get("rollback"), "ERRO_SEM_ALTERACAO");
    assert.equal((await f.db.document.findUniqueOrThrow({ where: { id: document.id } })).status, "Válido");
    assert.equal((await f.db.itbiDeclaration.findUniqueOrThrow({ where: { id: "rollback" } })).status, "PROTOCOLADA");
    assert.equal(await f.db.itbiEvent.count({ where: { declarationId: "rollback", eventType: "CANCELAMENTO_AUTOMATICO" } }), 0);
    await f.pg.exec('DROP TRIGGER reject_expiry_fixture ON "TaxRegistryEntry"; DROP FUNCTION reject_expiry_fixture();');
    const retried = await cancelOverdueItbiProcesses(f.db, f.actor, input);
    assert.equal(retried.cancelled, 1); assert.equal((await f.db.document.findUniqueOrThrow({ where: { id: document.id } })).status, "Revogado");
    assert.equal((await cancelOverdueItbiProcesses(f.db, f.actor, input)).cancelled, 0);
    assert.equal(await f.db.taxRegistryEntry.count({ where: { category: "ITBI_AUTOMATIC_CANCELLATION" } }), 3);
    const history = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { entityId: "rollback", category: "ITBI_FIELD_HISTORY" }, orderBy: { version: "desc" } });
    assert.equal(history.actorUsuarioId, f.actor.usuarioId); assert.equal((history.data as { after: { status: string } }).after.status, "CANCELADA");
  } finally { await f.close(); }
});
