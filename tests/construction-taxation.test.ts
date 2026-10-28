import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { getPostgresError } from "../src/db/errors";
import { constructionDocumentRequests, constructionDocumentTemplateVersions, constructionIssuedDocuments } from "../src/db/schema/construction-documents";
import { constructionFees } from "../src/db/schema/construction-taxation";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxPayments } from "../src/db/schema/tax-accounting";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { itbiDocumentSequences } from "../src/db/schema/tax-itbi";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { processEvents } from "../src/db/schema/processes";
import { createConstructionTaxationFixture } from "./helpers/construction-taxation-fixture";
import { createConstructionFeeIssueFixture } from "./helpers/construction-fee-issue-fixture";
import { calculateConstructionFee, confirmedConstructionBalance, demonstrationConstructionBarcode } from "../src/lib/obras/construction-tax-engine";
import { assertConstructionFeesSatisfied, assertConstructionDocumentChangeFeesSatisfied, getConstructionPropertyDebts, issueConstructionFee, publishConstructionTaxRule } from "../src/lib/obras/construction-taxation";
import { submitConstructionServiceRequest } from "../src/lib/obras/construction-request-service";
import { resolveConstructionServiceRequest } from "../src/lib/obras/construction-request-resolution";

test("taxa preserva precisão da área e arredonda somente valor final", () => {
  assert.equal(calculateConstructionFee("123.4567", "10.01", "0.1234").amount.toFixed(2), "25.24");
  assert.equal(calculateConstructionFee("0.0050", "0", "1").amount.toFixed(2), "0.01");
  assert.throws(() => calculateConstructionFee("-1", "0", "1"), /não negativos/);
  assert.throws(() => calculateConstructionFee("Infinity", "0", "1"), /finitos/);
  assert.equal(confirmedConstructionBalance("100", [{ amountPaidDecimal: new Decimal("99.99"), amountPaid: 100 }]).toFixed(2), "0.01");
});

test("linha demonstrativa FEBRABAN tem 44 dígitos, blocos e DVs módulo 10", () => {
  const value = demonstrationConstructionBarcode("125.24", "20260000001");
  assert.equal(value.barcode.length, 44);
  assert.equal(value.barcode.slice(0, 3), "816");
  assert.equal(value.barcode.slice(15, 19), "0000");
  function check(value: string) { let sum = 0; [...value].reverse().forEach((char, index) => { const n = Number(char) * (index % 2 ? 1 : 2); sum += n > 9 ? n - 9 : n; }); return (10 - sum % 10) % 10; }
  assert.equal(Number(value.barcode[3]), check(value.barcode.slice(0, 3) + value.barcode.slice(4)));
  for (const block of value.line.split(" ")) { assert.equal(block.length, 12); assert.equal(Number(block[11]), check(block.slice(0, 11))); }
  assert.match(value.label, /não utilizar para pagamento/);
});

test("gate exige todas as reanálises excedentes; parcial, cancelada e estorno não liberam", async () => {
  const f = await createConstructionTaxationFixture({ revisionCount: 3 });
  const gate = (kind = "REANALYSIS") => f.transaction(tx => assertConstructionFeesSatisfied(tx, "case", kind));
  try {
    await assert.rejects(gate(), /revisão 2/);
    await f.assessment("second"); await f.fee("REANALYSIS", { revision: 2, assessmentId: "second" });
    await assert.rejects(gate(), /revisão 3/);
    await f.assessment("third", { paid: "99" }); await f.fee("REANALYSIS", { revision: 3, assessmentId: "third" });
    await assert.rejects(gate(), /integralmente paga/);
    await f.db.update(taxGuides).set({ status: "Cancelada" }).where(eq(taxGuides.id, "guide:third"));
    await assert.rejects(gate(), /guia válida/);
    await f.db.update(taxGuides).set({ status: "Paga" }).where(eq(taxGuides.id, "guide:third"));
    await f.db.update(taxPayments).set({ amountPaidDecimal: new Decimal(100) }).where(eq(taxPayments.id, "payment:third"));
    await f.db.update(taxAssessments).set({ finalValueDecimal: new Decimal(110) }).where(eq(taxAssessments.id, "third"));
    await assert.rejects(gate(), /integralmente paga/);
    await f.db.update(taxAssessments).set({ finalValueDecimal: new Decimal(100) }).where(eq(taxAssessments.id, "third"));
    assert.equal((await gate()).required.length, 2);
    await f.db.update(taxPayments).set({ status: "Estornado" }).where(eq(taxPayments.id, "payment:third"));
    await assert.rejects(gate(), /integralmente paga/);
    await assert.rejects(gate("PERMIT"), /Taxa PERMIT/);
  } finally { await f.close(); }
});

