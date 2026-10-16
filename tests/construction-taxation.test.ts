import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { calculateConstructionFee, confirmedConstructionBalance, demonstrationConstructionBarcode } from "../src/lib/obras/construction-tax-engine";
import { assertConstructionFeesSatisfied, assertConstructionDocumentChangeFeesSatisfied, getConstructionPropertyDebts, issueConstructionFee } from "../src/lib/obras/construction-taxation";

test("taxa preserva precisão da área e arredonda somente valor final", () => {
  assert.equal(calculateConstructionFee("123.4567", "10.01", "0.1234").amount.toFixed(2), "25.24");
  assert.equal(calculateConstructionFee("0.0050", "0", "1").amount.toFixed(2), "0.01");
  assert.throws(() => calculateConstructionFee("-1", "0", "1"), /não negativos/);
  assert.throws(() => calculateConstructionFee("Infinity", "0", "1"), /finitos/);
  assert.equal(confirmedConstructionBalance("100", [{ amountPaidDecimal: new Prisma.Decimal("99.99"), amountPaid: 100 }]).toFixed(2), "0.01");
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
  const fees: unknown[] = [];
  const tx = { $queryRaw: async () => [], constructionCase: { findUniqueOrThrow: async () => ({ revisionCount: 3, configuration: { freeRevisions: 1 }, fees }) } } as unknown as Prisma.TransactionClient;
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "REANALYSIS"), /revisão 2/);
  const fee = (revision: number, amount: string, paid: number, status = "Paga") => ({ kind: "REANALYSIS", revision, cycleKey: "INITIAL", amount: new Prisma.Decimal(amount), exemptionReason: null, assessment: { status: "Pago", guides: [{ status, payments: [{ amountPaid: paid, amountPaidDecimal: new Prisma.Decimal(paid) }] }] } });
  fees.push(fee(2, "100", 100));
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "REANALYSIS"), /revisão 3/);
  fees.push(fee(3, "100", 99));
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "REANALYSIS"), /integralmente paga/);
  fees[1] = fee(3, "100", 100, "Cancelada");
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "REANALYSIS"), /guia válida/);
  fees[1] = { ...fee(3, "100", 100), assessment: { ...fee(3, "100", 100).assessment, finalValueDecimal: new Prisma.Decimal("110") } };
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "REANALYSIS"), /integralmente paga/);
  fees[1] = { ...fee(3, "100", 0), exemptionReason: "Isenção fundamentada na lei municipal" };
  assert.equal((await assertConstructionFeesSatisfied(tx, "case", "REANALYSIS")).required.length, 2);
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "PERMIT"), /Taxa PERMIT/);
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
  let assessmentWhere: unknown;
  const tx = {
    constructionCaseProperty: { findMany: async () => [{ realEstateId: "property" }] },
    taxAssessment: { findMany: async (input: { where: unknown }) => { assessmentWhere = input.where; return [{ id: "assessment", realEstateId: "property", year: 2026, finalValueDecimal: new Prisma.Decimal("100.50"), guides: [{ payments: [{ amountPaidDecimal: new Prisma.Decimal("40.49"), amountPaid: 0 }] }] }]; } },
    taxRegistryEntry: { findMany: async () => [{ id: "non-tax", entityId: "property", data: { amount: "20.00" } }] },
  } as unknown as Prisma.TransactionClient;
  const result = await getConstructionPropertyDebts(tx, "case");
  assert.deepEqual(assessmentWhere, { realEstateId: { in: ["property"] }, status: { not: "Cancelado" } });
  assert.equal(result.taxTotal, "60.01"); assert.equal(result.nonTaxTotal, "20.00"); assert.equal(result.total, "80.01");
});

