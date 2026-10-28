import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { pageActiveDebts, pagePayments } from "@/db/schema/taxation-pages";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import type { EconomicAssessmentRecord, EconomicDebtRecord } from "@/lib/contracts/tax-economic";

async function withPayments(db: DatabaseExecutor, assessments: Omit<EconomicAssessmentRecord, "guides">[]): Promise<EconomicAssessmentRecord[]> {
  const guides = await db.select({ id: taxGuides.id, assessmentId: taxGuides.assessmentId }).from(taxGuides).where(inArray(taxGuides.assessmentId, assessments.map(row => row.id)));
  const payments = await db.select({ guideId: pagePayments.guideId, amountPaidDecimal: pagePayments.amountPaidDecimal }).from(pagePayments).where(and(inArray(pagePayments.guideId, guides.map(row => row.id)), eq(pagePayments.status, "Confirmado")));
  return assessments.map(row => ({ ...row, guides: guides.filter(guide => guide.assessmentId === row.id).map(guide => ({ payments: payments.filter(payment => payment.guideId === guide.id).map(payment => ({ amountPaidDecimal: payment.amountPaidDecimal })) })) }));
}
export async function listEconomicDebtAssessments(db: DatabaseExecutor, taxpayerId: string, deferredAssessmentId?: string): Promise<EconomicAssessmentRecord[]> {
  return withPayments(db, await db.select().from(taxAssessments).where(and(eq(taxAssessments.taxpayerId, taxpayerId), deferredAssessmentId ? ne(taxAssessments.id, deferredAssessmentId) : undefined, notInArray(taxAssessments.status, ["Cancelado", "Extinto"]))));
}
export async function readEconomicFeeAssessment(db: DatabaseExecutor, id: string): Promise<EconomicAssessmentRecord> {
  const [row] = await withPayments(db, await db.select().from(taxAssessments).where(eq(taxAssessments.id, id)).limit(1));
  if (!row) throw new Error("Lançamento da taxa não encontrado.");
  return row;
}
export async function listEconomicCreditMovements(db: DatabaseExecutor, assessmentId: string) {
  return db.select({ data: taxRegistryEntries.data }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, assessmentId), eq(taxRegistryEntries.category, "CREDIT_MOVEMENT"), eq(taxRegistryEntries.status, "EFETIVADO")));
}
export async function listEconomicActiveDebts(db: DatabaseExecutor, taxpayerId: string): Promise<EconomicDebtRecord[]> {
  return db.select({ id: pageActiveDebts.id, governmentEntityId: pageActiveDebts.governmentEntityId, budgetUnitId: pageActiveDebts.budgetUnitId, assessment: { calculationSnapshot: taxAssessments.calculationSnapshot } }).from(pageActiveDebts).leftJoin(taxAssessments, eq(taxAssessments.id, pageActiveDebts.assessmentId)).where(and(eq(pageActiveDebts.taxpayerId, taxpayerId), notInArray(pageActiveDebts.status, ["Paga", "PAGA", "Cancelada", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"])));
}