test("migration PostgreSQL garante unicidade e imutabilidade das versões e evidências", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Tax" (id TEXT PRIMARY KEY); CREATE TABLE "Taxpayer" (id TEXT PRIMARY KEY); CREATE TABLE "RealEstate" (id TEXT PRIMARY KEY); CREATE TABLE "TaxAssessment" (id TEXT PRIMARY KEY); CREATE TABLE "ConstructionCase" (id TEXT PRIMARY KEY);');
    await db.exec(readFileSync("prisma/migrations-ibema/20261010220000_construction_taxation/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "Tax" VALUES ('tax'); INSERT INTO "Taxpayer" VALUES ('taxpayer'); INSERT INTO "RealEstate" VALUES ('property'); INSERT INTO "ConstructionCase" VALUES ('case'); INSERT INTO "TaxAssessment" VALUES ('assessment'); INSERT INTO "ConstructionTaxRuleVersion" (id,kind,version,"taxId","startsAt","fixedAmount","amountPerSquareMeter","legalBasis","guideInstructions","publishedBy") VALUES ('rule','REANALYSIS',1,'tax','2026-01-01',10,1,'Lei demonstrativa','Não pagável','actor'); INSERT INTO "ConstructionFee" (id,"caseId",kind,revision,"requestKey","ruleId","taxpayerId","realEstateId",amount,"calculationSnapshot","createdBy") VALUES ('fee','case','REANALYSIS',2,'request','rule','taxpayer','property',100,'{}','actor');`);
    await assert.rejects(db.exec(`UPDATE "ConstructionTaxRuleVersion" SET "fixedAmount"=99 WHERE id='rule'`), /immutable/);
    await assert.rejects(db.exec(`UPDATE "ConstructionFee" SET amount=99 WHERE id='fee'`), /immutable/);
    await db.exec(`UPDATE "ConstructionFee" SET "assessmentId"='assessment' WHERE id='fee'`);
    await assert.rejects(db.exec(`UPDATE "ConstructionFee" SET "assessmentId"=NULL WHERE id='fee'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "ConstructionFee" WHERE id='fee'`), /cannot be deleted/);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionFee" (id,"caseId",kind,revision,"requestKey","ruleId","taxpayerId","realEstateId",amount,"calculationSnapshot","createdBy") VALUES ('fee2','case','REANALYSIS',2,'request2','rule','taxpayer','property',100,'{}','actor')`), /unique/);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionFee" (id,"caseId",kind,revision,"requestKey","ruleId","taxpayerId","realEstateId",amount,"calculationSnapshot","createdBy") VALUES ('renewal-bad','case','RENEWAL',0,'request-renewal-bad','rule','taxpayer','property',100,'{}','actor')`), /cycle_check/);
    await db.exec(`INSERT INTO "ConstructionFee" (id,"caseId",kind,revision,"cycleKey","requestKey","ruleId","taxpayerId","realEstateId",amount,"calculationSnapshot","createdBy") VALUES ('renewal-a','case','RENEWAL',0,'DOCUMENT_REQUEST:request-a','request-renewal-a','rule','taxpayer','property',100,'{}','actor'), ('renewal-b','case','RENEWAL',0,'DOCUMENT_REQUEST:request-b','request-renewal-b','rule','taxpayer','property',100,'{}','actor')`);
    const cycles = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM "ConstructionFee" WHERE kind='RENEWAL'`);
    assert.equal(cycles.rows[0].count, 2);
  } finally { await db.close(); }
});

