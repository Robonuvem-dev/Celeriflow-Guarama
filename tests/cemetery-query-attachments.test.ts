import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cemeteryQuerySchema, cemeteryProcessWhere, cemeteryEventDayStart } from "../src/lib/cemeteries/query-policy";
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
  const where = cemeteryProcessWhere(cemeteryQuerySchema.parse({ start: "2026-10-10", end: "2026-10-10" }));
  assert.ok(JSON.stringify(where).includes("2026-10-11T03:00:00.000Z"));
  assert.ok(!JSON.stringify(where).includes("scheduledAt"));
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
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  let prisma: PrismaClient | undefined;
  try {
    for (const dir of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) await db.exec(readFileSync(`prisma/migrations-ibema/${dir}/migration.sql`, "utf8"));
    const columns = await db.query<{ table_name: string; column_name: string }>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`);
    const present = new Set(columns.rows.map(c => `${c.table_name}.${c.column_name}`));
    for (const model of Prisma.dmmf.datamodel.models.filter(m => m.name.startsWith("Cemetery") || ["TaxCemetery", "TaxCemeterySector", "TaxCemeteryEmployee", "TaxGrave", "TaxDeceased", "TaxBurialMovement", "TaxFuneralHome", "TaxDeathCause"].includes(m.name))) {
      for (const field of model.fields.filter(f => f.kind !== "object")) assert.ok(present.has(`${model.dbName || model.name}.${field.dbName || field.name}`), `Coluna ${model.name}.${field.name} ausente no histórico SQL`);
    }
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const profile = await prisma.configuracaoPerfil.findFirstOrThrow();
    await prisma.usuario.create({ data: { id: "tester", nome: "Operador teste", email: "cemetery-test@example.test", perfilId: profile.id } });
    const cemetery = await prisma.taxCemetery.create({ data: { code: "QUERY", name: "Cemitério teste" } });
    const person = await prisma.person.create({ data: { fullName: "Declarante consulta", cpf: "12345678901" } });
    const taxpayer = await prisma.taxpayer.create({ data: { taxpayerType: "PF", personId: person.id } });
    const home = await prisma.taxFuneralHome.create({ data: { name: "Funerária consulta" } });
    const cause = await prisma.taxDeathCause.create({ data: { code: "QUERY", description: "Causa consulta" } });
    const deceased = await prisma.taxDeceased.create({ data: { fullName: "Falecido consulta", deathDate: new Date("2026-10-09T00:00:00Z"), cemeteryId: cemetery.id, doctorName: "Médico teste", doctorCrm: "DEMO", groups: {}, createdByUsuarioId: "tester", causeId: cause.id } });
    await prisma.cemeteryProcess.createMany({ data: Array.from({ length: 521 }, (_, index) => ({ receiptCode: `QUERY-${String(index).padStart(4,"0")}`, processType: "SEPULTAMENTO", status: index === 0 ? "EXUMADO" : "SEPULTADO", deceasedId: deceased.id, cemeteryId: cemetery.id, funeralHomeId: home.id, declarantTaxpayerId: taxpayer.id, declarantDebtSnapshot: {}, scheduledAt: new Date("2026-09-01T12:00:00Z"), performedAt: new Date("2026-10-10T03:00:00Z"), createdByUsuarioId: "tester" })) });
    await prisma.cemeteryProcess.create({ data: { receiptCode: "QUERY-PENDING", processType: "SEPULTAMENTO", status: "AGENDADO", deceasedId: deceased.id, cemeteryId: cemetery.id, declarantTaxpayerId: taxpayer.id, declarantDebtSnapshot: {}, scheduledAt: new Date("2026-10-10T12:00:00Z"), createdByUsuarioId: "tester" } });
    const query = cemeteryQuerySchema.parse({ cemetery: cemetery.id, funeralHome: home.id, cause: cause.id, start: "2026-10-10", end: "2026-10-10", page: 27 });
    const list = await listCemeteryProcesses(prisma, query);
    assert.equal(list.total, 521); assert.equal(list.page, 27); assert.equal(list.items.length, 1); assert.equal(list.items[0].funeralHome?.name, home.name);
    const report = await cemeteryBurialReport(prisma, query);
    assert.equal(report.length, 521); assert.ok(report.some(r => r.status === "EXUMADO"));
    assert.equal((await listCemeteryProcesses(prisma, cemeteryQuerySchema.parse({ ...query, start: "2026-10-11", end: "2026-10-11" }))).total, 0);
    assert.equal((await listCemeteryProcesses(prisma, cemeteryQuerySchema.parse({ ...query, deathStart: "2026-10-10" }))).total, 0);
    const lookup = await cemeteryLookup(prisma, cemeteryLookupSchema.parse({ kind: "taxpayer", q: "12345678901", personOnly: "true" }));
    assert.equal(lookup.items[0].id, taxpayer.id);
    const lot = await prisma.cemeteryLot.create({ data: { cemeteryId: cemetery.id, identifier: "Q1", ownerTaxpayerId: taxpayer.id, graveLimit: 1 } });
    const target = { targetType: "LOTE" as const, targetId: lot.id };
    const payload = { requestKey: randomUUID(), title: "Documento do lote", fileUrl: "https://blob.example.test/cemetery.pdf", hashSha256: "a".repeat(64) };
    const attachment = await ingestCemeteryAttachment(prisma, "tester", target, payload);
    assert.equal(attachment.created, true);
    assert.equal((await ingestCemeteryAttachment(prisma, "tester", target, payload)).created, false);
    await assert.rejects(ingestCemeteryAttachment(prisma, "other", target, payload), /indisponível/);
    await assert.rejects(ingestCemeteryAttachment(prisma, "tester", target, { ...payload, hashSha256: "b".repeat(64) }), /indisponível/);
    await assert.rejects(ingestCemeteryAttachment(prisma, "tester", { targetType: "VELORIO", targetId: list.items[0].id }, { ...payload, requestKey: randomUUID() }), /não encontrado/);
    assert.equal((await listCemeteryAttachments(prisma, target)).total, 1);
    assert.equal(await prisma.documentVersion.count({ where: { documentId: payload.requestKey } }), 1);
    const history = await prisma.cemeteryChangeHistory.create({ data: { targetType: "LOTE", targetId: lot.id, fieldName: "identifier", previousValue: "Q0", newValue: "Q1", actorUsuarioId: "tester" } });
    await assert.rejects(prisma.cemeteryChangeHistory.update({ where: { id: history.id }, data: { newValue: "tampered" } }), /imutável/);
    await assert.rejects(prisma.cemeteryChangeHistory.delete({ where: { id: history.id } }), /imutável/);
    await assert.rejects(db.query('INSERT INTO "TaxGrave" (id,"cemeteryId",code,"graveType",capacity,"occupantCount","updatedAt") VALUES (\'INVALID\',$1,\'INVALID\',\'COVA\',1,2,CURRENT_TIMESTAMP)', [cemetery.id]), /check constraint/);
    const year = new Date().getUTCFullYear();
    await prisma.financialYear.create({ data: { year, status: "Aberto", startDate: new Date(`${year}-01-01`), endDate: new Date(`${year}-12-31T23:59:59Z`) } });
    const tax = await prisma.tax.create({ data: { code: "CEM-DEMO", name: "Taxa cemiterial demonstrativa", taxType: "Taxa" } });
    const actor = { usuarioId: "tester", employeeId: null };
    const rate = { cemeteryId: cemetery.id, label: "Taxa demonstrativa", formula: "VALOR_FIXO", baseAmount: "10.00", dueDays: 0, taxId: tax.id, validFrom: `${year}-01-01`, legalBasis: "Parâmetro demonstrativo de teste" };
    await publishCemeteryFeeRule(prisma, actor, { ...rate, eventType: "ACQUISICAO_LOTE" });
    await publishCemeteryFeeRule(prisma, actor, { ...rate, baseAmount: "25.00", eventType: "SEPULTAMENTO" });
    const purchased = await saveStructure(prisma, actor, "LOTE", undefined, { cemeteryId: cemetery.id, identifier: "AUTO", ownerTaxpayerId: taxpayer.id, graveLimit: 2, active: true, additionalData: {} });
    const acquisition = await prisma.cemeteryFeeEvent.findFirstOrThrow({ where: { sourceId: purchased.id, eventType: "ACQUISICAO_LOTE" } });
    assert.equal(acquisition.status, "EMITIDA"); assert.equal(acquisition.amount?.toFixed(2), "10.00");
    const automaticGrave = await prisma.taxGrave.create({ data: { cemeteryId: cemetery.id, lotId: purchased.id, code: "AUTO", graveType: "COVA" } });
    const chapel = await prisma.cemeteryChapel.create({ data: { cemeteryId: cemetery.id, name: "Capela automática", personTaxpayerId: taxpayer.id, responsibleTaxpayerId: taxpayer.id } });
    const scheduled = await registerDeceased(prisma, actor, { fullName: person.fullName, deceasedTaxpayerId: taxpayer.id, declarantTaxpayerId: taxpayer.id, deathDate: new Date(`${year}-01-01`), cemeteryId: cemetery.id, graveId: automaticGrave.id, funeralHomeId: home.id, causeId: cause.id, chapelId: chapel.id, doctorName: "Médico demonstrativo", doctorCrm: "DEMO", finalizeNow: false, requestKey: "AUTO-SCHEDULE" });
    const process = await prisma.cemeteryProcess.findFirstOrThrow({ where: { deceasedId: scheduled.id } });
    assert.equal(await prisma.cemeteryFeeEvent.count({ where: { sourceId: process.id } }), 0, "agendamento não dispara taxa de conclusão");
    await advanceCemeteryProcess(prisma, actor, { processId: process.id, status: "SEPULTADO", requestKey: "AUTO-FINISH" });
    await advanceCemeteryProcess(prisma, actor, { processId: process.id, status: "SEPULTADO", requestKey: "AUTO-FINISH" });
    const burialFee = await prisma.cemeteryFeeEvent.findFirstOrThrow({ where: { sourceId: process.id, eventType: "SEPULTAMENTO" } });
    assert.equal(burialFee.status, "EMITIDA"); assert.equal(burialFee.amount?.toFixed(2), "25.00");
    assert.equal(await prisma.taxAssessment.count(), 2); assert.equal(await prisma.taxGuide.count(), 2);
    assert.equal((await prisma.person.findUniqueOrThrow({ where: { id: person.id } })).estateApplied, true);
  } finally { await prisma?.$disconnect(); await server.stop(); await db.close(); }
});
