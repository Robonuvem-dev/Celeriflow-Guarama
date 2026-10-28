import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { healthAdministrationPageData, healthAdministrationReferences } from "../src/db/repositories/health-pages/administration";
import { healthPageUnits, healthReportPageOptions, healthIntegrationPageData, healthSusImportPageRows, healthLaboratoryConfigurationPage } from "../src/db/repositories/health-pages/catalogs";
import { pageEsusBatches, pageLaboratoryConfigurations } from "../src/db/schema/health-pages";
import { withDatabaseTransaction } from "../src/db/transaction";
import { createHealthPagesDatabase } from "./helpers/health-pages-database";

test("Health page projections match the versioned installed public metadata", () => {
  const snapshot = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as {
    sourceSha256: string; catalogSha256: string; catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] };
  };
  assert.equal(snapshot.sourceSha256, "bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d");
  assert.equal(snapshot.catalogSha256, "1b6ca54c94a3aa6638ad61324483b32773ceb45efbd90020a49e6dce9b5497cb");
  assert.equal(createHash("sha256").update(JSON.stringify(snapshot.catalog)).digest("hex"), snapshot.catalogSha256);
  for (const table of [pageEsusBatches, pageLaboratoryConfigurations]) {
    const config = getTableConfig(table);
    for (const column of config.columns) {
      const original = snapshot.catalog.columns.find(row => row.schema === "public" && row.table_name === config.name && row.name === column.name);
      assert.ok(original, `${config.name}.${column.name}`);
      assert.equal(column.notNull, original.not_null);
      assert.equal(column.getSQLType().replaceAll(" ", ""), original.type.replace(" without time zone", "").replaceAll(" ", ""));
    }
  }
});