test("consulta usa o cadastro tributário real e abate somente pagamentos confirmados", async () => {
  const f = await createConstructionTaxationFixture();
  try {
    await f.assessment("assessment", { amount: "100.50", paid: "40.49" });
    await f.assessment("cancelled", { amount: "999", paid: "0", status: "Cancelado" });
    await f.assessment("cancelled-guide", { amount: "10", paid: "10", guideStatus: "Cancelada" });
    await f.db.insert(taxPayments).values({ guideId: "guide:assessment", amountPaid: 999, amountPaidDecimal: new Decimal(999), status: "Estornado", paymentDate: new Date(), paymentMethod: "Transferência" });
    await f.db.insert(taxRegistryEntries).values({ id: "non-tax", entityType: "REAL_ESTATE", entityId: "property", category: "NON_TAX_PROPERTY_DEBT", title: "Débito não tributário", data: { amount: "20.00" } });
    const result = await getConstructionPropertyDebts(f.db, "case");
    assert.equal(result.taxTotal, "70.01"); assert.equal(result.nonTaxTotal, "20.00"); assert.equal(result.total, "90.01");
    assert.equal(result.debts.some(debt => debt.assessmentId === "cancelled"), false);
    assert.equal((await getConstructionPropertyDebts(f.db, "foreign-case")).total, "0.00");
    await f.db.update(taxRegistryEntries).set({ data: { amount: "-1" } }).where(eq(taxRegistryEntries.id, "non-tax"));
    await assert.rejects(getConstructionPropertyDebts(f.db, "case"), /valor inválido/);
  } finally { await f.close(); }
});

test("lançamento reutiliza geração de DAM tributário e repetições não duplicam taxa/guia", { timeout: 240000 }, async () => {
  const f = await createConstructionFeeIssueFixture(), db = f.db;
  const input = { caseId: "case", kind: "REANALYSIS", revision: 2, requestKey: randomUUID(), taxpayerId: "taxpayer", realEstateId: "property", dueDate: `${f.year}-12-31`, exemptionReason: "" };
  const issue = (value: unknown = input, access = f.access) => issueConstructionFee(f.connection, access, f.actor, value);
  try {
    const rule = await f.transaction(tx => publishConstructionTaxRule(tx, f.actor.usuarioId, { kind: "REANALYSIS", taxId: "tax", startsAt: `${f.year}-01-01`, endsAt: `${f.year}-12-31`, fixedAmount: "5", amountPerSquareMeter: "2", legalBasis: "Lei demonstrativa", guideInstructions: "Sem convênio", demonstration: true }));
    await assert.rejects(issue(input, { ...f.access, roles: ["ANALYST"] }), /gestor urbanístico/);
    await assert.rejects(issue(input, { ...f.access, departmentId: "other" }), /no seu setor/);
    await assert.rejects(issue({ ...input, taxpayerId: "other" }), /Contribuinte ativo/);
    await assert.rejects(issue({ ...input, realEstateId: "other" }), /Imóvel deve estar vinculado/);
    await assert.rejects(issue({ ...input, revision: 1 }), /franquia/);
    await assert.rejects(issue({ ...input, dueDate: `${f.year - 1}-12-31` }), /Vencimento/);
    // Fail after the shared writer has persisted its guide, audit and number.
    // All must roll back with the fee and assessment on the very same tx.
    await f.database.exec(`CREATE FUNCTION reject_construction_fee_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CONSTRUCTION_FEE_ISSUED' THEN RAISE EXCEPTION 'fee audit rejected'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_construction_fee_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION reject_construction_fee_audit()`);
    await assert.rejects(issue(), error => getPostgresError(error)?.code === "P0001");
    assert.equal((await db.select({ total: count() }).from(constructionFees))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(taxAssessments))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(taxGuides))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(taxAuditLogs))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(itbiDocumentSequences))[0].total, 0);
    await f.database.exec(`DROP TRIGGER reject_construction_fee_audit ON "TaxAuditLog"`);
    const id = await issue();
    assert.equal(await issue(), id);
    assert.equal(await issue({ ...input, requestKey: randomUUID() }), id);
    const [fee] = await db.select().from(constructionFees), [assessment] = await db.select().from(taxAssessments), [guide] = await db.select().from(taxGuides);
    assert.equal((await db.select({ total: count() }).from(constructionFees))[0].total, 1);
    assert.equal((await db.select({ total: count() }).from(taxGuides))[0].total, 1);
    assert.equal(fee.id, id); assert.equal(fee.assessmentId, assessment.id); assert.equal(guide.assessmentId, assessment.id);
    assert.equal(fee.ruleId, rule.id); assert.equal(fee.amount.toFixed(2), "25.00"); assert.equal(assessment.finalValueDecimal?.toFixed(2), "25.00");
    assert.equal(assessment.taxableBaseDecimal?.toFixed(2), "10.00"); assert.equal(guide.totalValueDecimal?.toFixed(2), "25.00");
    assert.equal(assessment.status, "Emitido"); assert.equal(guide.guideNumber, `DAM-${f.year}-0000001`);
    assert.ok(assessment.competence instanceof Date); assert.ok(guide.dueDate instanceof Date);
    assert.equal(assessment.competence.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
    assert.equal(guide.dueDate.toISOString(), `${f.year}-12-31T12:00:00.000Z`);
    assert.deepEqual(assessment.calculationSnapshot, fee.calculationSnapshot);
    assert.ok(fee.calculationSnapshot && typeof fee.calculationSnapshot === "object" && !Array.isArray(fee.calculationSnapshot));
    assert.ok(guide.guideNumber);
    const barcode = demonstrationConstructionBarcode("25.00", guide.guideNumber.replace(/\D/g, ""));
    assert.equal(guide.barcode, barcode.barcode);
    assert.deepEqual(guide.calculationSnapshot, { ...fee.calculationSnapshot, demonstrationBarcode: barcode });
    assert.deepEqual((await db.select({ action: taxAuditLogs.action }).from(taxAuditLogs)).map(row => row.action).sort(), ["CONSTRUCTION_FEE_ISSUED", "CREATE"]);
    assert.equal((await db.select().from(itbiDocumentSequences))[0].currentValue, 1);
  } finally { await f.close(); }
});

