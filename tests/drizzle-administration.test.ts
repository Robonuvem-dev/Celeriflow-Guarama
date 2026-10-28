import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { employees, institutions, secretariats } from "../src/db/schema/administration";
import { insertCalendarEvent, insertDepartment, insertEmployee, insertRole, insertSecretariat, insertUnit, persistInstitution, resolveEmployeePerson } from "../src/db/repositories/administration/creation";
import * as structure from "../src/db/repositories/administration/structure";
import { resolveSecretariatManager, validateEmployeeRelations } from "../src/db/repositories/administration/leadership";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { syntheticCpf } from "../src/lib/poc/fixture-catalog";
import { requireValidCpf } from "../src/lib/identifiers/brazilian-identifiers";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

test("Administração: cadastro canônico, hierarquia, responsáveis, calendário e auditoria atômica", {
  skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 120_000,
}, async t => {
  const url = process.env.DATABASE_URL;
  assert.ok(url);
  const connection = createDatabaseConnection(url);
  const fixture = createId();
  const rollback = new Error("expected administration rollback");
  let institutionId = "";
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      const secretariatId = await insertSecretariat(tx, { name: fixture, acronym: "FIX" });
      const departmentId = await insertDepartment(tx, { name: fixture, description: null, secretariatId });
      const unitId = await insertUnit(tx, { name: fixture, type: "Administrativa", secretariatId, address: null, managerName: null });
      const roleId = await insertRole(tx, { name: fixture, description: null, level: null, canSign: true });
      await assert.rejects(insertRole(tx, { name: fixture.toUpperCase(), description: null, level: null, canSign: false }), /Já existe/);
      assert.equal((await structure.findRoleDuplicate(tx, "other-role", fixture))?.id, roleId);
      assert.equal(await structure.findRoleDuplicate(tx, roleId, fixture), null);
      const personId = createId();
      // Pick a valid unused CPF without changing any existing person.
      let cpf = "";
      for (let index = 8_000_000; index < 8_000_100; index++) {
        const candidate = requireValidCpf(syntheticCpf(index));
        if (!(await tx.select({ id: people.id }).from(people).where(eq(people.cpf, candidate)).limit(1)).length) { cpf = candidate; break; }
      }
      assert.ok(cpf);
      await tx.insert(people).values({ id: personId, fullName: "Pessoa canônica de verificação", cpf, email: `${fixture}@example.invalid`, phonePrimary: "41999999999" });
      const canonical = await resolveEmployeePerson(tx, { personId });
      assert.deepEqual(canonical, { personId, name: "Pessoa canônica de verificação", cpf, email: `${fixture}@example.invalid`, phone: "41999999999" });
      assert.deepEqual(await resolveEmployeePerson(tx, { cpf }), canonical);
      await assert.rejects(resolveEmployeePerson(tx, { personId: "other-person", existingPersonId: personId }), /Não é permitido trocar/);
      const hierarchy = await validateEmployeeRelations(tx, { secretariatId, departmentId, unitId });
      const employeeId = await insertEmployee(tx, canonical, { registration: fixture, roleId, secretariatId: hierarchy.secretariatId, departmentId, unitId });

      await t.test("contagens incluem vínculos ativos e impedem mudança indevida de hierarquia", async () => {
        assert.equal(await structure.countSecretariatActiveChildren(tx, secretariatId), 3);
        assert.equal(await structure.countDepartmentEmployees(tx, departmentId, true), 1);
        assert.equal(await structure.countUnitEmployees(tx, unitId, true), 1);
        await structure.setEmployeeActive(tx, employeeId, false);
        assert.equal(await structure.countDepartmentEmployees(tx, departmentId, true), 0);
        assert.equal(await structure.countDepartmentEmployees(tx, departmentId), 1);
        await structure.setEmployeeActive(tx, employeeId, true);
      });

      await t.test("edição do servidor mantém nome do responsável e atualiza timestamps", async () => {
        const manager = await resolveSecretariatManager(tx, secretariatId, employeeId);
        await structure.updateSecretariat(tx, secretariatId, { name: fixture, acronym: "FIX", ...manager });
        assert.equal(await structure.countManagersByRole(tx, roleId), 1);
        await structure.updateEmployee(tx, employeeId, { name: "Nome atualizado", email: canonical.email!, cpf, roleId, secretariatId, departmentId });
        const [row] = await tx.select({ managerName: secretariats.managerName }).from(secretariats).where(eq(secretariats.id, secretariatId));
        assert.equal(row.managerName, "Nome atualizado");
        assert.equal((await tx.select().from(employees).where(eq(employees.id, employeeId)))[0].updatedAt instanceof Date, true);
      });

      await t.test("instituição mantém logo quando edição omite arquivo e calendário aceita edição/exclusão", async () => {
        const data = { name: fixture, cnpj: null, legalName: null, address: null, city: null, state: null, zipCode: null, phone: null, email: null, website: null, mayorName: null, managerName: null };
        institutionId = await persistInstitution(tx, null, { ...data, logoUrl: "data:image/png;base64,fixture" });
        await persistInstitution(tx, institutionId, { ...data, name: "Prefeitura atualizada" });
        assert.equal((await tx.select().from(institutions).where(eq(institutions.id, institutionId)))[0].logoUrl, "data:image/png;base64,fixture");
        const eventId = await insertCalendarEvent(tx, { title: fixture, description: "", date: new Date("2099-01-01T12:00:00Z"), type: "Outro", isHoliday: false });
        await structure.updateCalendarEvent(tx, eventId, { title: fixture, description: "Atualizado", date: new Date("2099-01-02T12:00:00Z"), type: "Outro", isHoliday: true });
        await structure.deleteCalendarEvent(tx, eventId);
        await assert.rejects(structure.deleteCalendarEvent(tx, eventId), /Registro não encontrado/);
      });

      await t.test("falha de auditoria reverte a mutação da mesma unidade transacional", async () => {
        await assert.rejects(tx.transaction(async nested => {
          await structure.updateRole(nested, roleId, { name: "Não deve persistir", description: null, level: null, canSign: false });
          await insertAuditEvent(nested, { actorUsuarioId: "missing-fixture-actor", eventType: auditEventTypes.administrativeMutation, targetType: "ROLE", targetId: roleId });
        }), error => getPostgresError(error)?.code === "23503");
        assert.equal((await structure.findRoleDuplicate(tx, "other-role", fixture))?.id, roleId);
      });
      throw rollback;
    }, { timeoutMs: 90_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, institutionId)), []);
    assert.deepEqual(await connection.db.select({ id: employees.id }).from(employees).where(eq(employees.registration, fixture)), []);
  } finally { await connection.pool.end(); }
});
