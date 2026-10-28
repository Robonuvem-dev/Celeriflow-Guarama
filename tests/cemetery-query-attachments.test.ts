import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { cemeteryQuerySchema, cemeteryEventDayStart } from "../src/lib/cemeteries/query-policy";
import { cemeteryProcessPredicate } from "../src/db/repositories/cemeteries/process-filter";
import { and, count, eq, getTableColumns, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as cemeteryTables from "../src/db/schema/cemeteries";
import { createCemeteryDatabase } from "./helpers/cemetery-database";
import { people } from "../src/db/schema/people";
import { taxpayers } from "../src/db/schema/registry";
import { financialYears } from "../src/db/schema/finance-years";
import { taxAssessments, taxGuides, taxes } from "../src/db/schema/taxation-core";
import { readCemeteryGuide, readScheduledProcessPage, readWorkflowProcess } from "../src/db/repositories/cemeteries/workflow-pages";
import { listCemeteryProcesses, cemeteryBurialReport } from "../src/lib/cemeteries/queries";
import { cemeteryLookup, cemeteryLookupSchema } from "../src/lib/cemeteries/lookups";
import { ingestCemeteryAttachment, listCemeteryAttachments } from "../src/lib/cemeteries/attachments";
import { generateCemeteryBurialPdf } from "../src/lib/cemeteries/report-pdf";
import { PDFDocument } from "pdf-lib";
import { publishCemeteryFeeRule } from "../src/lib/cemeteries/fees-service";
import { saveStructure } from "../src/lib/cemeteries/structure-service";
import { registerDeceased, advanceCemeteryProcess } from "../src/lib/tributacao/s9-service";

test("datas civis e datas efetivas não confundem agendamento com sepultamento", () => {
  assert.equal(cemeteryEventDayStart("2026-10-10").toISOString(), "2026-10-10T03:00:00.000Z");
  assert.equal(cemeteryQuerySchema.safeParse({ start: "2026-10-11", end: "2026-10-10" }).success, false);
  assert.equal(cemeteryQuerySchema.safeParse({ start: "2026-02-30" }).success, false);
  const where = new PgDialect().sqlToQuery(cemeteryProcessPredicate(cemeteryQuerySchema.parse({ start: "2026-10-10", end: "2026-10-10" }))!);
  assert.ok(JSON.stringify(where.params).includes("2026-10-11T03:00:00.000"));
  assert.ok(!where.sql.includes("scheduledAt"));
});

test("relatório gera PDF multipágina sem truncar pessoas nem registros", async () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ receipt: `REC-${i}`, deceased: `Pessoa ${i} ${"nome longo ".repeat(25)}`, deathDate: "09/10/2026", performedAt: "10/10/2026 08:00", cemetery: "Cemitério demonstrativo", grave: "Q1", funeralHome: "Funerária teste", status: "SEPULTADO" }));
  const bytes = await generateCemeteryBurialPdf(rows, "Período de 10/10/2026 a 10/10/2026", "10/10/2026");
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 3);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const doc = await task.promise;
    let text = "";
    for (let page = 1; page <= doc.numPages; page++) text += (await (await doc.getPage(page)).getTextContent()).items.map(i => "str" in i ? i.str : "").join(" ");
    assert.ok(text.includes("REC-0")); assert.ok(text.includes("REC-79")); assert.ok(text.includes("Total: 80"));
  } finally { await task.destroy(); }
});