test("checkPropertyDebts bloqueia somente ato final, sem bloquear alvará, vistoria ou parcelamento inicial", async () => {
  const f = await createConstructionTaxationFixture({ checkPropertyDebts: true });
  try {
    for (const kind of ["PERMIT", "INSPECTION", "SUBDIVISION", "HABITE_SE"]) await f.fee(kind, { amount: "0", exemptionReason: "Isenção demonstrativa fundamentada" });
    await f.assessment("old-debt", { year: 2025, paid: "0", status: "Lançado" });
    for (const kind of ["PERMIT", "INSPECTION", "SUBDIVISION", "REANALYSIS"]) assert.equal((await f.transaction(tx => assertConstructionFeesSatisfied(tx, "case", kind))).propertyDebts, null);
    await assert.rejects(f.transaction(tx => assertConstructionFeesSatisfied(tx, "case", "HABITE_SE")), /Imóveis possuem R\$ 100.00/);
  } finally { await f.close(); }
});

test("F5: renovação/correção exige ciclo próprio, não aceita taxa inicial nem pagamento de outro pedido", async () => {
  const f = await createConstructionTaxationFixture({ checkPropertyDebts: true });
  const gate = (requestId: string) => f.transaction(tx => assertConstructionDocumentChangeFeesSatisfied(tx, "case", requestId));
  try {
    await f.fee("PERMIT", { amount: "0", exemptionReason: "Isenção inicial" });
    await f.db.insert(constructionDocumentTemplateVersions).values({ id: "template", kind: "PERMIT", version: 1, title: "Alvará", body: "Alvará", stamp: "Municipal", signaturePolicy: "INTERNAL_ALLOWED", createdBy: "manager-user" });
    await f.db.insert(constructionIssuedDocuments).values({ id: "source", requestKey: crypto.randomUUID(), caseId: "case", processId: "process", kind: "PERMIT", year: 2026, sequence: 1, number: "PERMIT-1", templateVersionId: "template", templateSnapshot: {}, documentId: "current-project", documentVersionId: "ged-version", fileUrl: "/project.pdf", hashSha256: "a".repeat(64), backupPath: "/backup.pdf", validationCode: "test", status: "PUBLISHED", createdBy: "manager-user" });
    for (const [id, type] of [["renewal-a", "RENEWAL"], ["renewal-b", "RENEWAL"], ["correction-a", "CORRECTION"]]) await f.db.insert(constructionDocumentRequests).values({ id, requestKey: crypto.randomUUID(), caseId: "case", sourceIssuedDocumentId: "source", type, reason: "Pedido documental", identityId: "identity" });
    await assert.rejects(f.transaction(tx => assertConstructionFeesSatisfied(tx, "case", "RENEWAL")), /identificar o ciclo/);
    await assert.rejects(gate("renewal-a"), /Taxa RENEWAL/);
    await f.assessment("renewal-paid", { amount: "50", paid: "50" });
    await f.fee("RENEWAL", { amount: "50", cycleKey: "DOCUMENT_REQUEST:renewal-a", assessmentId: "renewal-paid" });
    const evidence = await gate("renewal-a");
    assert.equal(evidence.required[0].cycleKey, "DOCUMENT_REQUEST:renewal-a"); assert.equal(evidence.propertyDebts, null);
    await assert.rejects(gate("renewal-b"), /Taxa RENEWAL/);
    await assert.rejects(gate("correction-a"), /Taxa CORRECTION/);
    await f.fee("CORRECTION", { amount: "0", cycleKey: "DOCUMENT_REQUEST:correction-a", exemptionReason: "Correção isenta conforme regra própria" });
    assert.equal((await gate("correction-a")).cycle?.kind, "CORRECTION");
    await f.db.update(constructionDocumentRequests).set({ status: "FULFILLED" }).where(eq(constructionDocumentRequests.id, "correction-a"));
    await assert.rejects(gate("correction-a"), /pendente indisponível/);
  } finally { await f.close(); }
});

