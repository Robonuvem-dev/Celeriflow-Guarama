import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createHistoricalProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";
import { getPostgresError } from "../src/db/errors";
import { listPriceResearchSuppliers, loadPriceInvitation, loadPriceResearchDetail, loadPriceResearchSupplier } from "../src/db/repositories/procurement/price-research";
import {
  calculatePriceComparison, closePriceResearch, createPriceResearch, createSupplierInvitationAccessKey,
  deletePriceResearch, getSupplierPriceQuoteReportAccess, getSupplierPriceResearchPortalAccess,
  inviteSupplierToPriceResearch, isPriceResearchResponseOpen, isSupplierActiveForPriceResearch,
  PriceResearchError, priceQuoteStatuses, priceResearchStatuses, saveSupplierPriceQuoteDraft,
  submitSupplierPriceQuote, updatePriceResearchDeadline, verifySupplierInvitationAccessKey,
} from "../src/lib/compras/price-research";
import { priceQuotes, priceResearches } from "../src/db/schema/procurement-core";
import { procurementLifecycleEvents } from "../src/db/schema/procurement-requests";
import { suppliers } from "../src/db/schema/registry";

process.env.PRICE_RESEARCH_PORTAL_SECRET = "price-research-test-secret";

test("CLC-012 reference ignores omissions and preserves all minimum ties", () => {
  const comparison = calculatePriceComparison([
    { id: "a", supplierId: "a", value: 3700 }, { id: "b", supplierId: "b", value: 3500 },
    { id: "c", supplierId: "c", value: 3500 }, { id: "draft", supplierId: "d", value: 0 },
  ]);
  assert.equal(comparison.minimumValue, 3500);
  assert.ok(Math.abs((comparison.referenceValue ?? 0) - (3700 + 3500 + 3500) / 3) < 0.000001);
  assert.deepEqual(comparison.quoteIdsAtMinimum, ["b", "c"]);
});

test("CLC-013 signature scope and CLC-017 inclusive opening / exclusive deadline", () => {
  const key = createSupplierInvitationAccessKey({ id: "q", researchId: "r", supplierId: "s" });
  assert.deepEqual(verifySupplierInvitationAccessKey(key), { v: 1, i: "q", r: "r", s: "s" });
  assert.throws(() => verifySupplierInvitationAccessKey(`${key}x`), PriceResearchError);
  const research = { status: priceResearchStatuses.inProgress, createdAt: new Date("2026-09-19T10:00Z"), date: new Date("2026-09-19T12:00Z") };
  assert.equal(isPriceResearchResponseOpen(research, research.createdAt), true);
  assert.equal(isPriceResearchResponseOpen(research, research.date), false);
  assert.equal(isSupplierActiveForPriceResearch("Ativo"), true);
  for (const status of ["Suspenso", "Inativo", "Bloqueado"]) assert.equal(isSupplierActiveForPriceResearch(status), false);
});

