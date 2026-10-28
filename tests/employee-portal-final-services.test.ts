import test from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { employees } from "../src/db/schema/administration";
import { accessProfiles, users } from "../src/db/schema/identity";
import { hrEmploymentContracts, hrIntegrationEvents, hrMovements, hrRightEntries } from "../src/db/schema/personnel-workforce";
import { hrPayrollRules, hrPayrollRuleSets } from "../src/db/schema/personnel-configuration";
import { employeePortalRequests } from "../src/db/schema/employee-portal";
import { portalCount, portalRequired } from "../src/db/repositories/portal-servidor/records";
import { withDatabaseTransaction } from "../src/db/transaction";
import type { AttendanceRecord } from "../src/lib/contracts/personnel";
import { documentLayoutPolicySchema, renderFunctionalTemplate } from "../src/lib/portal-servidor/document-policy";
import { recognizedServiceDays } from "../src/lib/portal-servidor/document-sources";
import { configuredAttendanceTotals } from "../src/lib/portal-servidor/attendance-totals";
import { reconcileAttendanceSources, attendancePostingKey } from "../src/lib/rh/attendance-reconciliation";
import { functionalSourceManifestIsCurrent, makeFunctionalSourceManifest } from "../src/lib/portal-servidor/source-manifest";
import { enrollOwnCourse } from "../src/lib/portal-servidor/career-service";
import { createEmployeePortalFixture, employeePortalUser } from "./helpers/employee-portal-fixture";

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
  const rows: AttendanceRecord[] = Array.from({ length: 41 }, (_, index) => ({ id: `record-${index}`, employeeId: "employee", date: new Date("2026-01-01"), entryTime: null, exitTime: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), hoursWorked: 8, extraHours: index % 2 ? 1 : 0, bankHours: 0, contractedHours: 8, status: "Presente" }));
  const totals = configuredAttendanceTotals(rows, { origin: "TOTALIZADORES_PONTO_FUNCIONAL", budgetUnitId: "ug", totals: [{ code: "HOURS", label: "Horas", field: "hoursWorked" }, { code: "DAYS", label: "Dias", field: "RECORD_COUNT" }] });
  assert.equal(totals[0].value, "328.0000"); assert.equal(totals[1].value, "41");
});

