import assert from "node:assert/strict";
import test from "node:test";
import { and, count, desc, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { itbiDeclarations, itbiEvents } from "../src/db/schema/tax-itbi";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxPayments } from "../src/db/schema/tax-accounting";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { documents } from "../src/db/schema/registry";
import { readItbiAssessment, readItbiDeclaration, requireItbiRecord } from "../src/db/repositories/tax-itbi/records";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { createItbiDrizzleFixture, seedItbiDeclaration } from "./helpers/itbi-drizzle-fixture";
import { publishItbiExpiryPolicy, cancelOverdueItbiProcesses } from "../src/lib/tributacao/itbi-expiry";

test("ITBI vencido: política, prazo, pagamentos, compensações, transferência e rollback documental", async () => {
  const f = await createItbiDrizzleFixture();
  try {
    const today = new Date(); const utc = (offset: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
    const due = utc(-31).toISOString().slice(0, 10);
    for (const id of ["expired", "boundary", "paid", "compensated", "unpaid", "transferred", "non-taxable", "unknown", "rollback", "missing-date"]) {
      await seedItbiDeclaration(f, id, { status: id === "non-taxable" ? "NAO_TRIBUTAVEL" : "PROTOCOLADA", cadastralUpdatedAt: id === "transferred" ? new Date() : null, calculationSnapshot: id === "unknown" ? { dueDate: due } : { governmentEntityId: "ente", budgetUnitId: "ug", ...(id === "missing-date" ? {} : { dueDate: id === "boundary" ? utc(-30).toISOString().slice(0, 10) : due }) } });
    }
    for (const id of ["paid", "compensated", "unpaid"]) {
      const [assessment] = await f.db.insert(taxAssessments).values({ id: `assessment-${id}`, year: today.getUTCFullYear(), taxId: "ITBI", taxpayerId: "buyer", realEstateId: "property", originalValue: 20, originalValueDecimal: new Decimal(20), finalValueDecimal: new Decimal(20), status: "Emitido", calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" } }).returning();
      const [guide] = await f.db.insert(taxGuides).values({ assessmentId: assessment.id, totalValue: 20, totalValueDecimal: new Decimal(20), dueDate: utc(-31), status: "Emitida" }).returning();
      await f.db.update(itbiDeclarations).set({ assessmentId: assessment.id, guideId: guide.id }).where(eq(itbiDeclarations.id, id));
      if (id === "paid") await f.db.insert(taxPayments).values({ guideId: guide.id, amountPaid: 1, amountPaidDecimal: new Decimal(1), paymentDate: new Date(), paymentMethod: "Manual", status: "Confirmado" });
      else if (id === "compensated") await f.db.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_MOVEMENT", title: "Compensação parcial", status: "EFETIVADO", data: { operation: "COMPENSAR", amount: "1.00" } });
    }
    const [document] = await f.db.insert(documents).values({ title: "Comprovante", documentType: "ITBI", fileUrl: "/isolated-itbi-evidence.pdf", status: "Válido" }).returning();
    await f.db.update(itbiDeclarations).set({ documentId: document.id }).where(eq(itbiDeclarations.id, "rollback"));
    const config = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, active: true, overdueDays: 30, extinguishUnpaidAssessment: true, legalBasis: "Regra municipal fundamentada de cancelamento" };
    await publishItbiExpiryPolicy(f.connection, f.actor, config);
    const input = { governmentEntityId: "ente", budgetUnitId: "ug", expectedPolicyVersion: 1 };
    await assert.rejects(cancelOverdueItbiProcesses(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, input), /autorizado/);
    await assert.rejects(cancelOverdueItbiProcesses(f.connection, f.actor, { ...input, expectedPolicyVersion: 2 }), /alterada/);
    await f.database.exec(`CREATE FUNCTION reject_expiry_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='ITBI_AUTOMATIC_CANCELLATION' AND NEW."entityId"='rollback' THEN RAISE EXCEPTION 'expiry rollback'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_expiry_fixture BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION reject_expiry_fixture();`);
    const result = await cancelOverdueItbiProcesses(f.connection, f.actor, input);
    const statuses = new Map(result.results.map(row => [row.id, row.status]));
    assert.equal(result.cancelled, 2); assert.equal(statuses.get("expired"), "CANCELADA"); assert.equal(statuses.get("unpaid"), "CANCELADA");
    assert.equal((await readItbiAssessment(f.db, "assessment-unpaid")).finalValueDecimal?.toFixed(2), "0.00");
    assert.equal(requireItbiRecord((await f.db.select().from(taxGuides).where(eq(taxGuides.assessmentId, "assessment-unpaid")))[0]).status, "Cancelada");
    assert.equal(statuses.get("boundary"), "DENTRO_DO_PRAZO");
    assert.equal(statuses.get("paid"), "PAGAMENTO_OU_COMPENSACAO"); assert.equal(statuses.get("compensated"), "PAGAMENTO_OU_COMPENSACAO");
    assert.equal(statuses.get("transferred"), "PRESERVADO"); assert.equal(statuses.get("missing-date"), "SEM_VENCIMENTO_CONCILIADO");
    assert.equal(statuses.has("non-taxable"), false); assert.equal(statuses.has("unknown"), false);
    assert.equal(statuses.get("rollback"), "ERRO_SEM_ALTERACAO");
    const documentStatus = async () => requireItbiRecord((await f.db.select({ status: documents.status }).from(documents).where(eq(documents.id, document.id)))[0]).status;
    assert.equal(await documentStatus(), "Válido");
    assert.equal((await readItbiDeclaration(f.db, "rollback")).status, "PROTOCOLADA");
    assert.equal((await f.db.select({ n: count() }).from(itbiEvents).where(and(eq(itbiEvents.declarationId, "rollback"), eq(itbiEvents.eventType, "CANCELAMENTO_AUTOMATICO"))))[0].n, 0);
    await f.database.exec('DROP TRIGGER reject_expiry_fixture ON "TaxRegistryEntry"; DROP FUNCTION reject_expiry_fixture();');
    const retried = await cancelOverdueItbiProcesses(f.connection, f.actor, input);
    assert.equal(retried.cancelled, 1); assert.equal(await documentStatus(), "Revogado");
    assert.equal((await cancelOverdueItbiProcesses(f.connection, f.actor, input)).cancelled, 0);
    assert.equal((await f.db.select({ n: count() }).from(taxRegistryEntries).where(eq(taxRegistryEntries.category, "ITBI_AUTOMATIC_CANCELLATION")))[0].n, 3);
    const history = requireItbiRecord((await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, "rollback"), eq(taxRegistryEntries.category, "ITBI_FIELD_HISTORY"))).orderBy(desc(taxRegistryEntries.version)).limit(1))[0]);
    assert.equal(history.actorUsuarioId, f.actor.usuarioId); assert.equal(taxScopeSnapshot(taxScopeSnapshot(history.data).after).status, "CANCELADA");
  } finally { await f.close(); }
});