test("F5: lançamento bloqueia regra ausente e emite uma taxa/evento por ciclo documental", { timeout: 240000 }, async () => {
  const f = await createConstructionFeeIssueFixture(), db = f.db;
  const issue = (value: unknown) => issueConstructionFee(f.connection, f.access, f.actor, value);
  const request = () => f.transaction(tx => submitConstructionServiceRequest(tx, "identity", { caseId: "case", kind: "RENEWAL", revision: 2, termId: "term", sourceIssuedDocumentId: "source", requestKey: randomUUID(), notes: "Renovação documental fundamentada", documentIds: [], additionalValues: {} }));
  try {
    await f.database.exec(readFileSync("db/migrations/20261028193000_construction_document_rejection/migration.sql", "utf8"));
    const serviceId = await request();
    const [firstRequest] = await db.select().from(constructionDocumentRequests);
    const input = { caseId: "case", kind: "RENEWAL", revision: 0, documentRequestId: firstRequest.id, requestKey: randomUUID(), taxpayerId: "taxpayer", realEstateId: "property", dueDate: `${f.year}-12-31`, exemptionReason: "Isenção fundamentada para este ciclo" };
    await assert.rejects(issue(input), /vigente para RENEWAL/);
    assert.equal((await db.select({ total: count() }).from(constructionFees))[0].total, 0);
    await f.transaction(tx => publishConstructionTaxRule(tx, f.actor.usuarioId, { kind: "RENEWAL", taxId: "tax", startsAt: `${f.year}-01-01`, endsAt: "", fixedAmount: "0", amountPerSquareMeter: "0", legalBasis: "Renovação isenta demonstrativa", guideInstructions: "Regra própria", demonstration: true }));
    await assert.rejects(issue({ ...input, exemptionReason: "" }), /Taxa zero exige/);
    const firstFee = await issue(input);
    assert.equal(await issue(input), firstFee);
    assert.equal(await issue({ ...input, requestKey: randomUUID() }), firstFee);
    const resolution = { id: serviceId, decision: "REJECTED", resolution: "Pedido indeferido por fundamento municipal" };
    await f.transaction(tx => resolveConstructionServiceRequest(tx, f.access, f.actor.usuarioId, resolution));
    assert.equal((await db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, firstRequest.id)))[0].status, "REJECTED");
    await assert.rejects(issue(input), /pendente indisponível/);
    await assert.rejects(f.transaction(tx => assertConstructionDocumentChangeFeesSatisfied(tx, "case", firstRequest.id)), /pendente indisponível/);
    await request();
    const requests = await db.select().from(constructionDocumentRequests), secondRequest = requests.find(row => row.id !== firstRequest.id)!;
    assert.equal(secondRequest.status, "PENDING");
    await assert.rejects(issue({ ...input, documentRequestId: secondRequest.id }), /outra operação/);
    const secondFee = await issue({ ...input, documentRequestId: secondRequest.id, requestKey: randomUUID() });
    assert.notEqual(secondFee, firstFee);
    const fees = await db.select().from(constructionFees);
    const events = (await db.select().from(processEvents)).filter(row => row.eventType === "CONSTRUCTION_DOCUMENT_CHANGE_FEE_EXEMPT");
    assert.equal(fees.length, 2); assert.equal(events.length, 2);
    assert.deepEqual(new Set(fees.map(row => row.cycleKey)), new Set([`DOCUMENT_REQUEST:${firstRequest.id}`, `DOCUMENT_REQUEST:${secondRequest.id}`]));
    assert.equal(JSON.parse(events.find(row => JSON.parse(row.metadata!).feeId === secondFee)!.metadata!).cycleKey, `DOCUMENT_REQUEST:${secondRequest.id}`);
    assert.equal((await db.select({ total: count() }).from(taxGuides))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(taxAssessments))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(taxAuditLogs))[0].total, 2);
  } finally { await f.close(); }
});