test("PostgreSQL attendance reconciliation preserves originals, compensates actual ledgers and rejects stale posting versions", async () => {
  const fixture = await createEmployeePortalFixture("attendance"), { connection } = fixture, db = connection.db;
  try {
    await db.insert(employees).values({ id: "employee", name: "Servidor" });
    const [contract] = await db.insert(hrEmploymentContracts).values({ id: "contract", employeeId: "employee", registration: "1", regimeId: "regime", roleId: "role", workLocation: "Unidade", admittedAt: new Date("2020-01-01"), monthlyHours: 200, salary: new Decimal("2000"), details: {} }).returning();
    const before = await portalRequired<AttendanceRecord>(db, sql`INSERT INTO "AttendanceRecord" (id,"employeeId",date,"hoursWorked","extraHours","bankHours","contractedHours",status,"updatedAt") VALUES ('attendance','employee','2026-01-01',9,1,1,8,'Presente','2026-01-01T12:00:00Z') RETURNING *`);
    const extraPolicy = { origin: "HORAS_EXTRAS_PONTO", rubricCode: "EXTRA", additionalRate: "50", legalReference: "Norma" };
    const bankPolicy = { origin: "BANCO_HORAS_PONTO", maxBalanceHours: "100", maxCreditPerDayHours: "5", maxDebitPerDayHours: "5", allowedStatuses: ["Presente"], forbidPaidOvertimeForCredit: false, legalReference: "Norma" };
    await db.insert(hrMovements).values({ id: "extra", contractId: contract.id, sourceKey: "PONTO:HORAS_EXTRAS:attendance", rubricCode: "EXTRA", startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-31"), amount: new Decimal(15), notes: "Origem", actorId: "actor" });
    await db.insert(hrRightEntries).values({ id: "bank", contractId: contract.id, sourceKey: "PONTO:BANCO_HORAS:attendance", kind: "BANCO_HORAS", periodStart: before.date, periodEnd: before.date, quantity: new Decimal(1), amount: new Decimal(0), actorId: "actor", details: { policy: bankPolicy, scope: "PRODUCAO", attendanceId: before.id } });
    await db.insert(hrIntegrationEvents).values([{ sourceKey: "PONTO:HORAS_EXTRAS:attendance", domain: "AUDITORIA", environment: "PRODUCAO", eventType: "HORAS_EXTRAS_CALCULADAS", payloadHash: "hash", payload: JSON.parse(JSON.stringify({ contractId: contract.id, contractVersion: 1, competence: "01/2026", ruleId: "extraRule", policy: extraPolicy, attendance: before, hourlyValue: "10" })) }, { sourceKey: "PONTO:BANCO_HORAS:attendance", domain: "AUDITORIA", environment: "PRODUCAO", eventType: "BANCO_HORAS_RECONHECIDO", payloadHash: "hash", payload: JSON.parse(JSON.stringify({ contractId: contract.id, competence: "01/2026", ruleId: "bankRule", attendance: before })) }]);
    const after = await withDatabaseTransaction(connection, async tx => { const current = await portalRequired<AttendanceRecord>(tx, sql`UPDATE "AttendanceRecord" SET "extraHours"=2,"bankHours"=2,"hoursWorked"=10,"updatedAt"='2026-01-01T12:00:01Z' WHERE id=${before.id} RETURNING *`); await reconcileAttendanceSources(tx, "actor", "request", before, current, contract); return current; });
    const [original] = await db.select().from(hrMovements).where(eq(hrMovements.id, "extra"));
    assert.equal(original.amount.toFixed(2), "15.00");
    assert.equal((await portalRequired<{ amount: string }>(db, sql`SELECT sum(amount) AS amount FROM "HrMovement"`)).amount, "30.00");
    assert.equal(new Decimal((await portalRequired<{ quantity: string }>(db, sql`SELECT sum(quantity) AS quantity FROM "HrRightEntry"`)).quantity).toString(), "2");
    assert.equal(await withDatabaseTransaction(connection, tx => attendancePostingKey(tx, "PONTO:HORAS_EXTRAS:attendance", after)), "PONTO:HORAS_EXTRAS:attendance:AJUSTE:request");
    await assert.rejects(withDatabaseTransaction(connection, tx => attendancePostingKey(tx, "PONTO:HORAS_EXTRAS:attendance", { ...after, updatedAt: new Date(after.updatedAt.getTime() + 1000) })), /alterado após conciliação/);
    const bad = { ...after, bankHours: -10 };
    const count = await portalCount(db, sql`SELECT count(*) FROM "HrRightEntry"`), movements = await portalCount(db, sql`SELECT count(*) FROM "HrMovement"`);
    await assert.rejects(withDatabaseTransaction(connection, tx => reconcileAttendanceSources(tx, "actor", "request-bad", after, bad, contract)), /política|saldo/);
    assert.equal(await portalCount(db, sql`SELECT count(*) FROM "HrRightEntry"`), count);
    assert.equal(await portalCount(db, sql`SELECT count(*) FROM "HrMovement"`), movements, "a falha do banco deve reverter também a compensação das horas extras");
  } finally { await fixture.close(); }
});

test("public validation source manifest invalidates canceled payment without exposing recipient or salary", async () => {
  const manifest = makeFunctionalSourceManifest([{ payments: [{ id: "payment", date: "2026-01-10T00:00:00.000Z", status: "Paga", net: "90071992547409.91" }] }]);
  assert.ok(!JSON.stringify(manifest).includes("fullName"));
  const fixture = await createEmployeePortalFixture("manifest"), db = fixture.connection.db;
  try {
    await db.execute(sql`INSERT INTO "Payment" (id,"orderNumber",date,value,"netValueDecimal","commitmentId","bankAccountId","supplierId",status,"updatedAt") VALUES ('payment','1','2026-01-10',100,90071992547409.91,'commitment','account','supplier','Paga',CURRENT_TIMESTAMP)`);
    assert.equal(await functionalSourceManifestIsCurrent(db, manifest), true);
    await db.execute(sql`UPDATE "Payment" SET status='Cancelada' WHERE id='payment'`);
    assert.equal(await functionalSourceManifestIsCurrent(db, manifest), false);
  } finally { await fixture.close(); }
});

test("PostgreSQL course capacity is claimed atomically and the accepted registration is idempotent", async () => {
  const fixture = await createEmployeePortalFixture("career"), { connection } = fixture, db = connection.db;
  try {
    await db.insert(employees).values([{ id: "employeeA", name: "Servidor A", isActive: true }, { id: "employeeB", name: "Servidor B", isActive: true }]);
    await db.insert(accessProfiles).values({ id: "profile", codigo: "SERVIDOR", nome: "Servidor", permissoes: "{}" });
    await db.insert(users).values(["employeeA", "employeeB"].map(id => ({ id: `user-${id}`, nome: id, email: `${id}@example.test`, perfilId: "profile", employeeId: id })));
    const now = Date.now(), instant = (hours: number) => new Date(now + hours * 3600000).toISOString();
    await db.insert(hrPayrollRuleSets).values({ id: "set", configuracaoInstanciaId: "instance", code: "RULES", name: "Parâmetros", status: "ATIVA", effectiveFrom: new Date(instant(-48)) });
    await db.insert(hrPayrollRules).values({ id: "course", ruleSetId: "set", code: "PORTAL_CURSO_CAPACITY", name: "Curso", category: "PORTAL", valueType: "JSON", isActive: true, value: { origin: "CAPACITACAO_FUNCIONAL", budgetUnitId: "ug", employeeIds: [], enrollmentStartsAt: instant(-24), enrollmentEndsAt: instant(24), startsAt: instant(48), endsAt: instant(72), capacity: 1, hours: 4, minAttendancePercentage: 75, location: "Unidade", issuerName: "Prefeitura", instructions: "Orientações" } });
    const context = (id: string) => ({ database: db, user: employeePortalUser(id) });
    const outcomes = await Promise.allSettled([enrollOwnCourse(context("employeeA"), { courseId: "course" }, connection), enrollOwnCourse(context("employeeB"), { courseId: "course" }, connection)]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1, outcomes.map(outcome => outcome.status === "rejected" ? String(outcome.reason) : "registered").join(" · "));
    const rejected = outcomes.find(outcome => outcome.status === "rejected");
    assert.ok(rejected?.status === "rejected" && /vagas/.test(String(rejected.reason)));
    const requests = await db.select().from(employeePortalRequests);
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(await enrollOwnCourse(context(request.employeeId), { courseId: "course" }, connection), request.id);
    assert.equal(await portalCount(db, sql`SELECT count(*) FROM "AuditEvent"`), 1, "replay não pode duplicar a evidência da inscrição");
  } finally { await fixture.close(); }
});

test("raw PostgreSQL results preserve UTC dates, exact numerics and ISO strings inside JSON", async () => {
  const fixture = await createEmployeePortalFixture("manifest");
  try {
    const row = await portalRequired<{ civil: Date; instant: Date; zoned: Date; exact: string; memory: { at: string }; absent: null; jsonNull: null; sqlIsNull: boolean; jsonIsNull: boolean }>(fixture.connection.db, sql`SELECT '2026-02-03'::date AS civil,'2026-02-03 04:05:06.789'::timestamp AS instant,'2026-02-03 01:05:06.789-03'::timestamptz AS zoned,90071992547409.91::numeric(18,2) AS exact,'{"at":"2026-02-03T04:05:06.789Z"}'::jsonb AS memory,NULL::jsonb AS absent,'null'::jsonb AS "jsonNull",NULL::jsonb IS NULL AS "sqlIsNull",'null'::jsonb IS NULL AS "jsonIsNull"`);
    assert.equal(row.civil.toISOString(), "2026-02-03T00:00:00.000Z");
    assert.equal(row.instant.toISOString(), "2026-02-03T04:05:06.789Z");
    assert.equal(row.zoned.toISOString(), row.instant.toISOString());
    assert.equal(row.exact, "90071992547409.91");
    assert.equal(row.memory.at, "2026-02-03T04:05:06.789Z");
    assert.equal(row.absent, null); assert.equal(row.jsonNull, null);
    assert.equal(row.sqlIsNull, true); assert.equal(row.jsonIsNull, false);
  } finally { await fixture.close(); }
});
