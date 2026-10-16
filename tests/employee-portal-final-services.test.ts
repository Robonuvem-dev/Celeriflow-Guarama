import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, PrismaClient, type AttendanceRecord } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { documentLayoutPolicySchema, renderFunctionalTemplate } from "../src/lib/portal-servidor/document-policy";
import { recognizedServiceDays } from "../src/lib/portal-servidor/document-sources";
import { configuredAttendanceTotals } from "../src/lib/portal-servidor/attendance-totals";
import { reconcileAttendanceSources, attendancePostingKey } from "../src/lib/rh/attendance-reconciliation";
import { functionalSourceManifestIsCurrent, makeFunctionalSourceManifest } from "../src/lib/portal-servidor/source-manifest";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { enrollOwnCourse } from "../src/lib/portal-servidor/career-service";

test("municipal models enforce sources, configured bank validity and real PPP signature", () => {
  const base = { origin: "MODELO_DOCUMENTO_FUNCIONAL", budgetUnitId: "ug", kinds: ["DECLARACAO_VINCULO"], issuerName: "Prefeitura", issuerCnpj: "12345678000195", title: "Declaração", text: "Titular {{nome}} — situação {{situacao}}", footer: "", legalReference: "Norma municipal", documentClassCode: "FUNCTIONAL", signerUserIds: [], requireSignature: false };
  assert.equal(documentLayoutPolicySchema.safeParse(base).success, true);
  assert.equal(documentLayoutPolicySchema.safeParse({ ...base, kinds: ["PPP"] }).success, false);
  assert.equal(documentLayoutPolicySchema.safeParse({ ...base, kinds: ["MARGEM"], supplierIds: ["bank"] }).success, false);
  assert.equal(documentLayoutPolicySchema.safeParse({ ...base, text: "Servidor {{titular_escolhido}}" }).success, false);
  assert.throws(() => renderFunctionalTemplate(base.text, { nome: "Servidor", situacao: "" }), /Fonte ausente/);
  assert.equal(renderFunctionalTemplate(base.text, { nome: "Servidor", situacao: "ATIVO" }), "Titular Servidor — situação ATIVO");
});

