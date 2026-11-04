import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/db/transaction";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { SYSTEM_ADMIN_PROFILE_CODE } from "../src/lib/administration/c3-policy";
import { employees } from "../src/db/schema/administration";
import { hrEmploymentContracts, hrPayrollRuns, payrolls } from "../src/db/schema/personnel-workforce";
import { hrFunctionalRecords } from "../src/db/schema/personnel-functional-management";
import { Decimal } from "../src/db/decimal";
import { saveFunctionalRecord } from "../src/lib/rh/functional-record-service";
import { assertUnionRemittanceBalance, buildUnionContributionReport, validateUnionRemittance } from "../src/lib/rh/union-contribution";

const snapshot = { contract: { id: "contract", employeeId: "holder", registration: "001", departmentId: "dept", employee: { name: "Identidade preservada" } }, items: [{ code: "SINDICAL", type: "DESCONTO", value: "30.00" }] };
const data = { statementId: "statement", rubricCode: "SINDICAL", unionName: "Entidade sindical", unionCnpj: "00000000000191", pisPasep: "12345678901", occupation: "Função na competência", remittedAt: "2026-10-20", amount: "10.00", receiptReference: "Comprovante 1", source: "Certidão da fonte documental", legalReference: "NT 202/2009" };

test("recolhimento sindical concilia centavos com desconto fechado, sem usar provento/reserva", () => {
  assert.doesNotThrow(() => assertUnionRemittanceBalance(snapshot, "SINDICAL", "10.00", ["20.00"]));
  assert.throws(() => assertUnionRemittanceBalance(snapshot, "SINDICAL", "10.01", ["20.00"]), /superar/);
  assert.throws(() => assertUnionRemittanceBalance(snapshot, "OUTRA", "10.00", []), /superar/);
  assert.throws(() => assertUnionRemittanceBalance(snapshot, "SINDICAL", "0.001", []), /superar/);
});

test("NT 202: consulta SQL preserva identidade, remuneração mensal sem duplicação, cancelamento e escopos", async () => {
  const fixture = await createLocalDrizzleDatabase(), pg = fixture.database;
  try {
    for (const folder of ["../prisma/migrations-ibema/", "../db/migrations/"]) {
      const directory = new URL(folder, import.meta.url);
      const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
      for (const migration of entries) await pg.exec(await readFile(new URL(`${migration}/migration.sql`, directory), "utf8"));
    }
    const db: DatabaseExecutor = fixture.connection.db;
    await db.insert(employees).values({ id: "holder", name: "Nome atual" });
    await db.insert(hrEmploymentContracts).values({ id: "contract", employeeId: "holder", registration: "999", regimeId: "regime", roleId: "role", workLocation: "Sede", admittedAt: new Date("2020-01-01"), salary: new Decimal(1000), details: {} });
    for (const [id, type] of [["payroll", "Mensal"], ["complement", "Complementar"]]) {
      await db.insert(payrolls).values({ id, competence: "10/2026", type });
      await db.insert(hrPayrollRuns).values({ id: id === "payroll" ? "run" : "run2", payrollId: id, requestKey: id, ruleSetId: "rules", mode: "OFICIAL", scope: "DEMONSTRACAO", status: "FECHADA", actorId: "rh", snapshot: {}, gross: new Decimal(1000), deductions: new Decimal(30), net: new Decimal(970), employer: new Decimal(0) });
    }
    await db.execute(sql`INSERT INTO "HrPayrollStatement" (id,"runId","contractId",gross,deductions,net,employer,snapshot) VALUES ('statement','run','contract',1000,30,970,0,${JSON.stringify(snapshot)}::jsonb),('extra','run2','contract',200,0,200,0,${JSON.stringify({ ...snapshot, items: [] })}::jsonb)`);
    const context = { user: { id: "rh", profileCode: SYSTEM_ADMIN_PROFILE_CODE } } as AppContext;
    const input = { contractId: "contract", startsAt: data.remittedAt, endsAt: data.remittedAt, status: "ATIVO", data };
    await validateUnionRemittance(db, context, input);
    const saved = await saveFunctionalRecord(fixture.connection, context, { ...input, kind: 'RECOLHIMENTO_SINDICAL', key: 'certification', name: 'Recolhimento documental' });
    await assert.rejects(() => saveFunctionalRecord(fixture.connection, context, { ...input, kind: 'RECOLHIMENTO_SINDICAL', key: saved.key, name: saved.name, id: saved.id, version: saved.version, data: { ...data, occupation: 'Função alterada' } }), /comprovação original/);
    await saveFunctionalRecord(fixture.connection, context, { ...input, kind: 'RECOLHIMENTO_SINDICAL', key: saved.key, name: saved.name, id: saved.id, version: saved.version, status: 'CANCELADO' });
    for (const [id, amount, receipt] of [["receipt1", "10.00", "Comprovante 1"], ["receipt2", "20.00", "Comprovante 2"]]) {
      await db.insert(hrFunctionalRecords).values({ id, kind: "RECOLHIMENTO_SINDICAL", key: id, name: "Recolhimento", employeeId: "holder", contractId: "contract", startsAt: new Date("2026-10-20"), endsAt: new Date("2026-10-20"), data: { ...data, amount, receiptReference: receipt }, actorId: "rh" });
    }
    await assert.rejects(() => validateUnionRemittance(db, context, input), /já foi certificado/);
    await assert.rejects(() => validateUnionRemittance(db, context, { ...input, data: { ...data, amount: "0.01", receiptReference: "Excedente" } }), /superar/);
    await assert.rejects(() => validateUnionRemittance(db, context, { ...input, contractId: "other" }), /contrato/);
    const filter = { kind: "CONTRIBUICAO_SINDICAL_NT202", q: "", competence: "10/2026" };
    const report = await buildUnionContributionReport(db, filter);
    assert.equal(report.rows.length, 1);
    assert.deepEqual(report.rows[0].slice(3, 9), ["001", "Identidade preservada", data.pisPasep, data.occupation, "1200.00", "30.00"]);
    assert.equal((await buildUnionContributionReport(db, { ...filter, q: "Nome atual" })).rows.length, 0);
    assert.equal((await buildUnionContributionReport(db, filter, sql`false`)).rows.length, 0);
    assert.equal((await buildUnionContributionReport(db, { ...filter, authorizedDepartmentIds: ["other"] })).rows.length, 0);
    assert.equal((await buildUnionContributionReport(db, { ...filter, authorizedRubricCodes: ["IRRF"] })).rows.length, 0);
    await assert.rejects(() => buildUnionContributionReport(db, filter, sql`"Payroll".id='payroll'`), /mensal integral/);
    await pg.exec(`UPDATE "HrFunctionalRecord" SET status='CANCELADO' WHERE id='receipt2'`);
    assert.equal((await buildUnionContributionReport(db, filter)).rows[0][8], "10.00");
    assert.doesNotThrow(() => JSON.stringify(report));
  } finally { await fixture.close(); }
});