test("lançamento reutiliza geração de DAM tributário e repetições não duplicam taxa/guia", async () => {
  const fees: { id: string; assessmentId?: string; caseId: string; kind: string; cycleKey: string; revision: number; requestKey: string }[] = [];
  let assessment: Record<string, unknown> | undefined;
  let guides = 0;
  const audits: string[] = [];
  const tx = {
    $queryRaw: async () => [],
    constructionCase: { findFirst: async () => ({ id: "case", configuration: { freeRevisions: 1 }, revisionCount: 2, properties: [{ realEstateId: "property" }], processId: "process", process: { personId: "person", companyId: null, status: "Em andamento" }, totalArea: new Prisma.Decimal("10") }) },
    constructionFee: {
      findUnique: async (input: { where: { requestKey?: string; caseId_kind_cycleKey_revision?: { kind: string; cycleKey: string; revision: number } } }) => fees.find((fee) => input.where.requestKey ? fee.requestKey === input.where.requestKey : fee.kind === input.where.caseId_kind_cycleKey_revision?.kind && fee.cycleKey === input.where.caseId_kind_cycleKey_revision.cycleKey && fee.revision === input.where.caseId_kind_cycleKey_revision.revision),
      create: async (input: { data: (typeof fees)[number] }) => { const fee = { ...input.data, id: "fee" }; fees.push(fee); return fee; },
      update: async (input: { data: { assessmentId: string } }) => { fees[0].assessmentId = input.data.assessmentId; return fees[0]; },
    },
    taxpayer: { findFirst: async (input: { where: { id: string } }) => input.where.id === "taxpayer" ? { id: "taxpayer" } : null },
    constructionTaxRuleVersion: { findFirst: async () => ({ id: "rule", taxId: "tax", version: 1, startsAt: new Date("2026-01-01"), endsAt: null, fixedAmount: new Prisma.Decimal("5"), amountPerSquareMeter: new Prisma.Decimal("2"), legalBasis: "Lei demonstrativa", guideInstructions: "Sem convênio", demonstration: true }) },
    taxAssessment: {
      create: async (input: { data: Record<string, unknown> }) => { assessment = { ...input.data, id: "assessment", guides: [] }; return assessment; },
      findUnique: async () => assessment,
      update: async () => assessment,
    },
    financialYear: { findUnique: async () => ({ status: "Aberto" }) },
    taxDocumentSequence: { upsert: async () => ({ currentValue: 1 }) },
    taxGuide: { create: async (input: { data: Record<string, unknown> }) => { guides++; return { ...input.data, id: "guide" }; }, update: async () => ({}) },
    taxAuditLog: { create: async (input: { data: { action: string } }) => { audits.push(input.data.action); return {}; } },
  };
  const db = { $transaction: async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => callback(tx as unknown as Prisma.TransactionClient) } as Parameters<typeof issueConstructionFee>[0];
  const actor = { usuarioId: "actor", employeeId: "employee" };
  const access = { administrator: false, employeeId: "employee", departmentId: "sector", roles: ["MANAGER"] };
  const year = new Date().getUTCFullYear();
  const input = { caseId: "case", kind: "REANALYSIS", revision: 2, requestKey: "e234a66b-0ee1-4d31-8f1a-33d7a9dbd2e9", taxpayerId: "taxpayer", realEstateId: "property", dueDate: `${year}-12-31`, exemptionReason: "" };
  await assert.rejects(issueConstructionFee(db, access, actor, { ...input, taxpayerId: "other" }), /Contribuinte ativo/);
  assert.equal(await issueConstructionFee(db, access, actor, input), "fee");
  assert.equal(await issueConstructionFee(db, access, actor, input), "fee");
  assert.equal(await issueConstructionFee(db, access, actor, { ...input, requestKey: "f234a66b-0ee1-4d31-8f1a-33d7a9dbd2e9" }), "fee");
  assert.equal(fees.length, 1); assert.equal(guides, 1); assert.equal(fees[0].assessmentId, "assessment");
  assert.equal(String(assessment?.finalValueDecimal), "25");
  assert.deepEqual(audits, ["CREATE", "CONSTRUCTION_FEE_ISSUED"]);
});

