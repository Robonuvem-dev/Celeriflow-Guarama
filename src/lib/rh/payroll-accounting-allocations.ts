import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";

export async function readPayrollAccountingAllocations(db: DatabaseExecutor) {
  return (await db.execute<{ id: string; details: Record<string, string>; appropriation: string; budgetUnitId: string; source: string; nature: string }>(sql`
    SELECT r.id,r.details,a.code appropriation,a."budgetUnitId",s.code source,n.code nature FROM "HrReferenceRecord" r
    JOIN "BudgetAppropriation" a ON a.id=r.details->>'appropriationId' JOIN "ResourceSource" s ON s.id=a."resourceSourceId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
    WHERE r.kind='RATEIO_FOLHA' ORDER BY r.id`)).rows;
}