test("price research runs with the production driver: contacts, draft, replay, reference and rollback", async () => {
  const f = await createHistoricalProcurementWorkflowFixture();
  const now = new Date("2030-09-19T10:00Z");
  const deadline = new Date("2030-09-19T12:00Z");
  try {
    await f.database.exec(`
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('buyer','Comprador','buyer@example.test','procurement-workflow-profile','2026-10-19'),('supplier-user','Fornecedor autenticado','supplier-user@example.test','procurement-workflow-profile','2026-10-19');
      INSERT INTO "Person" (id,"fullName",email,"updatedAt") VALUES ('p','Fornecedor PF','pf@example.test','2026-10-19');
      INSERT INTO "Company" (id,"corporateName","tradeName",cnpj,"emailPrimary","updatedAt") VALUES ('c','Fornecedor PJ',NULL,'00000000000031','pj@example.test','2026-10-19'),('no-contact-company','PJ sem contato',NULL,'00000000000032',NULL,'2026-10-19');
      INSERT INTO "Supplier" (id,"personId","companyId","updatedAt") VALUES ('pf','p',NULL,'2026-10-19'),('pj',NULL,'c','2026-10-19'),('no-contact',NULL,'no-contact-company','2026-10-19');
      INSERT INTO "PurchaseRequest" (id,number,object,justification,"requesterId","departmentId","secretariatId","updatedAt") VALUES ('req','REQ-1','Compra','Pesquisa de preços','servidora-ana','setor','secretaria','2026-10-19');
      INSERT INTO "PurchaseProcess" (id, number, object, type, "secretariatId", "purchaseRequestId", "updatedAt") VALUES ('proc', 'PROC-1', 'Compra', 'Comum', 'secretaria', 'req', now());
      INSERT INTO "PurchaseProcessItem" (id, "purchaseProcessId", "customName", quantity, "updatedAt") VALUES ('item', 'proc', 'Serviço livre', 2, now());
    `);
    const research = await createPriceResearch(f.connection, { processId: "proc", deadlineAt: deadline, now });
    await f.connection.db.update(priceResearches).set({ createdAt: now }).where(eq(priceResearches.id, research.id));
    await updatePriceResearchDeadline(f.connection, { researchId: research.id, deadlineAt: deadline, now });
    const pj = await loadPriceResearchSupplier(f.connection.db, "pj");
    assert.ok(pj);
    assert.equal(pj?.person, null);
    assert.deepEqual(pj?.company, { corporateName: "Fornecedor PJ", tradeName: null, emailPrimary: "pj@example.test" });
    assert.deepEqual((await listPriceResearchSuppliers(f.connection.db)).find(supplier => supplier.id === "pj")?.company, pj.company);
    assert.equal((await loadPriceResearchSupplier(f.connection.db, "pf"))?.company, null);
    await assert.rejects(inviteSupplierToPriceResearch(f.connection, { researchId: research.id, supplierId: "no-contact", actorUsuarioId: "buyer", now }), /precisa possuir e-mail cadastrado/);
    const invitation = await inviteSupplierToPriceResearch(f.connection, { researchId: research.id, supplierId: "pf", actorUsuarioId: "buyer", now });
    assert.equal(invitation.created, true);
    assert.equal((await inviteSupplierToPriceResearch(f.connection, { researchId: research.id, supplierId: "pf", actorUsuarioId: "buyer", now })).created, false);
    const key = createSupplierInvitationAccessKey(invitation.invitation);
    await assert.rejects(getSupplierPriceResearchPortalAccess(f.connection.db, { accessKey: key, authenticatedEmail: "pj@example.test", now }), /não autorizado/);
    const access = await getSupplierPriceResearchPortalAccess(f.connection.db, { accessKey: key, authenticatedEmail: " PF@example.test ", now });
    assert.equal(access.process.purchaseRequestNumber, "REQ-1");
    assert.equal(access.process.items[0].name, "Serviço livre");
    const input = { invitationId: invitation.invitation.id, researchId: research.id, supplierId: "pf", actorUsuarioId: "supplier-user", value: 3700, now };
    await saveSupplierPriceQuoteDraft(f.connection, input);
    await assert.rejects(getSupplierPriceQuoteReportAccess(f.connection.db, { accessKey: key, authenticatedEmail: "pf@example.test", now }), /ainda não/);
    await assert.rejects(submitSupplierPriceQuote(f.connection, { ...input, now: deadline }), /encerrada/);
    await assert.rejects(submitSupplierPriceQuote(f.connection, { ...input, actorUsuarioId: "missing" }), error => {
      const postgres = getPostgresError(error);
      return postgres?.code === "23503" && postgres.constraint === "ProcurementLifecycleEvent_actorUsuarioId_fkey";
    });
    assert.equal((await f.connection.db.select().from(priceQuotes).where(eq(priceQuotes.id, input.invitationId)))[0].status, priceQuoteStatuses.draft, "event FK failure rolls back quote and reference");
    assert.equal((await f.connection.db.select().from(priceResearches).where(eq(priceResearches.id, research.id)))[0].estimatedValue, null);
    assert.equal((await f.connection.db.select().from(procurementLifecycleEvents)).length, 1);
    const result = await submitSupplierPriceQuote(f.connection, input);
    assert.equal(result.alreadySubmitted, false);
    assert.equal(result.quote.date.getTime(), now.getTime());
    assert.equal((await submitSupplierPriceQuote(f.connection, input)).alreadySubmitted, true);
    await assert.rejects(submitSupplierPriceQuote(f.connection, { ...input, value: 3650 }), /já foi apresentada/);
    await assert.rejects(saveSupplierPriceQuoteDraft(f.connection, input), /já foi apresentada/);
    const second = await inviteSupplierToPriceResearch(f.connection, { researchId: research.id, supplierId: "pj", actorUsuarioId: "buyer", now });
    assert.equal(second.supplierName, "Fornecedor PJ");
    const pjKey = createSupplierInvitationAccessKey(second.invitation);
    await assert.rejects(getSupplierPriceResearchPortalAccess(f.connection.db, { accessKey: pjKey, authenticatedEmail: "pf@example.test", now }), /não autorizado/);
    const pjAccess = await getSupplierPriceResearchPortalAccess(f.connection.db, { accessKey: pjKey, authenticatedEmail: " PJ@example.test ", now });
    assert.equal(pjAccess.supplierId, "pj"); assert.equal(pjAccess.supplierName, "Fornecedor PJ"); assert.equal(pjAccess.canRespond, true);
    assert.deepEqual((await loadPriceInvitation(f.connection.db, { invitationId: second.invitation.id }))?.supplier.company, pj.company);
    assert.deepEqual((await loadPriceResearchDetail(f.connection.db, research.id))?.quotes.find(quote => quote.id === second.invitation.id)?.supplier.company, pj.company);
    await f.connection.db.update(suppliers).set({ status: "Suspenso" }).where(eq(suppliers.id, "pj"));
    await assert.rejects(submitSupplierPriceQuote(f.connection, { ...input, invitationId: second.invitation.id, supplierId: "pj", value: 3500 }), /inativo ou bloqueado/);
    await f.connection.db.update(suppliers).set({ status: "Ativo" }).where(eq(suppliers.id, "pj"));
    await submitSupplierPriceQuote(f.connection, { ...input, invitationId: second.invitation.id, supplierId: "pj", value: 3500 });
    assert.equal((await f.connection.db.select().from(priceResearches).where(eq(priceResearches.id, research.id)))[0].estimatedValue, 3600);
    assert.equal((await f.connection.db.select().from(procurementLifecycleEvents)).length, 4);
    await assert.rejects(deletePriceResearch(f.connection, research.id), /preservar o histórico/);
    await closePriceResearch(f.connection, research.id);
    assert.equal((await getSupplierPriceQuoteReportAccess(f.connection.db, { accessKey: key, authenticatedEmail: "pf@example.test", now })).quoteValue, 3700);
  } finally { await f.close(); }
});