test("Health pages: historical SQL, independent oracles and real Neon/Drizzle readers", async suite => {
  const fixture = await createHealthPagesDatabase(), db = fixture.connection.db;
  const input = { situation: "" as const, query: "", requestedPage: 1, usageFrom: "2026-10-01", usageUntil: "2026-10-01" };
  try {
    await suite.test("references retain third-party eligibility and employee/person requirements", async () => {
      const rows = await healthAdministrationReferences(db);
      assert.deepEqual(rows.unitOptions.map(row => row.id), ["hpg-a", "hpg-b", "hpg-third-linked"]);
      assert.deepEqual(rows.employeeOptions.map(row => row.id), ["hpg-employee"]);
      const profiles = await db.execute<{ id: string }>(sql`SELECT id FROM "ConfiguracaoPerfil" WHERE ativo AND codigo<>'SYSTEM_ADMINISTRATOR' ORDER BY nome`);
      assert.deepEqual(rows.profiles.map(row => row.id), profiles.rows.map(row => row.id));
      assert.ok(rows.profiles.some(row => row.id === "hpg-role"));
    });
    await suite.test("units retain inactive children, UTC history, count and PostgreSQL wildcard search", async () => {
      const page = await healthAdministrationPageData(db, { ...input, tab: "unidades", requestedPage: 999 });
      const oracle = await db.execute<{ id: string }>(sql`SELECT id FROM "HealthUnit" ORDER BY name,id LIMIT 20`);
      assert.deepEqual(page.unitRows.map(row => row.id), oracle.rows.map(row => row.id));
      assert.equal(page.total, 5); assert.equal(page.page, 1);
      const unit = page.unitRows.find(row => row.id === "hpg-a")!;
      assert.deepEqual(unit.shifts.map(row => [row.id, row.isActive]), [["hpg-shift1", true], ["hpg-shift2", false]]);
      assert.deepEqual(unit.statusHistory.map(row => row.occurredAt), ["2026-10-02T12:34:56.789Z", "2026-10-01T00:00:00.123Z"]);
      assert.equal(unit.services[0].service.id, "hpg-service");
      const inactive = await healthAdministrationPageData(db, { ...input, tab: "unidades", situation: "inativo" });
      assert.deepEqual(inactive.unitRows.map(row => row.id), ["hpg-inactive"]);
      const wildcard = await healthAdministrationPageData(db, { ...input, tab: "unidades", query: "Cl_nica" });
      assert.deepEqual(wildcard.unitRows.map(row => row.id), ["hpg-a", "hpg-b"]);
    });
    await suite.test("professionals retain nullable person, addresses, documents and inactive assignments", async () => {
      const page = await healthAdministrationPageData(db, { ...input, tab: "profissionais" });
      const professional = page.professionalRows.find(row => row.id === "hpg-professional")!;
      assert.equal(professional.employee.person?.addresses[0].neighborhood?.city, "Cidade nominal");
      assert.equal(professional.employee.person?.documents[0].id, "hpg-document");
      assert.equal(professional.assignments[0].weeklyHours, 37);
      assert.equal(professional.statusHistory[0].occurredAt, "2026-09-30T03:04:05.678Z");
      const noPerson = page.professionalRows.find(row => row.id === "hpg-no-person-professional")!;
      assert.equal(noPerson.employee.person, null);
      assert.equal(noPerson.assignments[0].isActive, false);
    });
    await suite.test("every catalog tab returns its original relational projection", async () => {
      const specialty = await healthAdministrationPageData(db, { ...input, tab: "especialidades", query: "HPG01" });
      assert.deepEqual(specialty.specialtyRows.map(row => row.id), ["hpg-specialty"]);
      const services = await healthAdministrationPageData(db, { ...input, tab: "servicos", query: "classificação" });
      assert.equal(services.serviceRows[0].id, "hpg-service");
      const cbos = await healthAdministrationPageData(db, { ...input, tab: "cbo", query: "ocupação" });
      assert.equal(cbos.cboRows[0].id, "hpg-cbo");
      const groups = await healthAdministrationPageData(db, { ...input, tab: "grupos" });
      assert.equal(groups.groupRows[0].schedulingGroupCount, 1);
      assert.equal(groups.groupRows[0].specialties[0].specialty.id, "hpg-specialty");
      assert.equal(groups.groupRows[0].services[0].service.id, "hpg-service");
      const schedules = await healthAdministrationPageData(db, { ...input, tab: "agendamentos" });
      assert.equal(schedules.schedulingGroupRows[0].unit.id, "hpg-a");
      const holidays = await healthAdministrationPageData(db, { ...input, tab: "feriados", situation: "inativo" });
      assert.deepEqual(holidays.holidayRows.map(row => [row.id, row.date]), [["hpg-holiday", "2026-10-03T12:34:56.789Z"]]);
    });
    await suite.test("people and companies retain nulls, ownership, counts and case-sensitive identifier search", async () => {
      const people = await healthAdministrationPageData(db, { ...input, tab: "pessoas" });
      const ana = people.personRows.find(row => row.id === "hpg-person")!;
      assert.equal(ana.birthDate, "1990-01-02T03:04:05.678Z");
      assert.equal(ana.documentCount, 1); assert.equal(ana.isPatient, true); assert.equal(ana.usuario?.id, "hpg-user");
      assert.equal(people.personRows.find(row => row.id === "hpg-null-person")?.birthDate, null);
      const company = await healthAdministrationPageData(db, { ...input, tab: "empresas", query: "hpg-company" });
      assert.equal(company.companyRows[0].id, "hpg-company");
      const wrongCase = await healthAdministrationPageData(db, { ...input, tab: "empresas", query: "HPG-COMPANY" });
      assert.equal(wrongCase.total, 0);
    });
    await suite.test("access excludes both admin identities and retains scopes, case-sensitive audit pattern and bounds", async () => {
      const page = await healthAdministrationPageData(db, { ...input, tab: "acessos" });
      assert.deepEqual(page.accessRows.map(row => row.id), ["hpg-user", "hpg-inactive-user"]);
      const ana = page.accessRows[0];
      assert.equal(ana.canView, true); assert.equal(ana.canEdit, false); assert.equal(ana.personName, "Ana Clínica");
      assert.deepEqual(ana.scopes, [{ unitId: "hpg-a", unitName: "A Clínica", validFrom: "2026-01-01", validUntil: null, weekdays: "1,2,3,4,5", startTime: "08:00", endTime: "17:00", isActive: false }]);
      const oracle = await db.execute<{ date: string; count: number }>(sql`SELECT to_char("createdAt",'YYYY-MM-DD') AS date,count(*)::integer AS count FROM "AuditEvent" WHERE "targetType" LIKE 'HEALTH_%' AND "createdAt">=timestamp '2026-10-01 00:00:00' AND "createdAt"<=timestamp '2026-10-01 23:59:59.999' GROUP BY 1 ORDER BY 1`);
      assert.deepEqual(page.usageRows, oracle.rows); assert.deepEqual(page.usageRows, [{ date: "2026-10-01", count: 2 }]);
    });
    await suite.test("report scope distinguishes global/deny-all and honors active alternate assignments", async () => {
      assert.equal((await healthPageUnits(db, undefined)).length, 4);
      assert.deepEqual(await healthPageUnits(db, []), []);
      const scoped = await healthReportPageOptions(db, ["hpg-a"]);
      assert.deepEqual(scoped.units.map(row => row.id), ["hpg-a"]);
      assert.deepEqual(scoped.specialties.map(row => row.id), ["hpg-specialty"]);
      assert.deepEqual(scoped.professionals.map(row => row.id), ["hpg-professional"]);
      const denied = await healthReportPageOptions(db, []);
      assert.deepEqual([denied.units, denied.specialties, denied.professionals, denied.teams], [[], [], [], []]);
      assert.deepEqual(scoped.financingRows, [{ financing: "MAC" }]);
      assert.deepEqual(scoped.municipalities, [{ city: "Cidade nominal", state: "PR" }]);
    });
    await suite.test("typed laboratory/import/integration timestamps, per-parent limits and issue order", async () => {
      const laboratory = await healthLaboratoryConfigurationPage(db, "hpg-a", 999);
      assert.equal(laboratory.total, 2); assert.equal(laboratory.page, 1);
      assert.deepEqual(laboratory.configurations.map(row => row.id), ["hpg-lab-active", "hpg-lab-off"]);
      assert.equal(laboratory.configurations[0].createdAt.toISOString(), "2026-01-31T12:34:56.789Z");
      assert.equal(laboratory.configurations[0].effectiveUntil, null);
      assert.equal(Object.hasOwn(laboratory.configurations[0], "createdByUsuarioId"), false);
      const imports = await healthSusImportPageRows(db);
      assert.equal(imports[0].startedAt.toISOString(), "2026-01-31T12:34:56.789Z"); assert.equal(imports[0].completedAt, null);
      assert.deepEqual(imports.map(row => row.id), ["hpg-import", "hpg-import-older"]);
      assert.equal(imports[0].issues.length, 100);
      assert.deepEqual(imports[0].issues.slice(0, 2).map(row => row.id), ["hpg-issue-a", "hpg-issue-b"]);
      assert.equal(imports[0].issues.at(-1)?.rowNumber, 100);
      assert.deepEqual(imports[1].issues.map(row => row.id), ["hpg-older-issue-a", "hpg-older-issue-b"]);
      const integrations = await healthIntegrationPageData(db, ["MS_RENAME", "MS_CNES"]);
      assert.deepEqual(integrations.connections.map(row => row.code), ["MS_CNES", "MS_RENAME"]);
      assert.deepEqual(integrations.connections[0].runs.map(row => row.operation), ["Segunda operação 7", "Segunda operação 6", "Segunda operação 5", "Segunda operação 4", "Segunda operação 3"]);
      assert.deepEqual(integrations.connections[1].runs.map(row => row.operation), ["Operação 7", "Operação 6", "Operação 5", "Operação 4", "Operação 3"]);
      assert.ok(integrations.connections[0].runs[0].createdAt instanceof Date);
      assert.equal(integrations.files[0].createdAt.toISOString(), "2026-01-31T12:34:56.789Z");
      assert.equal(integrations.batches[0].createdAt.toISOString(), "2026-01-31T12:34:56.789Z");
    });
    await suite.test("count, page clamping and offset use the same filter over multiple pages", async () => {
      await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => {
        await tx.execute(sql`INSERT INTO "HealthUnit" (id,name,type,"isActive","updatedAt") SELECT 'hpg-page-'||n,'Paginação '||lpad(n::text,2,'0'),'UBS',false,now() FROM generate_series(1,23) n`);
        const page = await healthAdministrationPageData(tx, { ...input, tab: "unidades", situation: "inativo", query: "Paginação", requestedPage: 999 });
        const oracle = await tx.execute<{ id: string }>(sql`SELECT id FROM "HealthUnit" WHERE NOT "isActive" AND name ILIKE '%Paginação%' ORDER BY name,id LIMIT 20 OFFSET 20`);
        assert.equal(page.total, 23); assert.equal(page.page, 2); assert.equal(page.unitRows.length, 3);
        assert.deepEqual(page.unitRows.map(row => row.id), oracle.rows.map(row => row.id));
        await tx.execute(sql`INSERT INTO "HealthLaboratoryConfiguration" (id,"unitId","laboratoryName","collectionStartTime","collectionEndTime","resultReleaseDays","effectiveFrom","createdByUsuarioId","createdAt") SELECT 'hpg-lab-page-'||n,'hpg-b','Laboratório nominal '||n,'08:00','12:00',2,'2026-01-01','hpg-user',timestamp '2026-03-01'+n*interval '1 day' FROM generate_series(1,23) n`);
        const laboratory = await healthLaboratoryConfigurationPage(tx, "hpg-b", 999);
        const laboratoryOracle = await tx.execute<{ id: string }>(sql`SELECT id FROM "HealthLaboratoryConfiguration" WHERE "unitId"='hpg-b' ORDER BY "isActive" DESC,"createdAt" DESC LIMIT 20 OFFSET 20`);
        assert.equal(laboratory.total, 23); assert.equal(laboratory.page, 2); assert.equal(laboratory.configurations.length, 3);
        assert.deepEqual(laboratory.configurations.map(row => row.id), laboratoryOracle.rows.map(row => row.id));
        throw new Error("hpg-pagination-rollback");
      }), /hpg-pagination-rollback/);
    });
    await suite.test("readers use the caller's real repeatable-read transaction and preserve rollback", async () => {
      await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => {
        await tx.execute(sql`UPDATE "HealthUnit" SET name='Alteração apenas nesta transação' WHERE id='hpg-a'`);
        const page = await healthAdministrationPageData(tx, { ...input, tab: "unidades", query: "Alteração apenas" });
        assert.equal(page.total, 1); assert.equal(page.unitRows[0].id, "hpg-a");
        assert.equal((await healthPageUnits(tx, ["hpg-a"]))[0].name, "Alteração apenas nesta transação");
        throw new Error("hpg-rollback");
      }, { isolationLevel: "repeatable read" }), /hpg-rollback/);
      assert.equal((await healthPageUnits(db, ["hpg-a"]))[0].name, "A Clínica");
    });
  } finally { await fixture.close(); }
});
