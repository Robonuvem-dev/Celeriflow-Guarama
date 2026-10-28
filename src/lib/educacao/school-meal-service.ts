import { ilike, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { secretariats } from "@/db/schema/administration";
import { schoolMeals } from "@/db/schema/education-meals";
import { createLegacyExpenseInTransaction } from "@/lib/financeiro/legacy-expense";

export async function recordSchoolMealInTransaction(tx: DatabaseTransaction, input: { schoolId: string; menu: string; servedQuantity: number; totalCost: number; notes: string }) {
  await tx.insert(schoolMeals).values(input);
  if (input.totalCost <= 0) return;
  let [secretariat] = await tx.select({ id: secretariats.id }).from(secretariats).where(ilike(secretariats.name, "%Educação%")).limit(1);
  if (!secretariat) [secretariat] = await tx.select({ id: secretariats.id }).from(secretariats).limit(1);
  const { rows: [appropriation] } = await tx.execute<{ id: string }>(sql`SELECT id FROM "BudgetAppropriation" LIMIT 1`);
  if (secretariat && appropriation) await createLegacyExpenseInTransaction(tx, {
    description: `Custo Merenda Escolar - ${input.menu}`, value: input.totalCost,
    appropriationId: appropriation.id, secretariatId: secretariat.id,
  });
}
