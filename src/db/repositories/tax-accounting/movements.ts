import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { accountingTransactions } from "@/db/schema/finance-accounting";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxPayments } from "@/db/schema/tax-accounting";
import { taxRevenueIntegrations } from "@/db/schema/finance-revenues";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAccountingObject, taxJsonString } from "./records";

/** Fiscal identity follows canonical IDs; narratives and account names do not assign a tax. */
export async function taxAccountingOriginFilter(tx: DatabaseExecutor, taxId: string): Promise<SQL | undefined> {
  const assessments = await tx.select({ id: taxAssessments.id }).from(taxAssessments).where(eq(taxAssessments.taxId, taxId));
  const assessmentIds = assessments.map(item => item.id);
  const guides = await tx.select({ id: taxGuides.id }).from(taxGuides).where(inArray(taxGuides.assessmentId, assessmentIds));
  const guideIds = guides.map(item => item.id);
  const receipts = await tx.select({ revenueId: taxRevenueIntegrations.revenueId }).from(taxRevenueIntegrations).innerJoin(taxPayments, eq(taxPayments.id, taxRevenueIntegrations.taxPaymentId)).where(inArray(taxPayments.guideId, guideIds));
  const roots = guideIds.length ? await tx.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "TAX_CREDIT"), or(...guideIds.map(id => taxJsonString(taxRegistryEntries.data, "originGuideId", id))))) : [];
  const registryIds = new Set(roots.map(item => item.id));
  let frontier = [...registryIds];
  for (let depth = 0; frontier.length; depth++) {
    if (depth >= 32) throw new Error("Cadeia de créditos/transferências excede 32 níveis; concilie a origem documental.");
    const successors = await tx.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(and(inArray(taxRegistryEntries.category, ["TAX_CREDIT", "CREDIT_MOVEMENT", "REFUND_REQUEST"]), or(...frontier.map(id => taxJsonString(taxRegistryEntries.data, "sourceCreditId", id)))));
    frontier = successors.filter(item => !registryIds.has(item.id)).map(item => item.id);
    for (const id of frontier) registryIds.add(id);
  }
  const compensations = await tx.select({ data: taxRegistryEntries.data }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), inArray(taxRegistryEntries.entityId, assessmentIds), eq(taxRegistryEntries.category, "CREDIT_MOVEMENT")));
  const compensationIds = compensations.flatMap(item => { const id = taxAccountingObject(item.data).accountingTransactionId; return typeof id === "string" ? [id] : []; });
  const origins = await tx.select({ id: accountingTransactions.id }).from(accountingTransactions).where(or(
    and(inArray(accountingTransactions.sourceType, ["TAX_ASSESSMENT", "TAX_ASSESSMENT_ADJUSTMENT", "ACTIVE_DEBT_RECLASSIFICATION", "ACTIVE_DEBT_RETURN", "ACTIVE_DEBT_RESTORATION"]), inArray(accountingTransactions.sourceId, assessmentIds)),
    and(eq(accountingTransactions.sourceType, "TAX_PAYMENT"), inArray(accountingTransactions.sourceId, receipts.map(item => item.revenueId))),
    and(inArray(accountingTransactions.sourceType, ["TAX_CREDIT", "TAX_CREDIT_COMPENSATION", "TAX_REFUND", "TAX_CREDIT_REVERSAL", "TAX_CREDIT_COMPENSATION_REVERSAL", "TAX_REFUND_REVERSAL"]), inArray(accountingTransactions.sourceId, [...registryIds])),
    inArray(accountingTransactions.id, compensationIds),
  ));
  const ids = origins.map(item => item.id);
  return or(inArray(accountingTransactions.id, ids), inArray(accountingTransactions.reversalOfId, ids));
}
