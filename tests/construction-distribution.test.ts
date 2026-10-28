import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { departments, employees } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { companies, realEstates } from "../src/db/schema/registry";
import { processes, processEvents } from "../src/db/schema/processes";
import { constructionAnalystReplacements, constructionCases, constructionConfigVersions, constructionDistributionVersions } from "../src/db/schema/construction-core";
import { constructionStaffRoles } from "../src/db/schema/construction-portal";
import { assignConstructionCase } from "../src/lib/obras/construction-distribution";
import { replaceConstructionAnalyst } from "../src/lib/obras/construction-assignment";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { createConstructionSharedTables } from "./helpers/construction-shared-tables";

test("Drizzle: distribuição e substituição preservam menor demanda, vigência, replay, autoria e rollback do histórico", async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db, pg = fixture.database;
  const today = new Date("2026-10-10T00:00:00Z");
  const assign = (suffix: string) => withDatabaseTransaction(fixture.connection, tx => assignConstructionCase(tx, { caseId: `case-${suffix}`, processId: `process-${suffix}`, departmentId: "sector", today }));
  try {
    await createConstructionSharedTables(pg, [departments, employees, people, companies, realEstates, processes, processEvents]);
    for (const migration of ["20261010160000_construction_foundation", "20261010170000_construction_rules_profiles", "20261010180000_construction_project_reviews", "20261010190000_construction_analyst_replacement"]) await pg.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    await pg.exec(`INSERT INTO "Department" (id) VALUES ('sector'),('other');
      INSERT INTO "Employee" (id,"departmentId") VALUES ('analyst-a','sector'),('analyst-b','sector'),('manager','sector'),('expired','sector'),('foreign','other');`);
    const startsAt = new Date("2020-01-01T00:00:00Z");
    await db.insert(constructionStaffRoles).values([
      { employeeId: "analyst-a", departmentId: "sector", role: "ANALYST", startsAt },
      { employeeId: "analyst-a", departmentId: "sector", role: "ANALYST", startsAt: today },
      { employeeId: "analyst-b", departmentId: "sector", role: "ANALYST", startsAt, endsAt: today },
      { employeeId: "manager", departmentId: "sector", role: "MANAGER", startsAt },
      { employeeId: "expired", departmentId: "sector", role: "ANALYST", startsAt, endsAt: new Date("2021-01-01T00:00:00Z") },
      { employeeId: "foreign", departmentId: "sector", role: "ANALYST", startsAt },
    ]);
    await db.insert(constructionConfigVersions).values({ id: "config", version: 1, freeRevisions: 1, correctionDays: 30, checkPropertyDebts: false, subjectIds: [], areaWeights: {}, instructions: "Parâmetros sintéticos", publishedBy: "actor" });
    for (const suffix of ["a", "b", "c", "d", "e", "f"]) {
      await db.insert(processes).values({ id: `process-${suffix}`, protocolNumber: `TEST-${suffix}`, processTypeId: "type", subjectId: "subject", currentDepartmentId: "sector" });
      await db.insert(constructionCases).values({ id: `case-${suffix}`, requestKey: randomUUID(), processId: `process-${suffix}`, configurationId: "config", category: "BUILDING", locationType: "URBAN", catalogSnapshot: {}, existingArea: new Decimal(0), expandedArea: new Decimal(0), irregularArea: new Decimal(0), renovationArea: new Decimal(0), demolitionArea: new Decimal(0), totalArea: new Decimal(0), calculationSnapshot: {}, createdBy: "actor" });
    }
    assert.equal(await assign("a"), null, "ausência de regra mantém a distribuição setorial");
    await db.insert(constructionDistributionVersions).values({ departmentId: "sector", version: 1, strategy: "LOWEST_LOAD", publishedBy: "actor" });
    assert.equal(await assign("a"), "analyst-a");
    assert.equal(await assign("b"), "analyst-b");
    await pg.exec(`CREATE FUNCTION reject_distribution_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history rejected'; END $$;
      CREATE TRIGGER reject_distribution_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_distribution_history();`);
    await assert.rejects(assign("c"));
    assert.equal((await db.select({ assigned: constructionCases.assignedEmployeeId }).from(constructionCases).where(eq(constructionCases.id, "case-c")))[0].assigned, null);
    assert.equal((await db.select({ assigned: processes.currentResponsibleEmployeeId }).from(processes).where(eq(processes.id, "process-c")))[0].assigned, null);
    await pg.exec(`DROP TRIGGER reject_distribution_history ON "ProcessEvent"`);
    assert.equal(await assign("c"), "analyst-a", "empate de carga mantém a ordenação por ID");
    await db.insert(constructionDistributionVersions).values({ departmentId: "sector", version: 2, strategy: "USER", employeeId: "analyst-b", publishedBy: "actor" });
    assert.equal(await assign("d"), "analyst-b", "fim da vigência é inclusivo");
    await db.insert(constructionDistributionVersions).values({ departmentId: "sector", version: 3, strategy: "MANAGER", publishedBy: "actor" });
    assert.equal(await assign("e"), "manager");
    await db.insert(constructionDistributionVersions).values({ departmentId: "sector", version: 4, strategy: "SECTOR", publishedBy: "actor" });
    assert.equal(await assign("f"), null);
    await db.insert(constructionDistributionVersions).values({ departmentId: "sector", version: 5, strategy: "USER", employeeId: "expired", publishedBy: "actor" });
    await assert.rejects(assign("f"), /não possui profissional elegível/);
    assert.equal((await db.select({ total: count() }).from(processEvents))[0].total, 5);
    assert.equal((await db.select({ assigned: processes.currentResponsibleEmployeeId }).from(processes).where(eq(processes.id, "process-d")))[0].assigned, "analyst-b");
    const access = { administrator: false, employeeId: "manager", departmentId: "sector", roles: ["MANAGER"] };
    const replacement = { caseId: "case-f", requestKey: randomUUID(), expectedAnalystId: null, expectedAssignedId: null, employeeId: "analyst-a", reason: "Substituição por afastamento do analista inicial" };
    const replace = (input: unknown = replacement, actorId = "actor", scope = access) => withDatabaseTransaction(fixture.connection, tx => replaceConstructionAnalyst(tx, scope, actorId, input));
    await assert.rejects(replace(replacement, "actor", { ...access, roles: ["ANALYST"] }), /restrita ao gestor/);
    await assert.rejects(replace(replacement, "actor", { ...access, departmentId: "other" }), /indisponível/);
    await assert.rejects(replace({ ...replacement, employeeId: "missing" }), /vínculo vigente/);
    await assert.rejects(replace({ ...replacement, employeeId: "expired" }), /vínculo vigente/);
    await assert.rejects(replace({ ...replacement, employeeId: "foreign" }), /vínculo vigente/);
    await pg.exec(`CREATE TRIGGER reject_replacement_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_distribution_history()`);
    await assert.rejects(replace());
    assert.equal((await db.select({ total: count() }).from(constructionAnalystReplacements))[0].total, 0);
    assert.equal((await db.select({ assigned: constructionCases.assignedEmployeeId }).from(constructionCases).where(eq(constructionCases.id, "case-f")))[0].assigned, null);
    assert.equal((await db.select({ assigned: processes.currentResponsibleEmployeeId }).from(processes).where(eq(processes.id, "process-f")))[0].assigned, null);
    await pg.exec(`DROP TRIGGER reject_replacement_history ON "ProcessEvent"`);
    const replacementId = await replace();
    assert.equal(await replace(), replacementId);
    await assert.rejects(replace(replacement, "other-actor"), /Referência de substituição/);
    await assert.rejects(replace({ ...replacement, requestKey: randomUUID(), employeeId: "manager" }), /responsável mudou/);
    const [history] = await db.select().from(constructionAnalystReplacements).where(eq(constructionAnalystReplacements.id, replacementId));
    assert.ok(history.createdAt instanceof Date);
    assert.equal(history.previousAnalystId, null); assert.equal(history.previousAssignedId, null);
    assert.equal(history.replacementEmployeeId, "analyst-a");
    assert.equal((await db.select({ first: constructionCases.firstAnalystId }).from(constructionCases).where(eq(constructionCases.id, "case-f")))[0].first, "analyst-a");
    await assert.rejects(pg.query(`DELETE FROM "ConstructionAnalystReplacement" WHERE id=$1`, [replacementId]), /immutable/);
    assert.equal((await db.select({ total: count() }).from(processEvents))[0].total, 6);
  } finally { await fixture.close(); }
});
