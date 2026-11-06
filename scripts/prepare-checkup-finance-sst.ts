/** Additive samples through domain services; the default runs in a rollback-only transaction. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { createExpenseRequestInTransaction } from "../src/lib/financeiro";
import { createAvailability, bookAppointment } from "../src/lib/sst/agenda-service";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_FINANCE_SST_2026_V1";
const apply = process.argv.includes("--apply");
const rollback = new Error("CHECKUP_PREVIEW_ROLLBACK");
async function main() {
  const connection = databaseConnection;
  const report = { packageId, mode: apply ? "APPLIED" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), references: {} as Record<string, unknown>, changes: [] as { table: string; id: string; state?: string }[] };
  try {
    const [actor] = (await connection.db.execute<{ firebaseUid: string }>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id='cmvba36v700007kqmdslbwhkk' AND ativo`)).rows;
    assert.ok(actor?.firebaseUid);
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity?.ativo && identity.perfil.codigo === "SYSTEM_ADMINISTRATOR");
    const context: AppContext = { database: connection.db, user: { id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo, permissions: identity.perfil.permissoes, modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null } };
    try {
      await withDatabaseTransaction(connection, async tx => inDatabaseTransactionScope(connection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        const [unit] = (await tx.execute<{ id: string; secretariatId: string }>(sql`SELECT id,"secretariatId" FROM "BudgetUnit" WHERE id='aurora-system-v1:budget-unit:000'`)).rows;
        const [employee] = (await tx.execute<{ id: string; secretariatId: string }>(sql`SELECT id,"secretariatId" FROM "Employee" WHERE id='THIAGO_MORCATTY_DEMO_2026_V1:employee' AND "isActive"`)).rows;
        const [professional] = (await tx.execute<{ personId: string; name: string }>(sql`SELECT e."personId",e.name FROM "HealthProfessional" h JOIN "Employee" e ON e.id=h."employeeId" WHERE h.id='aurora-system-v1:health-professional:000' AND e."isActive"`)).rows;
        assert.ok(unit && professional?.personId && employee?.secretariatId === unit.secretariatId);
        report.references = { budgetUnitId: unit.id, employeeId: employee.id, professionalPersonId: professional.personId, professionalName: professional.name };
        // An existing fictional nurse offers administrative consultation slots, without clinical conclusions.
        for (const [day, book] of [["2026-11-30", true], ["2026-12-07", false]] as const) {
          const startsAt = new Date(`${day}T12:00:00Z`), endsAt = new Date(`${day}T15:00:00Z`);
          const unitName = "Sala de orientação ocupacional — Centro Administrativo";
          let [window] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "SstScheduleAvailability" WHERE "professionalPersonId"=${professional.personId} AND "budgetUnitId"=${unit.id} AND "startsAt"=${startsAt} AND "endsAt"=${endsAt} AND "unitName"=${unitName}`)).rows;
          if (!window) { window = { id: await createAvailability(context, { budgetUnitId: unit.id, professionalPersonId: professional.personId, unitName, startsAt, endsAt, slotMinutes: 30 }, connection) }; report.changes.push({ table: "SstScheduleAvailability", id: window.id }); }
          if (book) {
            const existing = (await tx.execute(sql`SELECT id FROM "SstAppointment" WHERE "availabilityId"=${window.id} AND "employeeId"=${employee.id} AND "startsAt"=${startsAt}`)).rows;
            if (!existing.length) report.changes.push({ table: "SstAppointment", id: await bookAppointment(context, { availabilityId: window.id, employeeId: employee.id, startsAt, purpose: "CONSULTA" }, connection), state: "BOOKED" });
          }
        }
        // Only requested expenses: existing segregation of duties and subsequent accounting gates remain enforced.
        const [appropriation] = (await tx.execute<{ id: string; code: string; nature: string }>(sql`SELECT a.id,a.code,n.name AS nature FROM "BudgetAppropriation" a JOIN "ExpenseNature" n ON n.id=a."expenseNatureId" JOIN "FinancialYear" y ON y.id=a."financialYearId" WHERE a."budgetUnitId"=${unit.id} AND y.year=2026 AND n.code LIKE '3.3.90.30%' ORDER BY a.code LIMIT 1`)).rows;
        assert.ok(appropriation, "Dotação de material de consumo da unidade administrativa não encontrada.");
        const [supplier] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "Supplier" WHERE id='aurora-system-v1:supplier:000' AND status='Ativo'`)).rows;
        assert.ok(supplier);
        report.references.appropriation = appropriation;
        for (const [key, description, value] of [["office", "Materiais de expediente para organização do atendimento administrativo", "480.00"], ["technology", "Materiais de consumo para organização e identificação dos equipamentos de TI", "320.00"]] as const) {
          const idempotencyKey = `${packageId}:expense:${key}`;
          const existing = (await tx.execute(sql`SELECT id FROM "Expense" WHERE "idempotencyKey"=${idempotencyKey}`)).rows;
          if (existing.length) continue;
          const expense = await createExpenseRequestInTransaction(tx, { usuarioId: context.user.id, employeeId: context.user.employeeId }, { date: new Date("2026-11-06T12:00:00Z"), description, value, appropriationId: appropriation.id, supplierId: supplier.id, secretariatId: unit.secretariatId, sourceModule: "FINANCEIRO", sourceType: "PRESENTATION_EXPENSE_REQUEST", sourceId: packageId, eventType: "PRESENTATION_EXPENSE_REQUEST", idempotencyKey });
          assert.equal(expense.status, "Solicitada");
          report.changes.push({ table: "Expense", id: expense.id, state: expense.status });
        }
        if (!apply) throw rollback;
      }));
    } catch (error) { if (error !== rollback) throw error; }
    mkdirSync("docs/checkup/demonstration-data", { recursive: true });
    writeFileSync(`docs/checkup/demonstration-data/finance-sst-${apply ? "applied" : "preview"}-${Date.now()}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
