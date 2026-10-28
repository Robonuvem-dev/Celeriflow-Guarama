import { and, eq, isNull, sum } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import * as f from "@/db/schema/fleet";
import { departments } from "@/db/schema/administration";
import { requiredFleetRecord } from "@/db/repositories/fleet/records";
import { readFleetPaidAmount } from "@/db/repositories/fleet/sources";
import type { FleetScope } from "./service";
import { controlSchemas } from "./control-policy";
import { FleetControlError, lockFleetResources, scopedFleetEvidence, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { dateOnly, todayInBrazil } from "./contract";

export async function saveFleetDebtSettings(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.debtSettings.parse(raw);
  if (!scope.administrator && input.departmentId !== scope.departmentId) throw new FleetControlError("Configure somente os alertas da sua repartição.");
  if (!(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1)).length) throw new FleetControlError("Repartição inativa ou inexistente.");
  await lockFleetResources(tx, [`DEBT_SETTINGS:${input.departmentId}`]);
  const settings = requiredFleetRecord(await tx.insert(f.fleetDebtSettings).values(input).onConflictDoUpdate({ target: f.fleetDebtSettings.departmentId, set: input }).returning());
  return { id: settings.departmentId, type: "DEBT_SETTINGS" };
}

export async function registerFleetDebt(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.debtDocument.parse(raw);
  const unit = await scopedFleetUnit(tx, scope, input.unitId, false);
  if (new Decimal(input.amount).lte(0)) throw new FleetControlError("Informe valor positivo para o débito.");
  await lockFleetResources(tx, [`UNIT:${unit.id}`, `DEBT:${unit.id}:${input.type}:${input.reference}`]);
  const [existing] = await tx.select({ id: f.fleetDocuments.id }).from(f.fleetDocuments).where(and(eq(f.fleetDocuments.unitId, unit.id), eq(f.fleetDocuments.kind, "OBRIGACAO"), eq(f.fleetDocuments.type, input.type), eq(f.fleetDocuments.reference, input.reference))).limit(1);
  if (existing) throw new FleetControlError("Já existe débito com esta referência para a unidade.");
  const result = requiredFleetRecord(await tx.insert(f.fleetDocuments).values({ unitId: unit.id, kind: "OBRIGACAO", type: input.type, reference: input.reference, title: input.title, dueAt: dateOnly(input.dueAt), value: new Decimal(input.amount), notes: input.notes || null, createdById: scope.actorId }).returning());
  return { id: result.id, type: "DEBT_DOCUMENT", unitId: unit.id };
}

export async function payFleetDebt(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.payDebt.parse(raw);
  const [document] = await tx.select().from(f.fleetDocuments).where(and(eq(f.fleetDocuments.id, input.documentId), eq(f.fleetDocuments.kind, "OBRIGACAO"))).limit(1);
  if (!document) throw new FleetControlError("Débito não encontrado.");
  const unit = await scopedFleetUnit(tx, scope, document.unitId, false);
  await lockFleetResources(tx, [`DEBT:${document.id}`, ...(input.financialPaymentId ? [`FINANCIAL_PAYMENT:${input.financialPaymentId}`] : [])]);
  const [settings] = await tx.select().from(f.fleetDebtSettings).where(eq(f.fleetDebtSettings.departmentId, unit.departmentId!)).limit(1);
  if (settings?.requireEvidence && !input.proofVersionId) throw new FleetControlError("A configuração da repartição exige comprovante GED para registrar pagamento.");
  if (input.proofVersionId) await scopedFleetEvidence(tx, scope, input.proofVersionId, document.unitId);
  const amount = new Decimal(input.amount), [prior] = await tx.select({ amount: sum(f.fleetDebtPayments.amount) }).from(f.fleetDebtPayments).where(and(eq(f.fleetDebtPayments.documentId, document.id), isNull(f.fleetDebtPayments.reversedAt)));
  const paid = new Decimal(prior.amount || 0).add(amount);
  if (amount.lte(0) || !document.value || paid.gt(document.value) || input.paidAt > todayInBrazil()) throw new FleetControlError("Parcela, total ou data de pagamento incoerentes.");
  if (input.financialPaymentId) {
    const financial = await readFleetPaidAmount(tx, input.financialPaymentId);
    const [allocated] = await tx.select({ amount: sum(f.fleetDebtPayments.amount) }).from(f.fleetDebtPayments).where(and(eq(f.fleetDebtPayments.financialPaymentId, input.financialPaymentId), isNull(f.fleetDebtPayments.reversedAt)));
    if (!financial || new Decimal(allocated.amount || 0).add(amount).gt(financial)) throw new FleetControlError("Pagamento financeiro não confirmado ou alocação superior ao pago.");
  }
  const payment = requiredFleetRecord(await tx.insert(f.fleetDebtPayments).values({ documentId: document.id, paidAt: dateOnly(input.paidAt), amount, proofVersionId: input.proofVersionId || null, financialPaymentId: input.financialPaymentId || null, reason: input.reason, createdById: scope.actorId }).returning());
  const expense = requiredFleetRecord(await tx.insert(f.fleetExpenses).values({ unitId: document.unitId, nature: "DEBITO_VEICULO", occurredAt: payment.paidAt, amount, description: `Pagamento de ${document.type}: ${document.title}`, sourceType: "PAGAMENTO_DEBITO", sourceId: payment.id, sourceKey: `debt-payment:${payment.id}`, reference: input.financialPaymentId || input.proofVersionId || document.reference, createdById: scope.actorId }).returning());
  await tx.update(f.fleetDebtPayments).set({ expenseId: expense.id }).where(eq(f.fleetDebtPayments.id, payment.id));
  return { id: payment.id, type: "DEBT_PAYMENT", unitId: document.unitId };
}

export async function reverseFleetDebtPayment(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.reverseDebtPayment.parse(raw);
  const [payment] = await tx.select().from(f.fleetDebtPayments).where(eq(f.fleetDebtPayments.id, input.paymentId)).limit(1);
  if (!payment) throw new FleetControlError("Pagamento de débito não encontrado.");
  const document = requiredFleetRecord(await tx.select().from(f.fleetDocuments).where(eq(f.fleetDocuments.id, payment.documentId)).limit(1));
  await scopedFleetUnit(tx, scope, document.unitId, false);
  await lockFleetResources(tx, [`DEBT:${payment.documentId}`]);
  if (payment.reversedAt) throw new FleetControlError("Parcela já estornada.");
  await tx.update(f.fleetDebtPayments).set({ reversedAt: new Date() }).where(eq(f.fleetDebtPayments.id, payment.id));
  await tx.insert(f.fleetExpenses).values({ unitId: document.unitId, nature: "DEBITO_VEICULO", occurredAt: new Date(), amount: payment.amount.neg(), description: `Estorno de pagamento de ${document.type}: ${input.reason}`, sourceType: "ESTORNO_DEBITO", sourceId: payment.id, sourceKey: `debt-payment-reversal:${payment.id}`, reference: document.reference, createdById: scope.actorId });
  return { id: payment.id, type: "DEBT_PAYMENT", unitId: document.unitId };
}
