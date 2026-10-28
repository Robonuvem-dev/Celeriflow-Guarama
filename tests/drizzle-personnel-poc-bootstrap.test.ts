import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import type { JsonValue } from "../src/db/json";
import { withDatabaseTransaction, type DatabaseExecutor } from "../src/db/transaction";

type OriginalGolden = {
  formatVersion: number; sourceSha256: string; code: string; reference: string;
  definitions: Array<{ code: string; name: string; type: string; method: string; formula: string | null; incidences: string[] }>;
  rules: Array<{ code: string; value: JsonValue }>;
};
const actor = "poc-bootstrap-actor", other = "poc-bootstrap-other";
const payrollTypes = ["Mensal", "Complementar", "Rescisão", "RRA", "Férias", "1ª parcela 13º", "13º", "Diferença 13º", "Adiantamento salarial"];
const tables = ["ConfiguracaoInstancia", "HrPayrollRuleSet", "HrCalculationPolicy", "HrSocialSecurityScheme", "HrSocialSecurityBand", "HrVacationPolicy", "HrEmploymentRegime", "HrPayrollRubric", "HrPayrollRubricIncidence", "PayrollEvent", "HrPayrollRule", "Role", "Person", "Employee", "Payroll", "HrEmploymentContract", "HrEmploymentRevision", "HrPortalRequest", "HrIntegrationEvent"];
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function object(value: JsonValue) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value;
}
function causeMessage(expected: string) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if (error.message.includes(expected)) return true;
      error = error.cause;
    }
    return false;
  };
}
async function fingerprint(database: DatabaseExecutor, selected = tables) {
  const rows: Array<{ table: string; hash: string }> = [];
  for (const table of selected) {
    const [row] = (await database.execute<{ hash: string }>(sql`SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${sql.identifier(table)} r`)).rows;
    rows.push({ table, hash: row.hash });
  }
  return rows;
}