test("historical service days unite overlaps and remove only recognized exclusions; totals use the whole dataset", () => {
  const periods = [{ startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-06") }, { startsAt: new Date("2026-01-04"), endsAt: new Date("2026-01-11") }];
  assert.equal(recognizedServiceDays(periods, [{ startDate: new Date("2026-01-05"), endDate: new Date("2026-01-06") }], new Date("2026-01-01"), new Date("2026-01-10T23:59:59Z")), 8);
  const rows = Array.from({ length: 41 }, (_, index) => ({ hoursWorked: 8, extraHours: index % 2 ? 1 : 0, bankHours: 0, contractedHours: 8, status: "Presente" })) as AttendanceRecord[];
  const totals = configuredAttendanceTotals(rows, { origin: "TOTALIZADORES_PONTO_FUNCIONAL", budgetUnitId: "ug", totals: [{ code: "HOURS", label: "Horas", field: "hoursWorked" }, { code: "DAYS", label: "Dias", field: "RECORD_COUNT" }] });
  assert.equal(totals[0].value, "328.0000"); assert.equal(totals[1].value, "41");
});

test("PostgreSQL attendance reconciliation preserves originals, compensates actual ledgers and rejects stale posting versions", async () => {
  const pg = new PGlite(), server = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  let db: PrismaClient | undefined;
  try {
    for (const name of ["AttendanceRecord", "HrEmploymentContract", "HrIntegrationEvent", "HrMovement", "HrRightEntry"]) {
      const model = Prisma.dmmf.datamodel.models.find(model => model.name === name)!;
      const fields = model.fields.filter(field => field.kind !== "object").map(field => {
        const types: Record<string, string> = { Int: "INTEGER", Float: "DOUBLE PRECISION", Decimal: "NUMERIC(24,6)", DateTime: "TIMESTAMP(3)", Boolean: "BOOLEAN", Json: "JSONB" };
        const fallback = field.type === "DateTime" && field.isRequired ? " DEFAULT CURRENT_TIMESTAMP" : typeof field.default === "string" ? ` DEFAULT '${field.default.replaceAll("'", "''")}'` : typeof field.default === "number" || typeof field.default === "boolean" ? ` DEFAULT ${field.default}` : "";
        return `"${field.name}" ${types[field.type] || "TEXT"}${field.isList ? "[]" : ""}${field.name === "id" ? " PRIMARY KEY" : field.isUnique ? " UNIQUE" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}"(${fields.join(",")})`);
    }
    await server.start(); db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const contract = await db.hrEmploymentContract.create({ data: { id: "contract", employeeId: "employee", registration: "1", regimeId: "regime", roleId: "role", workLocation: "Unidade", admittedAt: new Date("2020-01-01"), monthlyHours: 200, salary: "2000", details: {} } });
    const before = await db.attendanceRecord.create({ data: { id: "attendance", employeeId: "employee", date: new Date("2026-01-01"), hoursWorked: 9, extraHours: 1, bankHours: 1, contractedHours: 8, status: "Presente" } });
    const extraPolicy = { origin: "HORAS_EXTRAS_PONTO", rubricCode: "EXTRA", additionalRate: "50", legalReference: "Norma" };
    const bankPolicy = { origin: "BANCO_HORAS_PONTO", maxBalanceHours: "100", maxCreditPerDayHours: "5", maxDebitPerDayHours: "5", allowedStatuses: ["Presente"], forbidPaidOvertimeForCredit: false, legalReference: "Norma" };
    await db.hrMovement.create({ data: { id: "extra", contractId: contract.id, sourceKey: "PONTO:HORAS_EXTRAS:attendance", rubricCode: "EXTRA", startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-31"), amount: 15, notes: "Origem", actorId: "actor" } });
    await db.hrRightEntry.create({ data: { id: "bank", contractId: contract.id, sourceKey: "PONTO:BANCO_HORAS:attendance", kind: "BANCO_HORAS", periodStart: before.date, periodEnd: before.date, quantity: 1, amount: 0, actorId: "actor", details: { policy: bankPolicy, scope: "PRODUCAO", attendanceId: before.id } } });
    await db.hrIntegrationEvent.createMany({ data: [{ sourceKey: "PONTO:HORAS_EXTRAS:attendance", domain: "AUDITORIA", environment: "PRODUCAO", eventType: "HORAS_EXTRAS_CALCULADAS", payloadHash: "hash", payload: JSON.parse(JSON.stringify({ contractId: contract.id, contractVersion: 1, competence: "01/2026", ruleId: "extraRule", policy: extraPolicy, attendance: before, hourlyValue: "10" })) }, { sourceKey: "PONTO:BANCO_HORAS:attendance", domain: "AUDITORIA", environment: "PRODUCAO", eventType: "BANCO_HORAS_RECONHECIDO", payloadHash: "hash", payload: JSON.parse(JSON.stringify({ contractId: contract.id, competence: "01/2026", ruleId: "bankRule", attendance: before })) }] });
    const after = await db.$transaction(async tx => { const current = await tx.attendanceRecord.update({ where: { id: before.id }, data: { extraHours: 2, bankHours: 2, hoursWorked: 10 } }); await reconcileAttendanceSources(tx, "actor", "request", before, current, contract); return current; });
    assert.equal((await db.hrMovement.findUniqueOrThrow({ where: { id: "extra" } })).amount.toFixed(2), "15.00");
    assert.equal((await db.hrMovement.aggregate({ _sum: { amount: true } }))._sum.amount?.toFixed(2), "30.00");
    assert.equal((await db.hrRightEntry.aggregate({ _sum: { quantity: true } }))._sum.quantity?.toString(), "2");
    assert.equal(await db.$transaction(tx => attendancePostingKey(tx, "PONTO:HORAS_EXTRAS:attendance", after)), "PONTO:HORAS_EXTRAS:attendance:AJUSTE:request");
    await assert.rejects(db.$transaction(tx => attendancePostingKey(tx, "PONTO:HORAS_EXTRAS:attendance", { ...after, updatedAt: new Date(after.updatedAt.getTime() + 1000) })), /alterado após conciliação/);
    const bad = { ...after, bankHours: -10 };
    const count = await db.hrRightEntry.count();
    await assert.rejects(db.$transaction(tx => reconcileAttendanceSources(tx, "actor", "request-bad", after, bad, contract)), /política|saldo/);
    assert.equal(await db.hrRightEntry.count(), count);
  } finally { await db?.$disconnect(); await server.stop(); await pg.close(); }
});

test("public validation source manifest invalidates canceled payment without exposing recipient or salary", async () => {
  const manifest = makeFunctionalSourceManifest([{ allocation: { statementId: "statement", statementHash: "hash", proofVersionId: "proof", proofHash: "hash" }, payments: [{ id: "payment", date: "2026-01-10T00:00:00.000Z", status: "Paga", net: "100" }] }]);
  assert.ok(!JSON.stringify(manifest).includes("fullName"));
  const db = { hrPayrollStatement: { findFirst: async () => null } } as unknown as AppContext["prisma"];
  assert.equal(await functionalSourceManifestIsCurrent(db, manifest), false);
});

test("PostgreSQL course capacity is claimed atomically and the accepted registration is idempotent", async () => {
  const pg = new PGlite(), server = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  let db: PrismaClient | undefined;
  try {
    for (const name of ["Employee", "HrPortalRequest", "HrPayrollRuleSet", "HrPayrollRule", "AuditEvent"]) {
      const model = Prisma.dmmf.datamodel.models.find(model => model.name === name)!;
      const fields = model.fields.filter(field => field.kind !== "object").map(field => {
        const types: Record<string, string> = { Int: "INTEGER", Float: "DOUBLE PRECISION", Decimal: "NUMERIC(24,6)", DateTime: "TIMESTAMP(3)", Boolean: "BOOLEAN", Json: "JSONB" };
        const fallback = field.type === "DateTime" && field.isRequired ? " DEFAULT CURRENT_TIMESTAMP" : typeof field.default === "string" ? ` DEFAULT '${field.default.replaceAll("'", "''")}'` : typeof field.default === "number" || typeof field.default === "boolean" ? ` DEFAULT ${field.default}` : "";
        return `"${field.name}" ${types[field.type] || "TEXT"}${field.isList ? "[]" : ""}${field.name === "id" ? " PRIMARY KEY" : field.isUnique ? " UNIQUE" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}"(${fields.join(",")})`);
    }
    await server.start(); db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 2 }) });
    await db.employee.createMany({ data: [{ id: "employeeA", name: "Servidor A", isActive: true }, { id: "employeeB", name: "Servidor B", isActive: true }] });
    const now = Date.now(), instant = (hours: number) => new Date(now + hours * 3600000).toISOString();
    await db.hrPayrollRuleSet.create({ data: { id: "set", configuracaoInstanciaId: "instance", code: "RULES", name: "Parâmetros", status: "ATIVA", effectiveFrom: new Date(instant(-48)) } });
    await db.hrPayrollRule.create({ data: { id: "course", ruleSetId: "set", code: "PORTAL_CURSO_CAPACITY", name: "Curso", category: "PORTAL", valueType: "JSON", isActive: true, value: { origin: "CAPACITACAO_FUNCIONAL", budgetUnitId: "ug", employeeIds: [], enrollmentStartsAt: instant(-24), enrollmentEndsAt: instant(24), startsAt: instant(48), endsAt: instant(72), capacity: 1, hours: 4, minAttendancePercentage: 75, location: "Unidade", issuerName: "Prefeitura", instructions: "Orientações" } } });
    const context = (id: string) => ({ prisma: db!, user: { id: `user-${id}`, employeeId: id } }) as AppContext;
    const outcomes = await Promise.allSettled([enrollOwnCourse(context("employeeA"), { courseId: "course" }), enrollOwnCourse(context("employeeB"), { courseId: "course" })]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1, outcomes.map(outcome => outcome.status === "rejected" ? String(outcome.reason) : "registered").join(" · "));
    assert.equal(await db.hrPortalRequest.count(), 1);
    const request = await db.hrPortalRequest.findFirstOrThrow();
    assert.equal(await enrollOwnCourse(context(request.employeeId), { courseId: "course" }), request.id);
  } finally { await db?.$disconnect(); await server.stop(); await pg.close(); }
});