test("checkPropertyDebts bloqueia somente ato final, sem bloquear alvará, vistoria ou parcelamento inicial", async () => {
  let debtQueries = 0;
  const fees = ["PERMIT", "INSPECTION", "SUBDIVISION", "HABITE_SE"].map((kind) => ({ kind, revision: 0, cycleKey: "INITIAL", amount: new Prisma.Decimal(0), exemptionReason: "Isenção demonstrativa fundamentada", assessment: null }));
  const tx = {
    $queryRaw: async () => [],
    constructionCase: { findUniqueOrThrow: async () => ({ revisionCount: 0, configuration: { freeRevisions: 1, checkPropertyDebts: true }, fees }) },
    constructionCaseProperty: { findMany: async () => { debtQueries++; return [{ realEstateId: "property" }]; } },
    taxAssessment: { findMany: async () => [{ id: "old-debt", realEstateId: "property", year: 2025, originalValue: 100, guides: [] }] },
    taxRegistryEntry: { findMany: async () => [] },
  } as unknown as Prisma.TransactionClient;
  for (const kind of ["PERMIT", "INSPECTION", "SUBDIVISION", "REANALYSIS"]) assert.equal((await assertConstructionFeesSatisfied(tx, "case", kind)).propertyDebts, null);
  assert.equal(debtQueries, 0);
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "HABITE_SE"), /Imóveis possuem R\$ 100.00/);
  assert.equal(debtQueries, 1);
});

test("F5: renovação/correção exige ciclo próprio, não aceita taxa inicial nem pagamento de outro pedido", async () => {
  let type = "RENEWAL";
  let requestStatus = "PENDING";
  const fees: unknown[] = [{ kind: "PERMIT", revision: 0, cycleKey: "INITIAL", amount: new Prisma.Decimal(0), exemptionReason: "Isenção inicial", assessment: null }];
  const tx = {
    $queryRaw: async () => [],
    constructionDocumentRequest: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, caseId: "case", type, status: requestStatus, sourceIssuedDocumentId: `source-${where.id}` }) },
    constructionIssuedDocument: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id, kind: "PERMIT" }) },
    constructionCase: { findUniqueOrThrow: async () => ({ revisionCount: 0, configuration: { freeRevisions: 1, checkPropertyDebts: true }, fees }) },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(assertConstructionFeesSatisfied(tx, "case", "RENEWAL"), /identificar o ciclo/);
  await assert.rejects(assertConstructionDocumentChangeFeesSatisfied(tx, "case", "renewal-a"), /Taxa RENEWAL/);
  fees.push({ kind: "RENEWAL", revision: 0, cycleKey: "DOCUMENT_REQUEST:renewal-a", amount: new Prisma.Decimal(50), exemptionReason: null, assessment: { status: "Pago", finalValueDecimal: new Prisma.Decimal(50), guides: [{ status: "Paga", totalValueDecimal: new Prisma.Decimal(50), payments: [{ amountPaid: 50, amountPaidDecimal: new Prisma.Decimal(50) }] }] } });
  const evidence = await assertConstructionDocumentChangeFeesSatisfied(tx, "case", "renewal-a");
  assert.equal(evidence.required[0].cycleKey, "DOCUMENT_REQUEST:renewal-a"); assert.equal(evidence.propertyDebts, null);
  await assert.rejects(assertConstructionDocumentChangeFeesSatisfied(tx, "case", "renewal-b"), /Taxa RENEWAL/);
  type = "CORRECTION";
  await assert.rejects(assertConstructionDocumentChangeFeesSatisfied(tx, "case", "correction-a"), /Taxa CORRECTION/);
  fees.push({ kind: "CORRECTION", revision: 0, cycleKey: "DOCUMENT_REQUEST:correction-a", amount: new Prisma.Decimal(0), exemptionReason: "Correção isenta conforme regra própria", assessment: null });
  assert.equal((await assertConstructionDocumentChangeFeesSatisfied(tx, "case", "correction-a")).cycle?.kind, "CORRECTION");
  requestStatus = "FULFILLED";
  await assert.rejects(assertConstructionDocumentChangeFeesSatisfied(tx, "case", "correction-a"), /pendente indisponível/);
});

