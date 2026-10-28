import { config } from "dotenv";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users, accessProfiles, userBudgetUnits } from "../src/db/schema/identity";
import { employees, departments } from "../src/db/schema/administration";
import { planningEntityUnits } from "../src/db/schema/planning-catalog";
import { procurementUnits } from "../src/db/schema/procurement-budget";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import type { JsonObject } from "../src/db/json";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-procurement-actors-2026-v1";
const departmentId = `${key}:department`;
const reviewerId = "cmv2sbpnj000106lbisa3zhwf";
const reviewerEmployeeId = `${key}:reviewer`;
const receiverEmployeeId = `${key}:receiver`;
const decision = "Responsável autorizou expressamente Admin Teste como segundo operador: admin@email.com solicitante, segundo login aprovador, vínculo funcional e acesso às UGs explicitamente vinculadas a Aurora; recebedor exemplificativo distinto para ateste segregado. Credenciais e perfil compartilhado preservados.";

async function main() {
  const { createDatabaseConnection } = await import("../src/db/connection");
  const connection = createDatabaseConnection(process.env.DATABASE_URL!);
  try {
    const report = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const [requesterRow] = await tx.select({ user: users, employee: employees }).from(users).leftJoin(employees, eq(employees.id, users.employeeId)).where(eq(users.email, "admin@email.com")).limit(1);
      const [reviewerRow] = await tx.select({ user: users, profile: accessProfiles }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(eq(users.id, reviewerId)).limit(1);
      if (!requesterRow?.user.ativo || !requesterRow.employee?.isActive || !reviewerRow?.user.ativo || !reviewerRow.user.firebaseUid || reviewerRow.user.nome !== "Admin Teste") throw new Error("Operadores autorizados indisponíveis; nenhuma substituição por outro login.");
      const requester = { ...requesterRow.user, employee: requesterRow.employee };
      const reviewer = reviewerRow.user;
      const permissions = JSON.parse(reviewerRow.profile.permissoes) as { modules?: Record<string, { blocked?: boolean; create?: boolean; update?: boolean }> };
      if (["COMPRAS", "PATRIMONIO"].some(code => !permissions.modules?.[code]?.update || permissions.modules[code].blocked)) throw new Error("Perfil do segundo operador não permite as aprovações solicitadas; conferir antes de conceder.");
      const [binding] = await tx.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, "p0-current-exe-ug-1")).limit(1);
      if (binding?.governmentEntityId !== "p0-current-exe") throw new Error("UG do Executivo divergente.");
      const [unit] = await tx.select().from(procurementUnits).where(eq(procurementUnits.id, binding.budgetUnitId)).limit(1);
      if (!unit) throw new Error("Unidade gestora não encontrada.");
      const units = await tx.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(inArray(planningEntityUnits.governmentEntityId, ["p0-current-exe", "p0-current-leg"])).orderBy(asc(planningEntityUnits.budgetUnitId));
      if (reviewer.employeeId && reviewer.employeeId !== reviewerEmployeeId) throw new Error("Segundo operador já vinculado a outro servidor; preservar cadastro atual.");
      if (requester.employee!.departmentId && requester.employee!.departmentId !== departmentId) throw new Error("Solicitante já lotado em outro setor; preservar a lotação atual.");
      const [prior] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "PREPARE_PROCUREMENT_ACTORS"), eq(financialAuditLogs.entityId, key))).limit(1);
      if (apply && !prior) {
        await tx.insert(departments).values({ id: departmentId, name: "Departamento de Suprimentos e Almoxarifado", secretariatId: unit.secretariatId });
        await tx.insert(employees).values([{ id: reviewerEmployeeId, name: "Responsável pela Aprovação de Suprimentos", secretariatId: unit.secretariatId, departmentId }, { id: receiverEmployeeId, name: "Rafael Moreira — Almoxarife", secretariatId: unit.secretariatId, departmentId }]);
        await tx.update(employees).set({ departmentId }).where(eq(employees.id, requester.employeeId!));
        await tx.update(users).set({ employeeId: reviewerEmployeeId }).where(eq(users.id, reviewer.id));
        for (const scopedUnit of units) await tx.insert(userBudgetUnits).values({ usuarioId: reviewer.id, budgetUnitId: scopedUnit.budgetUnitId }).onConflictDoNothing({ target: [userBudgetUnits.usuarioId, userBudgetUnits.budgetUnitId] });
        await tx.insert(financialAuditLogs).values({ action: "PREPARE_PROCUREMENT_ACTORS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: requester.id, payload: { decision, requesterId: requester.id, reviewerId: reviewer.id, reviewerEmployeeId, receiverEmployeeId, departmentId, previousRequesterDepartmentId: requester.employee.departmentId, previousReviewerEmployeeId: reviewer.employeeId, profileId: reviewer.perfilId, budgetUnitIds: units.map(item => item.budgetUnitId), authenticationCredentialsChanged: false } });
      }
      if (prior && ((prior.payload as JsonObject).reviewerId !== reviewer.id || reviewer.employeeId !== reviewerEmployeeId || requester.employee.departmentId !== departmentId)) throw new Error("Preparação anterior foi alterada; preserve e confira pela interface.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), requesterId: requester.id, reviewerId: reviewer.id, reviewerEmail: reviewer.email, reviewerEmployeeId, receiverEmployeeId, departmentId, allowedBudgetUnits: units.length, decision };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação de operadores."); process.exitCode = 1; });