test("PostgreSQL: 501+ processos, filtros reais, relatório integral e anexos GED isolados/idempotentes", { timeout: 180000 }, async () => {
  const fixture = await createCemeteryDatabase("tester");
  const db = fixture.database, connection = fixture.connection, executor = connection.db;
  const { cemeteries, cemeteryFuneralHomes, cemeteryDeathCauses, cemeteryDeceased, cemeteryProcesses, cemeteryLots, cemeteryChangeHistory, cemeteryFeeEvents, cemeteryGraves, cemeteryChapels } = cemeteryTables;
  try {
    const columns = await db.query<{ table_name: string; column_name: string }>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`);
    const present = new Set(columns.rows.map(c => `${c.table_name}.${c.column_name}`));
    for (const table of Object.values(cemeteryTables)) {
      for (const column of Object.values(getTableColumns(table))) assert.ok(present.has(`${getTableName(table)}.${column.name}`), `Coluna ${getTableName(table)}.${column.name} ausente no histórico SQL`);
    }
    const [cemetery] = await executor.insert(cemeteries).values({ code: "QUERY", name: "Cemitério teste" }).returning();
    const [person] = await executor.insert(people).values({ fullName: "Declarante consulta", cpf: "12345678901" }).returning();
    const [taxpayer] = await executor.insert(taxpayers).values({ taxpayerType: "PF", personId: person.id }).returning();
    const [home] = await executor.insert(cemeteryFuneralHomes).values({ name: "Funerária consulta" }).returning();
    const [cause] = await executor.insert(cemeteryDeathCauses).values({ code: "QUERY", description: "Causa consulta" }).returning();
    const [deceased] = await executor.insert(cemeteryDeceased).values({ fullName: "Falecido consulta", deathDate: new Date("2026-10-09T00:00:00Z"), cemeteryId: cemetery.id, doctorName: "Médico teste", doctorCrm: "DEMO", groups: {}, createdByUsuarioId: "tester", causeId: cause.id }).returning();
    await executor.insert(cemeteryProcesses).values(Array.from({ length: 521 }, (_, index) => ({ receiptCode: `QUERY-${String(index).padStart(4,"0")}`, processType: "SEPULTAMENTO", status: index === 0 ? "EXUMADO" : "SEPULTADO", deceasedId: deceased.id, cemeteryId: cemetery.id, funeralHomeId: home.id, declarantTaxpayerId: taxpayer.id, declarantDebtSnapshot: {}, scheduledAt: new Date("2026-09-01T12:00:00Z"), performedAt: new Date("2026-10-10T03:00:00Z"), createdByUsuarioId: "tester" })));
    await executor.insert(cemeteryProcesses).values({ receiptCode: "QUERY-PENDING", processType: "SEPULTAMENTO", status: "AGENDADO", deceasedId: deceased.id, cemeteryId: cemetery.id, declarantTaxpayerId: taxpayer.id, declarantDebtSnapshot: {}, scheduledAt: new Date("2026-10-10T12:00:00Z"), createdByUsuarioId: "tester" });
    const query = cemeteryQuerySchema.parse({ cemetery: cemetery.id, funeralHome: home.id, cause: cause.id, start: "2026-10-10", end: "2026-10-10", page: 27 });
    const list = await listCemeteryProcesses(executor, query);
    assert.equal(list.total, 521); assert.equal(list.page, 27); assert.equal(list.items.length, 1); assert.equal(list.items[0].funeralHome?.name, home.name);
    const report = await cemeteryBurialReport(executor, query);
    assert.equal(report.length, 521); assert.ok(report.some(r => r.status === "EXUMADO"));
    assert.equal((await listCemeteryProcesses(executor, cemeteryQuerySchema.parse({ ...query, start: "2026-10-11", end: "2026-10-11" }))).total, 0);
    assert.equal((await listCemeteryProcesses(executor, cemeteryQuerySchema.parse({ ...query, deathStart: "2026-10-10" }))).total, 0);
    const lookup = await cemeteryLookup(executor, cemeteryLookupSchema.parse({ kind: "taxpayer", q: "12345678901", personOnly: "true" }));
    assert.equal(lookup.items[0].id, taxpayer.id);
    const [lot] = await executor.insert(cemeteryLots).values({ cemeteryId: cemetery.id, identifier: "Q1", ownerTaxpayerId: taxpayer.id, graveLimit: 1 }).returning();
    const target = { targetType: "LOTE" as const, targetId: lot.id };
    const payload = { requestKey: randomUUID(), title: "Documento do lote", fileUrl: "https://blob.example.test/cemetery.pdf", hashSha256: "a".repeat(64) };
    const attachment = await ingestCemeteryAttachment(connection, "tester", target, payload);
    assert.equal(attachment.created, true);
    assert.equal((await ingestCemeteryAttachment(connection, "tester", target, payload)).created, false);
    await assert.rejects(ingestCemeteryAttachment(connection, "other", target, payload), /indisponível/);
    await assert.rejects(ingestCemeteryAttachment(connection, "tester", target, { ...payload, hashSha256: "b".repeat(64) }), /indisponível/);
    await assert.rejects(ingestCemeteryAttachment(connection, "tester", { targetType: "VELORIO", targetId: list.items[0].id }, { ...payload, requestKey: randomUUID() }), /não encontrado/);
    assert.equal((await listCemeteryAttachments(executor, target)).total, 1);
    assert.equal(Number((await db.query<{ total: string }>('SELECT count(*) AS total FROM "DocumentVersion" WHERE "documentId"=$1', [payload.requestKey])).rows[0].total), 1);
    const [history] = await executor.insert(cemeteryChangeHistory).values({ targetType: "LOTE", targetId: lot.id, fieldName: "identifier", previousValue: "Q0", newValue: "Q1", actorUsuarioId: "tester" }).returning();
    const immutableHistory = (error: unknown) => /imutável/.test(String(error instanceof Error ? error.cause ?? error : error));
    await assert.rejects(async () => { await executor.update(cemeteryChangeHistory).set({ newValue: "tampered" }).where(eq(cemeteryChangeHistory.id, history.id)); }, immutableHistory);
    await assert.rejects(async () => { await executor.delete(cemeteryChangeHistory).where(eq(cemeteryChangeHistory.id, history.id)); }, immutableHistory);
    await assert.rejects(db.query('INSERT INTO "TaxGrave" (id,"cemeteryId",code,"graveType",capacity,"occupantCount","updatedAt") VALUES (\'INVALID\',$1,\'INVALID\',\'COVA\',1,2,CURRENT_TIMESTAMP)', [cemetery.id]), /check constraint/);
    const year = new Date().getUTCFullYear();
    await executor.insert(financialYears).values({ year, status: "Aberto", startDate: new Date(`${year}-01-01`), endDate: new Date(`${year}-12-31T23:59:59Z`) });
    const [tax] = await executor.insert(taxes).values({ code: "CEM-DEMO", name: "Taxa cemiterial demonstrativa", taxType: "Taxa" }).returning();
    const actor = { usuarioId: "tester", employeeId: null };
    const rate = { cemeteryId: cemetery.id, label: "Taxa demonstrativa", formula: "VALOR_FIXO", baseAmount: "10.00", dueDays: 0, taxId: tax.id, validFrom: `${year}-01-01`, legalBasis: "Parâmetro demonstrativo de teste" };
    await publishCemeteryFeeRule(connection, actor, { ...rate, eventType: "ACQUISICAO_LOTE" });
    await publishCemeteryFeeRule(connection, actor, { ...rate, baseAmount: "25.00", eventType: "SEPULTAMENTO" });
    const purchased = await saveStructure(connection, actor, "LOTE", undefined, { cemeteryId: cemetery.id, identifier: "AUTO", ownerTaxpayerId: taxpayer.id, graveLimit: 2, active: true, additionalData: {} });
    const [acquisition] = await executor.select().from(cemeteryFeeEvents).where(and(eq(cemeteryFeeEvents.sourceId, purchased.id), eq(cemeteryFeeEvents.eventType, "ACQUISICAO_LOTE"))).limit(1);
    assert.equal(acquisition.status, "EMITIDA"); assert.equal(acquisition.amount?.toFixed(2), "10.00");
    const [automaticGrave] = await executor.insert(cemeteryGraves).values({ cemeteryId: cemetery.id, lotId: purchased.id, code: "AUTO", graveType: "COVA" }).returning();
    const [chapel] = await executor.insert(cemeteryChapels).values({ cemeteryId: cemetery.id, name: "Capela automática", personTaxpayerId: taxpayer.id, responsibleTaxpayerId: taxpayer.id }).returning();
    const scheduled = await registerDeceased(connection, actor, { fullName: person.fullName, deceasedTaxpayerId: taxpayer.id, declarantTaxpayerId: taxpayer.id, deathDate: new Date(`${year}-01-01`), cemeteryId: cemetery.id, graveId: automaticGrave.id, funeralHomeId: home.id, causeId: cause.id, chapelId: chapel.id, doctorName: "Médico demonstrativo", doctorCrm: "DEMO", finalizeNow: false, requestKey: "AUTO-SCHEDULE" });
    const [process] = await executor.select().from(cemeteryProcesses).where(eq(cemeteryProcesses.deceasedId, scheduled.id)).limit(1);
    assert.equal((await executor.select({ total: count() }).from(cemeteryFeeEvents).where(eq(cemeteryFeeEvents.sourceId, process.id)))[0].total, 0, "agendamento não dispara taxa de conclusão");
    await advanceCemeteryProcess(connection, actor, { processId: process.id, status: "SEPULTADO", requestKey: "AUTO-FINISH" });
    await advanceCemeteryProcess(connection, actor, { processId: process.id, status: "SEPULTADO", requestKey: "AUTO-FINISH" });
    const [burialFee] = await executor.select().from(cemeteryFeeEvents).where(and(eq(cemeteryFeeEvents.sourceId, process.id), eq(cemeteryFeeEvents.eventType, "SEPULTAMENTO"))).limit(1);
    assert.equal(burialFee.status, "EMITIDA"); assert.equal(burialFee.amount?.toFixed(2), "25.00");
    assert.equal((await executor.select({ total: count() }).from(taxAssessments))[0].total, 2); assert.equal((await executor.select({ total: count() }).from(taxGuides))[0].total, 2);
    assert.equal((await executor.select().from(people).where(eq(people.id, person.id)))[0].estateApplied, true);
    const scheduledPage = await readScheduledProcessPage(executor, { q: "QUERY", type: "SEPULTAMENTO", status: "", cemeteryId: cemetery.id, start: "2026-10-10", end: "2026-10-10", page: 999 });
    assert.equal(scheduledPage.total, 1, "agenda usa scheduledAt, não performedAt");
    assert.equal(scheduledPage.rows[0].receiptCode, "QUERY-PENDING");
    const receipt = await readWorkflowProcess(executor, { receiptCode: process.receiptCode });
    assert.equal(receipt?.id, process.id); assert.ok(receipt?.scheduledAt instanceof Date);
    const printed = await readCemeteryGuide(executor, burialFee.guideId!);
    assert.equal(printed.guide?.assessment.taxpayer.person?.fullName, (await executor.select().from(people).where(eq(people.id, person.id)))[0].fullName);
    assert.equal(printed.event?.amount?.toFixed(2), "25.00"); assert.ok(printed.guide?.dueDate instanceof Date);
  } finally { await fixture.close(); }
});