// Central execution only: the original SQL is replayed independently of the
// mappings. Every service call receives this fixture's real Neon connection.
test("RH POC bootstrap: original 156 SQL files, native transactions and immutable historical receipts", { timeout: 240_000 }, async t => {
  const history = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory());
  assert.equal(history.length, 156);
  const goldenText = await readFile(new URL("./fixtures/personnel-poc-bootstrap-golden.json", import.meta.url), "utf8");
  const golden: OriginalGolden = JSON.parse(goldenText);
  assert.equal(sha(goldenText.replaceAll("\r\n", "\n")), "17fb46b3430c9037ebc3eb844c4bac83c0a904ddef63722b670fa73c993c840d");
  assert.equal(golden.formatVersion, 1);
  assert.equal(golden.sourceSha256, "7312fd277379643d95feb322d046d7fe35b7883547da50c8d2feb30257584ba0");
  const { createSpecializedDrizzleFixture } = await import("./helpers/specialized-drizzle-fixture");
  const fixture = await createSpecializedDrizzleFixture();
  try {
    await fixture.database.exec(await readFile(new URL("./fixtures/personnel-poc-bootstrap.sql", import.meta.url), "utf8"));
    const { connection } = fixture, db = connection.db;
    const { installDocumentaryPocParameters: install, prepareDocumentaryPocDataset: prepare, RH_POC_CODE, RH_POC_REFERENCE } = await import("../src/lib/rh/poc-bootstrap");
    const { findPocContract } = await import("../src/db/repositories/personnel-poc-bootstrap/records");
    assert.equal(RH_POC_CODE, golden.code); assert.equal(RH_POC_REFERENCE, golden.reference);
    const state: { installed?: Awaited<ReturnType<typeof install>>; dataset?: Awaited<ReturnType<typeof prepare>> } = {};
    const installed = () => { assert.ok(state.installed); return state.installed; };
    const dataset = () => { assert.ok(state.dataset); return state.dataset; };
    const count = async (table: string, where = sql`true`) => (await db.execute<{ n: number }>(sql`SELECT count(*)::integer AS n FROM ${sql.identifier(table)} WHERE ${where}`)).rows[0].n;

    await t.test("invalid civil competence and non-2026 references fail before installing or preparing anything", async () => {
      const before = await fingerprint(db);
      for (const competence of ["13/2026", "2026-10", "10/2025", "01/2027"]) await assert.rejects(prepare(connection, actor, competence));
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test("late audit failure rolls back the instance and the entire first installation", async () => {
      const before = await fingerprint(db);
      assert.equal(await count("ConfiguracaoInstancia"), 0);
      await assert.rejects(install(connection, "poc-bootstrap-fail-audit"), causeMessage("poc bootstrap fixture late audit failure"));
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test("first install creates the original package, all 18 JSON rules, exact rates, dates, defaults and 20 incidences", async () => {
      state.installed = await install(connection, actor);
      const result = installed();
      assert.equal(result.scope, "DEMONSTRACAO"); assert.equal(result.regimeId, result.regimeIds[0]); assert.equal(result.regimeIds.length, 3);
      const [instance] = (await db.execute<{ id: string; name: string; city: string; uf: string; status: string }>(sql`SELECT id,"nomePrefeitura" AS name,municipio AS city,uf,status FROM "ConfiguracaoInstancia"`)).rows;
      assert.deepEqual(instance, { id: "rh-poc-ibema-instance-v1", name: "Prefeitura Municipal de Aurora das Veredas", city: "Aurora das Veredas", uf: "MG", status: "Ativa" });
      const [set] = (await db.execute<{ code: string; name: string; status: string; demo: boolean; start: string; end: string; reference: string }>(sql`SELECT code,name,status,"isDemo" AS demo,"effectiveFrom"::text AS start,"effectiveUntil"::text AS end,"legalReference" AS reference FROM "HrPayrollRuleSet" WHERE id=${result.ruleSetId}`)).rows;
      assert.deepEqual(set, { code: golden.code, name: "Aurora das Veredas — parâmetros de pessoal e folha", status: "ATIVA", demo: true, start: "2020-01-01 00:00:00", end: "2030-12-31 23:59:59.999", reference: golden.reference });
      const regimes = (await db.execute<{ id: string; code: string; nature: string; category: string; hours: number }>(sql`SELECT id,code,"employmentNature" AS nature,"esocialCategory" AS category,"defaultMonthlyHours" AS hours FROM "HrEmploymentRegime" WHERE "ruleSetId"=${result.ruleSetId}`)).rows;
      assert.deepEqual(result.regimeIds.map(id => { const row = regimes.find(row => row.id === id); assert.ok(row); return [row.code, row.nature, row.category, row.hours]; }), [["EFETIVO_POC", "ESTATUTARIO", "301", 200], ["COMISSIONADO_POC", "COMISSIONADO", "302", 200], ["TEMPORARIO_POC", "TEMPORARIO", "306", 200]]);
      const [policy] = (await db.execute<{ currency: string; rounding: string; scale: number; negative: string; margin: string; freeze: boolean; reference: string }>(sql`SELECT currency,"roundingMode" AS rounding,"roundingScale" AS scale,"negativeNetPayPolicy" AS negative,"maxConsignmentMarginRate"::text AS margin,"freezeOnClose" AS freeze,"legalReference" AS reference FROM "HrCalculationPolicy" WHERE "ruleSetId"=${result.ruleSetId}`)).rows;
      assert.deepEqual(policy, { currency: "BRL", rounding: "HALF_UP", scale: 2, negative: "BLOQUEAR", margin: "35.000000", freeze: true, reference: golden.reference });
      const [scheme] = (await db.execute<{ id: string; code: string; regime: string; method: string; ceiling: string; employer: string }>(sql`SELECT id,code,regime,"employeeCalculationMethod" AS method,"ceilingValue"::text AS ceiling,"employerContributionRate"::text AS employer FROM "HrSocialSecurityScheme" WHERE "ruleSetId"=${result.ruleSetId}`)).rows;
      assert.deepEqual([scheme.code, scheme.regime, scheme.method, scheme.ceiling, scheme.employer], ["RGPS_POC", "RGPS", "PROGRESSIVA", "8475.55", "22.000000"]);
      const bands = (await db.execute<{ sequence: number; lower: string; upper: string | null; rate: string }>(sql`SELECT sequence,"lowerLimit"::text AS lower,"upperLimit"::text AS upper,"employeeRate"::text AS rate FROM "HrSocialSecurityBand" WHERE "socialSecuritySchemeId"=${scheme.id} ORDER BY sequence`)).rows;
      assert.deepEqual(bands.map(row => [row.sequence, row.lower, row.upper, row.rate]), [[1, "0.00", "1621.00", "7.500000"], [2, "1621.00", "2902.84", "9.000000"], [3, "2902.84", "4354.27", "12.000000"], [4, "4354.27", null, "14.000000"]]);
      const [vacation] = (await db.execute<{ acquisition: number; concession: number; days: number; splits: number; first: number; other: number; rate: string; abono: boolean; abonoDays: number; approval: boolean }>(sql`SELECT "acquisitionMonths" AS acquisition,"concessionMonths" AS concession,"entitlementDays" AS days,"maxSplits" AS splits,"minFirstSplitDays" AS first,"minOtherSplitDays" AS other,"additionalPayRate"::text AS rate,"allowsCashAbono" AS abono,"maxCashAbonoDays" AS "abonoDays","requiresApproval" AS approval FROM "HrVacationPolicy" WHERE "ruleSetId"=${result.ruleSetId}`)).rows;
      assert.deepEqual(vacation, { acquisition: 12, concession: 12, days: 30, splits: 3, first: 10, other: 10, rate: "33.333333", abono: true, abonoDays: 10, approval: true });
      const rubrics = (await db.execute<{ id: string; code: string; type: string; method: string; formula: string | null; priority: number }>(sql`SELECT id,code,type,"calculationMethod" AS method,"formulaExpression" AS formula,priority FROM "HrPayrollRubric" WHERE "ruleSetId"=${result.ruleSetId} ORDER BY priority`)).rows;
      assert.equal(rubrics.length, 16);
      for (const [index, expected] of golden.definitions.entries()) {
        const row = rubrics[index];
        assert.deepEqual([row.code, row.type, row.method, row.formula, row.priority], [expected.code, expected.type, expected.method, expected.formula, index + 10]);
        const incidences = (await db.execute<{ type: string; included: boolean }>(sql`SELECT "incidenceType" AS type,"isIncluded" AS included FROM "HrPayrollRubricIncidence" WHERE "rubricId"=${row.id} ORDER BY "incidenceType"`)).rows;
        assert.deepEqual(incidences, expected.incidences.map(type => ({ type, included: true })).sort((a, b) => a.type.localeCompare(b.type)));
      }
      const events = (await db.execute<{ id: string; code: string; type: string; formula: string | null; active: boolean }>(sql`SELECT id,code,type,formula,"isActive" AS active FROM "PayrollEvent" WHERE code LIKE 'POC_V1_%'`)).rows;
      assert.equal(events.length, 18);
      for (const event of events) { assert.equal(event.formula, null); assert.equal(event.active, true); assert.equal(event.type, event.code === "POC_V1_CONSIGNADO" || event.code === "POC_V1_POC_ABATIMENTO" || event.code === "POC_V1_PREVIDENCIA_RGPS_POC" || event.code === "POC_V1_IRRF" ? "Desconto" : "Vencimento"); }
      const rules = (await db.execute<{ code: string; value: JsonValue; type: string; sqlNull: boolean; category: string; valueType: string; reference: string; active: boolean }>(sql`SELECT code,value,jsonb_typeof(value) AS type,value IS NULL AS "sqlNull",category,"valueType","legalReference" AS reference,"isActive" AS active FROM "HrPayrollRule" WHERE "ruleSetId"=${result.ruleSetId}`)).rows;
      assert.equal(rules.length, 18);
      for (const expected of golden.rules) {
        const row = rules.find(row => row.code === expected.code); assert.ok(row, expected.code);
        const value = expected.code === "FOLHA_EVENTOS" ? Object.fromEntries(Object.entries(object(expected.value)).map(([code, eventCode]) => { const event = events.find(row => row.code === eventCode); assert.ok(event, String(eventCode)); return [code, event.id]; })) : expected.value;
        assert.deepEqual(row.value, value, expected.code);
        assert.equal(row.sqlNull, false); assert.notEqual(row.type, "null");
        assert.deepEqual([row.category, row.valueType, row.reference, row.active], ["CALCULO", "JSON", golden.reference, true]);
      }
      const [nulls] = (await db.execute<{ nested: boolean; scalar: string; attendance: string }>(sql`SELECT (SELECT value->'messages'->0->'endsAt'='null'::jsonb FROM "HrPayrollRule" WHERE "ruleSetId"=${result.ruleSetId} AND code='MENSAGENS_RECIBO') AS nested,(SELECT jsonb_typeof(value) FROM "HrPayrollRule" WHERE "ruleSetId"=${result.ruleSetId} AND code='IRRF_DEDUCAO_DEPENDENTE') AS scalar,(SELECT value->'attendanceStatuses'->>0 FROM "HrPayrollRule" WHERE "ruleSetId"=${result.ruleSetId} AND code='FALTAS_FERIAS_POC') AS attendance`)).rows;
      assert.deepEqual(nulls, { nested: true, scalar: "string", attendance: "Falta" });
    });

    await t.test("installation audit keeps the complete original payload, stable SHA-256 and actor-independent replay", async () => {
      const result = installed();
      const [event] = (await db.execute<{ payload: JsonValue; hash: string; domain: string; environment: string; type: string; status: string }>(sql`SELECT payload,"payloadHash" AS hash,domain,environment,"eventType" AS type,status FROM "HrIntegrationEvent" WHERE "sourceKey"=${`POC:PARAMETROS:${result.ruleSetId}`}`)).rows;
      assert.deepEqual(event.payload, { ruleSetId: result.ruleSetId, version: 1, reference: golden.reference, actorId: actor });
      assert.equal(event.hash, sha(JSON.stringify({ actorId: actor, reference: golden.reference, ruleSetId: result.ruleSetId, version: 1 })));
      assert.deepEqual([event.domain, event.environment, event.type, event.status], ["AUDITORIA", "DEMONSTRACAO", "PARAMETROS_POC_INSTALADOS", "AGUARDANDO_CONFIGURACAO"]);
      const before = await fingerprint(db);
      assert.deepEqual(await install(connection, other), result);
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test("the oldest instance wins; converted scope and isDemo are guarded before any parameter writes", async () => {
      await db.execute(sql`INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"createdAt","updatedAt") VALUES ('poc-bootstrap-oldest','Instância anterior','Município anterior','PR','1990-01-01','1990-01-01'),('poc-bootstrap-later','Instância posterior','Município posterior','PR','1991-01-01','1991-01-01')`);
      await db.execute(sql`INSERT INTO "HrPayrollRuleSet" (id,"configuracaoInstanciaId",code,name,status,scope,"isDemo","effectiveFrom","effectiveUntil","createdAt","updatedAt") VALUES ('poc-bootstrap-existing-set','poc-bootstrap-oldest',${golden.code},'Nome preservado do operador','ATIVA','HOMOLOGACAO',true,'2020-01-01','2030-12-31 23:59:59.999','2001-02-03 04:05:06.789','2002-03-04 05:06:07.891')`);
      for (const patch of [sql`scope='HOMOLOGACAO',"isDemo"=true`, sql`scope='DEMONSTRACAO',"isDemo"=false`]) {
        await db.execute(sql`UPDATE "HrPayrollRuleSet" SET ${patch} WHERE id='poc-bootstrap-existing-set'`);
        const before = await fingerprint(db);
        await assert.rejects(install(connection, actor), /Pacote POC existente foi convertido para outro escopo/);
        assert.deepEqual(await fingerprint(db), before);
      }
    });

    await t.test("empty-update installation selects existing unique rows and preserves their IDs and metadata", async () => {
      await db.execute(sql`UPDATE "HrPayrollRuleSet" SET scope='DEMONSTRACAO',"isDemo"=true WHERE id='poc-bootstrap-existing-set'`);
      const [before] = (await db.execute<{ value: JsonValue }>(sql`SELECT to_jsonb(r) AS value FROM "HrPayrollRuleSet" r WHERE id='poc-bootstrap-existing-set'`)).rows;
      state.installed = await install(connection, actor);
      assert.equal(installed().ruleSetId, "poc-bootstrap-existing-set");
      const [after] = (await db.execute<{ value: JsonValue }>(sql`SELECT to_jsonb(r) AS value FROM "HrPayrollRuleSet" r WHERE id='poc-bootstrap-existing-set'`)).rows;
      assert.deepEqual(after, before);
      assert.equal(await count("ConfiguracaoInstancia"), 3);
      assert.equal(await count("HrPayrollRuleSet"), 2);
    });

    await t.test("reinstallation preserves edited policies, exact numeric rates, rubrics, bands, incidences, events and nested JSON", async () => {
      const { ruleSetId } = installed();
      await db.execute(sql`UPDATE "HrCalculationPolicy" SET "maxConsignmentMarginRate"=12.345678,"roundingScale"=3,"updatedAt"='2099-10-20 12:34:56.789' WHERE "ruleSetId"=${ruleSetId}`);
      await db.execute(sql`UPDATE "HrSocialSecurityScheme" SET "ceilingValue"=90071992547409.93,"employerContributionRate"=13.123456,"updatedAt"='2099-10-20 12:34:56.789' WHERE "ruleSetId"=${ruleSetId}`);
      await db.execute(sql`UPDATE "HrSocialSecurityBand" SET "employeeRate"=8.765432,"updatedAt"='2099-10-20 12:34:56.789' WHERE "socialSecuritySchemeId" IN (SELECT id FROM "HrSocialSecurityScheme" WHERE "ruleSetId"=${ruleSetId}) AND sequence=1`);
      await db.execute(sql`UPDATE "HrVacationPolicy" SET "entitlementDays"=24,"additionalPayRate"=12.345678,"updatedAt"='2099-10-20 12:34:56.789' WHERE "ruleSetId"=${ruleSetId}`);
      await db.execute(sql`UPDATE "HrEmploymentRegime" SET name='Regime editado',"defaultMonthlyHours"=180,"updatedAt"='2099-10-20 12:34:56.789' WHERE "ruleSetId"=${ruleSetId} AND code='COMISSIONADO_POC'`);
      await db.execute(sql`UPDATE "HrPayrollRubric" SET name='Rubrica editada',priority=777,"updatedAt"='2099-10-20 12:34:56.789' WHERE "ruleSetId"=${ruleSetId} AND code='EXTRA'`);
      await db.execute(sql`UPDATE "HrPayrollRubricIncidence" SET "isIncluded"=false,"updatedAt"='2099-10-20 12:34:56.789' WHERE "rubricId" IN (SELECT id FROM "HrPayrollRubric" WHERE "ruleSetId"=${ruleSetId} AND code='EXTRA')`);
      await db.execute(sql`UPDATE "PayrollEvent" SET name='Evento editado',"isActive"=false,"updatedAt"='2099-10-20 12:34:56.789' WHERE code='POC_V1_EXTRA'`);
      await db.execute(sql`UPDATE "HrPayrollRule" SET value='{"operator":true,"amount":"90071992547409.93","optional":null,"date":"2026-10-20","list":["001",null]}'::jsonb,"isActive"=false,"updatedAt"='2099-10-20 12:34:56.789' WHERE "ruleSetId"=${ruleSetId} AND code='DIARIAS_POC'`);
      const before = await fingerprint(db);
      assert.deepEqual(await install(connection, other), installed());
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test("late ninth-payroll failure rolls back roles, people, employees and all payrolls in the dataset phase", async () => {
      const before = await fingerprint(db);
      await assert.rejects(prepare(connection, actor, "12/2026"), causeMessage("poc bootstrap fixture late dataset failure"));
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test("late third-revision failure rolls back all contracts/revisions/invites while retaining the original committed dataset phase", async () => {
      const committedTables = ["Role", "Person", "Employee", "Payroll"];
      const before = await fingerprint(db, tables.filter(table => !committedTables.includes(table)));
      await assert.rejects(prepare(connection, "poc-bootstrap-fail-contract", "10/2026"), causeMessage("poc bootstrap fixture late revision failure"));
      assert.deepEqual(await fingerprint(db, tables.filter(table => !committedTables.includes(table))), before);
      for (const table of ["Role", "Person", "Employee"]) assert.equal(await count(table, sql`id LIKE 'rh-poc-%'`), 3, table);
      assert.equal(await count("Payroll", sql`id LIKE 'rh-poc-payroll-v1-10-2026-%'`), 9);
      for (const table of ["HrEmploymentContract", "HrEmploymentRevision", "HrPortalRequest"]) assert.equal(await count(table), 0, table);
    });

    await t.test("three original holders, native Decimal/date contracts, full revision snapshots, invites and all nine payroll IDs stay ordered", async () => {
      state.dataset = await prepare(connection, actor, "10/2026");
      const result = dataset();
      assert.deepEqual({ ruleSetId: result.ruleSetId, regimeId: result.regimeId, regimeIds: result.regimeIds, scope: result.scope }, installed());
      assert.equal(result.competence, "10/2026"); assert.equal(result.contractIds.length, 3);
      assert.deepEqual(result.payrollIds, payrollTypes.map((_, index) => `rh-poc-payroll-v1-10-2026-${index}`));
      const payrolls = (await db.execute<{ id: string; type: string; status: string; competence: string }>(sql`SELECT id,type,status,competence FROM "Payroll" WHERE id LIKE 'rh-poc-payroll-v1-10-2026-%' ORDER BY id`)).rows;
      assert.deepEqual(payrolls.map(row => [row.type, row.status, row.competence]), payrollTypes.map(type => [type, "Aberta", "10/2026"]));
      const holders = (await db.execute<{ id: string; name: string; cpf: string; birth: string; nationality: string; employee: string; registration: string; role: string }>(sql`SELECT p.id,p."fullName" AS name,p.cpf,p."birthDate"::text AS birth,p.nationality,e.id AS employee,e.registration,e."roleId" AS role FROM "Person" p JOIN "Employee" e ON e."personId"=p.id WHERE p.id LIKE 'rh-poc-person-v1-%' ORDER BY p.id`)).rows;
      assert.deepEqual(holders, ["Ana Carolina Ribeiro", "Bruno Henrique Cardoso", "Carla Beatriz Almeida"].map((name, index) => ({ id: `rh-poc-person-v1-${index}`, name, cpf: ["99377100143", "99377100224", "99377100305"][index], birth: "1985-06-15 00:00:00", nationality: "Brasileira", employee: `rh-poc-employee-v1-${index}`, registration: `POC-${index + 1}`, role: `rh-poc-role-v1-${index}` })));
      for (const [index, id] of result.contractIds.entries()) {
        const contract = await withDatabaseTransaction(connection, tx => findPocContract(tx, `POC-V1-${index + 1}`, `rh-poc-employee-v1-${index}`));
        assert.ok(contract); assert.equal(contract.id, id);
        assert.ok(contract.salary instanceof Decimal); assert.ok(contract.createdAt instanceof Date); assert.ok(contract.updatedAt instanceof Date);
        assert.equal(contract.salary.toFixed(2), ["4400.00", "5000.00", "1621.00"][index]);
        assert.equal(contract.monthlyHours, [200, 100, 200][index]);
        assert.equal(contract.workLocation, ["Administração — POC", "Educação — POC", "Saúde — POC"][index]);
        assert.equal(contract.salaryLevel, ["H-01", "LP-01", "E-01"][index]);
        assert.equal(contract.regimeId, installed().regimeId); assert.equal(contract.status, "ATIVO"); assert.equal(contract.version, 1);
        for (const date of [contract.admittedAt, contract.appointedAt, contract.swornAt]) assert.equal(date?.toISOString(), "2020-01-01T00:00:00.000Z");
        assert.equal(contract.endsAt, null); assert.equal(contract.departmentId, null); assert.equal(contract.costCenterId, null);
        assert.deepEqual(contract.details, { pocPackage: golden.code, salarySource: "Valores fictícios dos casos T11–T13; faixas e cargos inspirados nos IDs 089/090", pocBankAccount: { bank: ["001", "104", "756"][index], agency: "0001", account: `90000${index + 1}-0`, accountType: "CORRENTE", estimated: true } });
        const revisions = (await db.execute<{ snapshot: JsonValue; actor: string; reason: string; version: number; start: string }>(sql`SELECT snapshot,"actorId" AS actor,reason,version,"effectiveFrom"::text AS start FROM "HrEmploymentRevision" WHERE "contractId"=${id}`)).rows;
        assert.equal(revisions.length, 1);
        assert.deepEqual(revisions[0], { snapshot: JSON.parse(JSON.stringify(contract)), actor, reason: golden.reference, version: 1, start: "2020-01-01 00:00:00" });
        const invites = (await db.execute<{ payload: JsonValue; actor: string; key: string; kind: string }>(sql`SELECT payload,"actorId" AS actor,"requestKey" AS key,kind FROM "HrPortalRequest" WHERE "employeeId"=${contract.employeeId}`)).rows;
        assert.deepEqual(invites, [{ payload: { personId: holders[index].id, contractId: id, email: null }, actor, key: `INVITE:${contract.employeeId}`, kind: "ACESSO_PORTAL" }]);
      }
    });

    await t.test("replay preserves operator-edited people, roles, employees, closed payrolls and truthy package snapshots without rewriting history", async () => {
      await db.execute(sql`UPDATE "Role" SET name='Cargo editado',"updatedAt"='2099-10-20 12:34:56.789' WHERE id='rh-poc-role-v1-0'`);
      await db.execute(sql`UPDATE "Person" SET "fullName"='Nome editado',"updatedAt"='2099-10-20 12:34:56.789' WHERE id='rh-poc-person-v1-0'`);
      await db.execute(sql`UPDATE "Employee" SET name='Servidor editado',"updatedAt"='2099-10-20 12:34:56.789' WHERE id='rh-poc-employee-v1-0'`);
      await db.execute(sql`UPDATE "Payroll" SET status='Fechada',"updatedAt"='2099-10-20 12:34:56.789' WHERE id='rh-poc-payroll-v1-10-2026-0'`);
      await db.execute(sql`UPDATE "HrEmploymentContract" SET salary=90071992547409.93,details=details||'{"pocPackage":"PACOTE_MANTIDO_PELO_OPERADOR","optional":null,"decimalText":"001.00","date":"not-a-date"}'::jsonb,"updatedAt"='2099-10-20 12:34:56.789' WHERE id=${dataset().contractIds[0]}`);
      const before = await fingerprint(db);
      assert.deepEqual(await prepare(connection, other, "10/2026"), dataset());
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test("CPF collision, employee identity, payroll identity and contract package/regime mismatches keep their guards and all data", async () => {
      const unchangedOnError = async (message: RegExp) => {
        const before = await fingerprint(db);
        await assert.rejects(prepare(connection, actor, "10/2026"), message);
        assert.deepEqual(await fingerprint(db), before);
      };
      await db.execute(sql`UPDATE "Person" SET cpf=NULL WHERE id='rh-poc-person-v1-2'`);
      await db.execute(sql`INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('poc-bootstrap-collision','Colisão sintética','99377100305',CURRENT_TIMESTAMP)`);
      await unchangedOnError(/CPF sintético coincide com cadastro existente/);
      await db.execute(sql`DELETE FROM "Person" WHERE id='poc-bootstrap-collision'`);
      await db.execute(sql`UPDATE "Person" SET cpf='99377100305' WHERE id='rh-poc-person-v1-2'`);
      await db.execute(sql`INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('poc-bootstrap-foreign-person','Outra identidade sintética',CURRENT_TIMESTAMP)`);
      await db.execute(sql`UPDATE "Employee" SET "personId"='poc-bootstrap-foreign-person' WHERE id='rh-poc-employee-v1-0'`);
      await unchangedOnError(/Identidade demonstrativa alterada/);
      await db.execute(sql`UPDATE "Employee" SET "personId"='rh-poc-person-v1-0' WHERE id='rh-poc-employee-v1-0'`);
      await db.execute(sql`UPDATE "Payroll" SET competence='11/2026' WHERE id='rh-poc-payroll-v1-10-2026-8'`);
      await unchangedOnError(/Folha POC existente teve sua identidade alterada/);
      await db.execute(sql`UPDATE "Payroll" SET competence='10/2026' WHERE id='rh-poc-payroll-v1-10-2026-8'`);
      const contractId = dataset().contractIds[0];
      const [previous] = (await db.execute<{ details: JsonValue }>(sql`SELECT details FROM "HrEmploymentContract" WHERE id=${contractId}`)).rows;
      await db.execute(sql`UPDATE "HrEmploymentContract" SET details='{}'::jsonb WHERE id=${contractId}`);
      await unchangedOnError(/Contrato POC existente exige conciliação de escopo\/regime/);
      await db.execute(sql`UPDATE "HrEmploymentContract" SET details=${JSON.stringify(previous.details)}::jsonb,"regimeId"=${installed().regimeIds[1]} WHERE id=${contractId}`);
      await unchangedOnError(/Contrato POC existente exige conciliação de escopo\/regime/);
      await db.execute(sql`UPDATE "HrEmploymentContract" SET "regimeId"=${installed().regimeId} WHERE id=${contractId}`);
    });
  } finally {
    await fixture.close();
  }
});
