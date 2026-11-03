import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { z } from "zod";

export const consignmentStatementSchema = z.array(z.object({ agreementId: z.string(), number: z.string(), rubricCode: z.string(), sequence: z.number().int().positive(), total: z.number().int().positive(), amount: z.string(), supplierId: z.string() }));
export async function consignmentStatementDetails(db: DatabaseExecutor, contractId: string, movementIds: string[]) {
  const rows = await db.execute<{ agreementId: string; number: string; rubricCode: string; sequence: number; total: number; amount: string; supplierId: string }>(sql`
    SELECT a.id "agreementId",a.number,a."rubricCode",i.sequence,(SELECT count(*)::int FROM "HrConsignmentInstallment" all_i WHERE all_i."agreementId"=a.id) total,i.amount::text amount,a."supplierId"
    FROM "HrConsignmentAgreement" a JOIN "HrConsignmentInstallment" i ON i."agreementId"=a.id JOIN "HrConsignmentEntry" e ON e."installmentId"=i.id
    WHERE a."contractId"=${contractId} AND e.kind='LANCAMENTO' AND e."movementId"=ANY(${sql.param(movementIds)}::text[]) ORDER BY a.number,i.sequence,i.id`);
  return consignmentStatementSchema.parse(rows.rows);
}
