import type { DatabaseTransaction } from "@/db/transaction";
import { expenses } from "@/db/schema/finance-expenses";

export type LegacyExpenseInput = {
  description: string;
  value: number;
  appropriationId: string;
  secretariatId: string;
  socialBenefitId?: string;
  socialProgramId?: string;
};

/** Preserve the old Social nested Expense creation in the caller's transaction.
 * The legacy Float and Empenhada status are intentional; no financial workflow
 * or Decimal backfill is inferred from this compatibility entry. */
export async function createLegacyExpenseInTransaction(tx: DatabaseTransaction, input: LegacyExpenseInput): Promise<string> {
  const [expense] = await tx.insert(expenses).values({
    description: input.description,
    value: Number(input.value),
    appropriationId: input.appropriationId,
    secretariatId: input.secretariatId,
    status: "Empenhada",
    socialBenefitId: input.socialBenefitId,
    socialProgramId: input.socialProgramId,
  }).returning({ id: expenses.id });
  return expense.id;
}
