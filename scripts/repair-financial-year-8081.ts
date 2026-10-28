import dotenv from "dotenv";
import { and, asc, count, eq, inArray, isNull, like } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as t from "../src/db/schema/finance-setup-tools";
import { openFinanceSetupConnection } from "./lib/finance-setup-tools";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const INVALID_YEAR = 8081;
const CANONICAL_YEAR = 2026;
const INVALID_APPROPRIATION_CODE = "APP-6055";

export async function repairFinancialYear8081(connection: DatabaseConnection) {
    return withDatabaseTransaction(connection, async (tx) => {
      const [invalidYear, canonicalYear, actor] = await Promise.all([
        tx.select({ id: t.setupYears.id }).from(t.setupYears).where(and(eq(t.setupYears.year, INVALID_YEAR), isNull(t.setupYears.governmentEntityId))).limit(1).then(rows => rows[0]),
        tx.select({ id: t.setupYears.id, status: t.setupYears.status }).from(t.setupYears).where(and(eq(t.setupYears.year, CANONICAL_YEAR), isNull(t.setupYears.governmentEntityId))).limit(1).then(rows => rows[0]),
        tx.select({ id: t.setupUsers.id, employeeId: t.setupUsers.employeeId }).from(t.setupUsers).where(eq(t.setupUsers.ativo, true)).orderBy(asc(t.setupUsers.createdAt)).limit(1).then(rows => rows[0]),
      ]);

      if (!invalidYear) return { repaired: false, reason: `Exercício ${INVALID_YEAR} não encontrado.` };
      if (!canonicalYear || canonicalYear.status !== "Aberto") throw new Error(`O exercício ${CANONICAL_YEAR} deve estar aberto para receber a correção.`);
      if (!actor) throw new Error("Não existe usuário ativo para auditar a correção do exercício.");

      const [appropriation, movements, commitments, reservations] = await Promise.all([
        tx.select({ id: t.setupAppropriations.id }).from(t.setupAppropriations).where(and(eq(t.setupAppropriations.code, INVALID_APPROPRIATION_CODE), eq(t.setupAppropriations.financialYearId, invalidYear.id))).limit(1).then(rows => rows[0]),
        tx.select({ id: t.setupTreasury.id }).from(t.setupTreasury).where(eq(t.setupTreasury.financialYearId, invalidYear.id)),
        tx.select({ total: count() }).from(t.setupCommitments).innerJoin(t.setupAppropriations, eq(t.setupAppropriations.id, t.setupCommitments.appropriationId)).where(eq(t.setupAppropriations.financialYearId, invalidYear.id)).then(rows => rows[0].total),
        tx.select({ total: count() }).from(t.setupReservations).innerJoin(t.setupAppropriations, eq(t.setupAppropriations.id, t.setupReservations.appropriationId)).where(eq(t.setupAppropriations.financialYearId, invalidYear.id)).then(rows => rows[0].total),
      ]);
      if (!appropriation || movements.length !== 13 || commitments !== 0 || reservations !== 0) {
        throw new Error("A massa inválida não corresponde ao conjunto conhecido; a correção foi interrompida sem alterar dados.");
      }

      const expenses = await tx.select({ id: t.setupExpenses.id }).from(t.setupExpenses).where(eq(t.setupExpenses.appropriationId, appropriation.id));
      if (expenses.length !== 2) throw new Error("A dotação inválida possui despesas inesperadas; a correção foi interrompida.");

      await tx.delete(t.setupExpenses).where(inArray(t.setupExpenses.id, expenses.map(expense => expense.id)));
      await tx.delete(t.setupAppropriations).where(eq(t.setupAppropriations.id, appropriation.id));
      await tx.update(t.setupTreasury).set({ financialYearId: canonicalYear.id }).where(inArray(t.setupTreasury.id, movements.map(movement => movement.id)));
      await tx.delete(t.setupYears).where(eq(t.setupYears.id, invalidYear.id));

      await tx.update(t.setupUnits).set({ name: "Unidade Orçamentária Assistência" }).where(eq(t.setupUnits.code, "BU-6055"));
      await tx.update(t.setupSecretariats).set({ name: "Secretaria de Assistência Social 6055" }).where(like(t.setupSecretariats.name, "%Assist�ncia%"));
      await tx.update(t.setupSources).set({ name: "Recursos Ordinários" }).where(eq(t.setupSources.code, "RS-6055"));
      await tx.update(t.setupExpenseNatures).set({ name: "Despesas de Custeio" }).where(eq(t.setupExpenseNatures.code, "EN-6055"));

      // FinancialAuditLog is append-only. Keep the original evidence and record the correction separately.
      await tx.insert(t.setupAudits).values({
          action: "CORRECAO_EXERCICIO_FINANCEIRO",
          entityType: "FinancialYear",
          entityId: invalidYear.id,
          financialYearId: canonicalYear.id,
          authorUsuarioId: actor.id,
          authorEmployeeId: actor.employeeId,
          payload: {
            previousYear: INVALID_YEAR,
            canonicalYear: CANONICAL_YEAR,
            migratedTreasuryMovementIds: movements.map((movement) => movement.id),
            removedAppropriationCode: INVALID_APPROPRIATION_CODE,
            reason: "Correção de exercício sobreposto criado pela seed-modulo14.",
          },
      });

      return { repaired: true, migratedMovements: movements.length, removedExpenses: expenses.length };
    }, { isolationLevel: "serializable" });
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(await repairFinancialYear8081(connection)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
