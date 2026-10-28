import { and, count, eq, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxPayments } from "@/db/schema/tax-accounting";
import { annualRequired } from "./records";

export async function readScheduledAssessment(db: DatabaseExecutor, id: string) {
  return annualRequired((await db.select().from(taxAssessments).where(eq(taxAssessments.id, id)).limit(1))[0], "Lançamento");
}
export async function countScheduledActiveGuides(db: DatabaseExecutor, assessmentId: string) {
  return (await db.select({ value: count() }).from(taxGuides).where(and(eq(taxGuides.assessmentId, assessmentId), ne(taxGuides.status, "Cancelada"))))[0].value;
}
export async function countScheduledPayments(db: DatabaseExecutor, assessmentId: string) {
  return (await db.select({ value: count() }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(eq(taxGuides.assessmentId, assessmentId), eq(taxPayments.status, "Confirmado"))))[0].value;
}
export async function nextScheduledGuideNumber(tx: DatabaseTransaction, year: number) {
  const sequence = await tx.execute<{ currentValue: number }>(sql`INSERT INTO "TaxDocumentSequence" (id, year, "documentType", "currentValue", "updatedAt") VALUES (${createId()}, ${year}, 'GUIDE', 1, ${new Date().toISOString()}::timestamp) ON CONFLICT (year, "documentType") DO UPDATE SET "currentValue"="TaxDocumentSequence"."currentValue"+1, "updatedAt"=${new Date().toISOString()}::timestamp RETURNING "currentValue"`);
  return `DAM-${year}-${String(annualRequired(sequence.rows[0], "Sequência de guia").currentValue).padStart(7, "0")}`;
}
export async function insertScheduledGuide(tx: DatabaseTransaction, input: { assessmentId: string; guideNumber: string; value: Decimal; dueDate: Date; snapshot: JsonValue }) {
  const id = createId();
  // Float compatibility is explicit and independent of the exact numeric string.
  await tx.execute(sql`INSERT INTO "TaxGuide" (id, "assessmentId", "guideNumber", "totalValue", "totalValueDecimal", "dueDate", status, "calculationSnapshot", "updatedAt") VALUES (${id}, ${input.assessmentId}, ${input.guideNumber}, ${Number(input.value)}, ${input.value.toFixed(2)}::numeric, ${input.dueDate.toISOString()}::timestamp, 'Emitida', ${JSON.stringify(input.snapshot)}::jsonb, ${new Date().toISOString()}::timestamp)`);
  return id;
}
export async function markScheduledAssessmentIssued(tx: DatabaseTransaction, id: string) {
  await tx.execute(sql`UPDATE "TaxAssessment" SET status='Emitido', "updatedAt"=${new Date().toISOString()}::timestamp WHERE id=${id}`);
}
