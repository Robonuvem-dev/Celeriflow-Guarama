import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { withholdingPayables, paymentRetentions, payments } from "../../schema/finance-payments";
import { commitments, budgetAppropriations } from "../../schema/finance-budget";
import { financialDocuments } from "../../schema/finance-documents";
import { taxRegistryEntries } from "../../schema/taxation-registry";
import { reconciliationTreasuryMovements } from "../../schema/finance-reconciliation";

export async function listExtraNoteWithholdings(db: DatabaseExecutor, unitIds: string[], through?: Date) {
  if (!unitIds.length) return [];
  const rows = await db.select({ note: withholdingPayables, retention: paymentRetentions, payment: payments, commitment: commitments, appropriation: budgetAppropriations }).from(withholdingPayables)
    .innerJoin(paymentRetentions, eq(paymentRetentions.id, withholdingPayables.retentionId))
    .innerJoin(payments, eq(payments.id, paymentRetentions.paymentId))
    .innerJoin(commitments, eq(commitments.id, payments.commitmentId))
    .innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId))
    .where(and(eq(withholdingPayables.status, "Pendente"), eq(payments.status, "Paga"), through ? lte(payments.date, through) : undefined, inArray(budgetAppropriations.budgetUnitId, unitIds))).orderBy(asc(withholdingPayables.id));
  if (!rows.length) return [];
  const [noteDocuments, paymentDocuments] = await Promise.all([
    db.select().from(financialDocuments).where(inArray(financialDocuments.withholdingPayableId, rows.map(row => row.note.id))),
    db.select().from(financialDocuments).where(inArray(financialDocuments.paymentId, rows.map(row => row.payment.id))),
  ]);
  // Preserve every scalar and the original included relation shape/order. These
  // complete documents feed persisted fingerprints, including historical copies.
  return rows.map(row => ({ ...row.note, financialDocument: noteDocuments.find(document => document.withholdingPayableId === row.note.id) ?? null,
    retention: { ...row.retention, payment: { ...row.payment, financialDocument: paymentDocuments.find(document => document.paymentId === row.payment.id) ?? null,
      commitment: { ...row.commitment, appropriation: row.appropriation } } } }));
}
export async function listFinancialTaxCredits(db: DatabaseExecutor, governmentEntityId: string, unitIds: string[]) {
  if (!unitIds.length) return [];
  return db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "TAX_CREDIT"), ne(taxRegistryEntries.status, "ESTORNADO"), sql`${taxRegistryEntries.data}->'governmentEntityId' = ${JSON.stringify(governmentEntityId)}::jsonb`, sql`jsonb_typeof(${taxRegistryEntries.data}->'budgetUnitId') = 'string'`, inArray(sql<string>`${taxRegistryEntries.data}->>'budgetUnitId'`, unitIds))).orderBy(asc(taxRegistryEntries.id));
}
export async function readFinancialTaxRegistryEntry(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id));
  if (!row) throw new Error("Nota extraorçamentária não encontrada.");
  return row;
}
export async function listReservedFinancialTaxRefunds(db: DatabaseExecutor, creditIds: string[]) {
  if (!creditIds.length) return [];
  return db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "REFUND_REQUEST"), inArray(taxRegistryEntries.status, ["PENDENTE_APROVACAO", "APROVADA_AGUARDANDO_TESOURARIA"]), sql`jsonb_typeof(${taxRegistryEntries.data}->'sourceCreditId') = 'string'`, inArray(sql<string>`${taxRegistryEntries.data}->>'sourceCreditId'`, creditIds))).orderBy(asc(taxRegistryEntries.id));
}
export async function readExtraNoteIngress(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(reconciliationTreasuryMovements).where(eq(reconciliationTreasuryMovements.id, id));
  if (!row) throw new Error("Ingresso extraorçamentário não encontrado.");
  return row;
}