test("F5: lançamento bloqueia regra ausente e emite uma taxa/evento por ciclo documental", async () => {
  let configured = false;
  const fees: Record<string, unknown>[] = [];
  const events: { eventType: string; metadata: string }[] = [];
  const tx = {
    $queryRaw: async () => [],
    constructionCase: { findFirst: async () => ({ id: "case", configuration: { freeRevisions: 1 }, revisionCount: 0, properties: [{ realEstateId: "property" }], processId: "process", process: { personId: "person", status: "Em andamento" }, totalArea: new Prisma.Decimal(10) }) },
    constructionDocumentRequest: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, caseId: "case", type: "RENEWAL", status: "PENDING", sourceIssuedDocumentId: `source-${where.id}` }) },
    constructionIssuedDocument: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id, kind: "PERMIT" }) },
    constructionFee: {
      findUnique: async ({ where }: { where: { requestKey?: string; caseId_kind_cycleKey_revision?: { cycleKey: string } } }) => fees.find((fee) => where.requestKey ? fee.requestKey === where.requestKey : fee.cycleKey === where.caseId_kind_cycleKey_revision?.cycleKey),
      create: async ({ data }: { data: Record<string, unknown> }) => { const fee = { ...data, id: `fee-${fees.length + 1}` }; fees.push(fee); return fee; },
    },
    taxpayer: { findFirst: async () => ({ id: "taxpayer" }) },
    constructionTaxRuleVersion: { findFirst: async ({ where }: { where: { kind: string } }) => { assert.equal(where.kind, "RENEWAL"); return configured ? { id: "renewal-rule", taxId: "tax", version: 1, startsAt: new Date("2026-01-01"), fixedAmount: new Prisma.Decimal(0), amountPerSquareMeter: new Prisma.Decimal(0), legalBasis: "Renovação isenta demonstrativa", guideInstructions: "Regra própria", demonstration: true } : null; } },
    taxAuditLog: { create: async () => ({}) },
    processEvent: { create: async ({ data }: { data: { eventType: string; metadata: string } }) => { events.push(data); return {}; } },
  };
  const db = { $transaction: async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => callback(tx as unknown as Prisma.TransactionClient) } as Parameters<typeof issueConstructionFee>[0];
  const access = { administrator: true, employeeId: "employee", departmentId: "sector", roles: [] };
  const actor = { usuarioId: "actor", employeeId: "employee" };
  const input = { caseId: "case", kind: "RENEWAL", revision: 0, documentRequestId: "renewal-a", requestKey: "e234a66b-0ee1-4d31-8f1a-33d7a9dbd2e9", taxpayerId: "taxpayer", realEstateId: "property", dueDate: `${new Date().getUTCFullYear()}-12-31`, exemptionReason: "Isenção fundamentada para este ciclo" };
  await assert.rejects(issueConstructionFee(db, access, actor, input), /vigente para RENEWAL/);
  assert.equal(fees.length, 0);
  configured = true;
  assert.equal(await issueConstructionFee(db, access, actor, input), "fee-1");
  assert.equal(await issueConstructionFee(db, access, actor, input), "fee-1");
  assert.equal(await issueConstructionFee(db, access, actor, { ...input, requestKey: "f234a66b-0ee1-4d31-8f1a-33d7a9dbd2e9" }), "fee-1");
  await assert.rejects(issueConstructionFee(db, access, actor, { ...input, documentRequestId: "renewal-b" }), /outra operação/);
  assert.equal(await issueConstructionFee(db, access, actor, { ...input, documentRequestId: "renewal-b", requestKey: "d234a66b-0ee1-4d31-8f1a-33d7a9dbd2e9" }), "fee-2");
  assert.equal(fees.length, 2); assert.equal(events.length, 2);
  assert.equal(events[0].eventType, "CONSTRUCTION_DOCUMENT_CHANGE_FEE_EXEMPT");
  assert.equal(JSON.parse(events[1].metadata).cycleKey, "DOCUMENT_REQUEST:renewal-b");
});
