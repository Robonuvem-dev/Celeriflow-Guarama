import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { pgTable, text, jsonb } from "drizzle-orm/pg-core";
import { createDatabaseConnection } from "../src/db/connection";
import { Decimal, exactNumeric } from "../src/db/decimal";
import { getPostgresError, PersistenceError } from "../src/db/errors";
import { DbNull, JsonNull, type JsonValue } from "../src/db/json";
import { createId } from "../src/db/ids";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accessProfiles, users, modules, userModulePermissions, userBudgetUnits } from "../src/db/schema/identity";
import { healthUserAccessScopes } from "../src/db/schema/health-access";
import { auditEvents } from "../src/db/schema/audit";
import { departments, employees, roles, secretariats } from "../src/db/schema/administration";
import { findIdentityByFirebaseUid, findModuleActivation } from "../src/db/repositories/platform/identity";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { loadAdministrationBiSource } from "../src/db/repositories/administration/bi";
import { assertManagerEmployeeChange, resolveSecretariatManager, validateEmployeeRelations } from "../src/db/repositories/administration/leadership";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { resolveIdentityUser } from "../src/lib/platform/identity-service";
import { AccessError } from "../src/lib/platform/access-error";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

test("Neon real: identidade, atomicidade, constraints, decimal/JSON e BI sem persistir fixtures", {
  skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1",
  timeout: 180_000,
}, async t => {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "Configure DATABASE_URL.");
  const connection = createDatabaseConnection(connectionString);
  const profileId = createId();
  const userId = createId();
  const roleId = createId();
  const secretariatId = createId();
  const departmentId = createId();
  const employeeId = createId();
  const firebaseUid = `drizzle-verification-${userId}`;
  const rollback = new Error("expected fixture rollback");
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      await tx.insert(accessProfiles).values({ id: profileId, codigo: profileId, nome: "Fixture migração", permissoes: "{}" });
      await tx.insert(roles).values({ id: roleId, name: "Cargo de verificação" });
      await tx.insert(secretariats).values({ id: secretariatId, name: "Secretaria de verificação" });
      await tx.insert(departments).values({ id: departmentId, name: "Departamento de verificação", secretariatId });
      await tx.insert(employees).values({ id: employeeId, name: "Servidor de verificação", roleId, secretariatId, departmentId });
      await tx.insert(users).values({ id: userId, nome: "Verificação", email: `${userId}@example.invalid`, firebaseUid, perfilId: profileId, employeeId });

      await t.test("DTO de identidade mantém vínculo funcional, perfil, nulos e permissões", async () => {
        const identity = await findIdentityByFirebaseUid(tx, firebaseUid);
        assert.ok(identity);
        assert.equal(identity.id, userId);
        assert.equal(identity.perfil.codigo, profileId);
        assert.deepEqual(identity.employee, { id: employeeId, secretariatId, departmentId });
        assert.deepEqual(identity.modulePermissions, []);
        assert.deepEqual(identity.healthAccessScopes, []);
        assert.deepEqual(identity.allowedBudgetUnitIds, []);
        assert.equal(await findIdentityByFirebaseUid(tx, `missing-${userId}`), null);
        const code = `VERIFY_${profileId}`;
        await tx.insert(modules).values({ nome: "Fixture", codigo: code, ativo: false });
        assert.deepEqual(await findModuleActivation(tx, code), { ativo: false });
        assert.equal(await findModuleActivation(tx, `MISSING_${code}`), null);
      });

      await t.test("auditoria grava somente identificadores e participa da mesma transação", async () => {
        await insertAuditEvent(tx, { actorUsuarioId: userId, eventType: auditEventTypes.administrativeMutation, targetType: "MIGRATION_VERIFICATION", targetId: userId });
        const [event] = await tx.select().from(auditEvents).where(eq(auditEvents.actorUsuarioId, userId));
        assert.equal(event.eventType, "ADMINISTRATIVE_MUTATION");
        assert.equal(event.targetId, userId);
        assert.equal(event.createdAt instanceof Date, true);
        assert.equal(Object.keys(event).length, 6);
      });

      await t.test("autorização preserva usuário/perfil ativos, permissões e escopos UG/Saúde", async () => {
        const principal = { firebaseUid, email: `${userId}@example.invalid`, name: "Verificação", authTime: 0 };
        await assert.rejects(resolveIdentityUser(tx, null), error => error instanceof AccessError && error.status === 401);
        await tx.update(accessProfiles).set({ ativo: false }).where(eq(accessProfiles.id, profileId));
        await assert.rejects(resolveIdentityUser(tx, principal), error => error instanceof AccessError && error.status === 403);
        await tx.update(accessProfiles).set({ ativo: true }).where(eq(accessProfiles.id, profileId));
        await tx.update(users).set({ ativo: false }).where(eq(users.id, userId));
        await assert.rejects(resolveIdentityUser(tx, principal), error => error instanceof AccessError && error.status === 403);
        await tx.update(users).set({ ativo: true }).where(eq(users.id, userId));
        const [module] = await tx.select({ id: modules.id }).from(modules).where(eq(modules.codigo, `VERIFY_${profileId}`));
        await tx.insert(userModulePermissions).values({ usuarioId: userId, moduloId: module.id, canView: true, canEdit: false });
        const budget = await tx.execute<{ id: string }>(sql`SELECT id FROM "BudgetUnit" ORDER BY id LIMIT 1`);
        const health = await tx.execute<{ id: string }>(sql`SELECT id FROM "HealthUnit" ORDER BY id LIMIT 1`);
        assert.ok(budget.rows[0]);
        assert.ok(health.rows[0]);
        await tx.insert(userBudgetUnits).values({ usuarioId: userId, budgetUnitId: budget.rows[0].id });
        await tx.insert(healthUserAccessScopes).values({ usuarioId: userId, unitId: health.rows[0].id, weekdays: "0,1,2,3,4,5,6", startTime: "00:00", endTime: "23:59" });
        const user = await resolveIdentityUser(tx, principal);
        assert.deepEqual(user.allowedBudgetUnitIds, [budget.rows[0].id]);
        assert.deepEqual(user.allowedHealthUnitIds, [health.rows[0].id]);
        assert.equal(user.hasHealthAccessScope, true);
        assert.deepEqual(user.modulePermissions, [{ code: `VERIFY_${profileId}`.toUpperCase(), canView: true, canEdit: false }]);
      });

      await t.test("savepoint reverte gravação parcial e classifica unicidade e FK reais", async () => {
        await assert.rejects(tx.transaction(async nested => {
          await nested.insert(roles).values({ id: `${roleId}-partial`, name: "Será revertido" });
          await nested.insert(users).values({ nome: "Duplicado", email: `${userId}@example.invalid`, perfilId: profileId });
        }), error => getPostgresError(error)?.code === "23505");
        assert.deepEqual(await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, `${roleId}-partial`)), []);
        await assert.rejects(tx.transaction(async nested => {
          await nested.insert(users).values({ nome: "FK inválida", email: `${createId()}@example.invalid`, perfilId: "nonexistent-migration-profile" });
        }), error => getPostgresError(error)?.code === "23503");
      });

      await t.test("updatedAt atualiza linha e lote sem alterar createdAt", async () => {
        const [before] = await tx.select().from(roles).where(eq(roles.id, roleId));
        await new Promise(resolve => setTimeout(resolve, 5));
        const [after] = await tx.update(roles).set({ description: "Atualizado" }).where(eq(roles.id, roleId)).returning();
        assert.ok(after.updatedAt > before.updatedAt);
        assert.equal(after.createdAt.toISOString(), before.createdAt.toISOString());
      });

      await t.test("numeric exato e JSON null são distintos de SQL NULL", async () => {
        await tx.execute(sql`CREATE TEMPORARY TABLE drizzle_migration_values (id text PRIMARY KEY, amount numeric(24,8) NOT NULL, value jsonb) ON COMMIT DROP`);
        const values = pgTable("drizzle_migration_values", { id: text("id").primaryKey(), amount: exactNumeric("amount", { precision: 24, scale: 8 }).notNull(), value: jsonb("value").$type<JsonValue>() });
        await tx.insert(values).values([
          { id: "sql-null", amount: new Decimal("1234567890123456.12345678"), value: DbNull },
          { id: "json-null", amount: new Decimal("0.10000001"), value: JsonNull },
        ]);
        const records = await tx.select().from(values);
        assert.equal(records.find(record => record.id === "sql-null")?.amount.toFixed(8), "1234567890123456.12345678");
        const nulls = await tx.execute<{ id: string; isSqlNull: boolean; kind: string | null }>(sql`SELECT id, value IS NULL AS "isSqlNull", jsonb_typeof(value) AS kind FROM drizzle_migration_values ORDER BY id`);
        assert.deepEqual(nulls.rows, [{ id: "json-null", isSqlNull: false, kind: "null" }, { id: "sql-null", isSqlNull: true, kind: null }]);
      });

      await t.test("BI por secretaria preserva contagens sem multiplicar vínculos nos joins", async () => {
        await tx.update(secretariats).set({ managerId: employeeId }).where(eq(secretariats.id, secretariatId));
        const source = await loadAdministrationBiSource(tx, secretariatId);
        const row = source.secretariats.find(row => row.id === secretariatId);
        assert.ok(row);
        assert.equal(row.manager?.name, "Servidor de verificação");
        assert.equal(row.manager?.role?.name, "Cargo de verificação");
        assert.deepEqual(row._count, { employees: 1, departments: 1, units: 0 });
        assert.deepEqual(source.departments, [{ id: departmentId, name: "Departamento de verificação", _count: { employees: 1 } }]);
        assert.deepEqual(source.roles, [{ name: "Cargo de verificação", employees: 1 }]);
      });
      await t.test("responsável exige cargo e lotação válidos e impede inativação e transferência", async () => {
        assert.deepEqual(await resolveSecretariatManager(tx, secretariatId, employeeId), { managerId: employeeId, managerName: "Servidor de verificação" });
        await assert.rejects(resolveSecretariatManager(tx, "other-secretariat", employeeId), /lotado nesta secretaria/);
        await assert.rejects(assertManagerEmployeeChange(tx, employeeId, { isActive: false }), /Substitua/);
        await assert.rejects(assertManagerEmployeeChange(tx, employeeId, { secretariatId: null }), /lotação/);
        await assert.rejects(assertManagerEmployeeChange(tx, employeeId, { roleId: null }), /cargo ativo/);
        assert.deepEqual(await validateEmployeeRelations(tx, { secretariatId: null, departmentId }), { secretariatId });
        await assert.rejects(validateEmployeeRelations(tx, { secretariatId: null, departmentId: "missing-department" }), /Departamento não encontrado/);
        const unassignedId = createId();
        await tx.insert(employees).values({ id: unassignedId, name: "Servidor sem lotação", roleId });
        await resolveSecretariatManager(tx, secretariatId, unassignedId);
        const [assigned] = await tx.select({ secretariatId: employees.secretariatId }).from(employees).where(eq(employees.id, unassignedId));
        assert.equal(assigned.secretariatId, secretariatId);
        await tx.update(employees).set({ isActive: false }).where(eq(employees.id, unassignedId));
        await assert.rejects(resolveSecretariatManager(tx, secretariatId, unassignedId), /servidor ativo/);
      });
      throw rollback;
    }, { timeoutMs: 120_000 }), error => error === rollback);
    assert.equal(await findIdentityByFirebaseUid(connection.db, firebaseUid), null);
    assert.deepEqual(await connection.db.select({ id: accessProfiles.id }).from(accessProfiles).where(eq(accessProfiles.id, profileId)), []);
    assert.deepEqual(await connection.db.select({ id: secretariats.id }).from(secretariats).where(eq(secretariats.id, secretariatId)), []);
    assert.deepEqual(await connection.db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.actorUsuarioId, userId)), []);
  } finally { await connection.pool.end(); }
});

test("timeout total encerra a conexão e impede gravação de callback retomado depois", {
  skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 30_000,
}, async () => {
  const url = process.env.DATABASE_URL;
  assert.ok(url);
  const connection = createDatabaseConnection(url);
  const id = createId();
  let finish!: () => void;
  const callbackFinished = new Promise<void>(resolve => { finish = resolve; });
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      try {
        await new Promise(resolve => setTimeout(resolve, 700));
        await tx.insert(roles).values({ id, name: "Must not persist after timeout" });
      } finally { finish(); }
    }, { timeoutMs: 500 }), error => error instanceof PersistenceError && error.kind === "timeout");
    await callbackFinished;
    assert.deepEqual(await connection.db.select({ id: roles.id }).from(roles).where(eq(roles.id, id)), []);
  } finally { await connection.pool.end(); }
});
