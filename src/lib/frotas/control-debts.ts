import { Prisma } from "@prisma/client";
import type { FleetScope } from "./service";
import { controlSchemas } from "./control-policy";
import { FleetControlError, lockFleetResources, scopedFleetEvidence, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { dateOnly, todayInBrazil } from "./contract";

export async function saveFleetDebtSettings(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.debtSettings.parse(raw);
  if (!scope.administrator && input.departmentId !== scope.departmentId) throw new FleetControlError("Configure somente os alertas da sua repartição.");
  if (!await tx.department.findFirst({ where: { id: input.departmentId, isActive: true }, select: { id: true } })) throw new FleetControlError("Repartição inativa ou inexistente.");
  await lockFleetResources(tx, [`DEBT_SETTINGS:${input.departmentId}`]);
  const settings = await tx.fleetDebtSettings.upsert({ where: { departmentId: input.departmentId }, create: input, update: input });
  return { id: settings.departmentId, type: "DEBT_SETTINGS" };
}

export async function registerFleetDebt(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.debtDocument.parse(raw);
  const unit = await scopedFleetUnit(tx, scope, input.unitId, false);
  if (new Prisma.Decimal(input.amount).lte(0)) throw new FleetControlError("Informe valor positivo para o débito.");
  await lockFleetResources(tx, [`UNIT:${unit.id}`, `DEBT:${unit.id}:${input.type}:${input.reference}`]);
  const existing = await tx.fleetDocument.findFirst({ where: { unitId: unit.id, kind: "OBRIGACAO", type: input.type, reference: input.reference }, select: { id: true } });
  if (existing) throw new FleetControlError("Já existe débito com esta referência para a unidade.");
  const result = await tx.fleetDocument.create({ data: { unitId: unit.id, kind: "OBRIGACAO", type: input.type, reference: input.reference, title: input.title, dueAt: dateOnly(input.dueAt), value: new Prisma.Decimal(input.amount), notes: input.notes || null, createdById: scope.actorId } });
  return { id: result.id, type: "DEBT_DOCUMENT", unitId: unit.id };
}

export async function payFleetDebt(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.payDebt.parse(raw);
  const document = await tx.fleetDocument.findFirst({ where: { id: input.documentId, kind: "OBRIGACAO" }, include: { unit: { select: { departmentId: true } } } });
  if (!document || !document.unit.departmentId) throw new FleetControlError("Débito não encontrado.");
  await scopedFleetUnit(tx, scope, document.unitId, false);
  await lockFleetResources(tx, [`DEBT:${document.id}`, ...(input.financialPaymentId ? [`FINANCIAL_PAYMENT:${input.financialPaymentId}`] : [])]);
  const settings = await tx.fleetDebtSettings.findUnique({ where: { departmentId: document.unit.departmentId } });
  if (settings?.requireEvidence && !input.proofVersionId) throw new FleetControlError("A configuração da repartição exige comprovante GED para registrar pagamento.");
  if (input.proofVersionId) await scopedFleetEvidence(tx, scope, input.proofVersionId, document.unitId);
  const amount = new Prisma.Decimal(input.amount), prior = await tx.fleetDebtPayment.aggregate({ where: { documentId: document.id, reversedAt: null }, _sum: { amount: true } });
  const paid = (prior._sum.amount || new Prisma.Decimal(0)).add(amount);
  if (amount.lte(0) || !document.value || paid.gt(document.value) || input.paidAt > todayInBrazil()) throw new FleetControlError("Parcela, total ou data de pagamento incoerentes.");
  if (input.financialPaymentId) {
    const financial = await tx.payment.findFirst({ where: { id: input.financialPaymentId, status: "Pago" }, select: { valueDecimal: true } });
    const allocated = await tx.fleetDebtPayment.aggregate({ where: { financialPaymentId: input.financialPaymentId, reversedAt: null }, _sum: { amount: true } });
    if (!financial?.valueDecimal || (allocated._sum.amount || new Prisma.Decimal(0)).add(amount).gt(financial.valueDecimal)) throw new FleetControlError("Pagamento financeiro não confirmado ou alocação superior ao pago.");
  }
  const payment = await tx.fleetDebtPayment.create({ data: { documentId: document.id, paidAt: dateOnly(input.paidAt), amount, proofVersionId: input.proofVersionId || null, financialPaymentId: input.financialPaymentId || null, reason: input.reason, createdById: scope.actorId } });
  const expense = await tx.fleetExpense.create({ data: { unitId: document.unitId, nature: "DEBITO_VEICULO", occurredAt: payment.paidAt, amount, description: `Pagamento de ${document.type}: ${document.title}`, sourceType: "PAGAMENTO_DEBITO", sourceId: payment.id, sourceKey: `debt-payment:${payment.id}`, reference: input.financialPaymentId || input.proofVersionId || document.reference, createdById: scope.actorId } });
  await tx.fleetDebtPayment.update({ where: { id: payment.id }, data: { expenseId: expense.id } });
  return { id: payment.id, type: "DEBT_PAYMENT", unitId: document.unitId };
}

export async function reverseFleetDebtPayment(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.reverseDebtPayment.parse(raw);
  const payment = await tx.fleetDebtPayment.findUnique({ where: { id: input.paymentId }, include: { document: true } });
  if (!payment) throw new FleetControlError("Pagamento de débito não encontrado.");
  await scopedFleetUnit(tx, scope, payment.document.unitId, false);
  await lockFleetResources(tx, [`DEBT:${payment.documentId}`]);
  if (payment.reversedAt) throw new FleetControlError("Parcela já estornada.");
  await tx.fleetDebtPayment.update({ where: { id: payment.id }, data: { reversedAt: new Date() } });
  await tx.fleetExpense.create({ data: { unitId: payment.document.unitId, nature: "DEBITO_VEICULO", occurredAt: new Date(), amount: payment.amount.neg(), description: `Estorno de pagamento de ${payment.document.type}: ${input.reason}`, sourceType: "ESTORNO_DEBITO", sourceId: payment.id, sourceKey: `debt-payment-reversal:${payment.id}`, reference: payment.document.reference, createdById: scope.actorId } });
  return { id: payment.id, type: "DEBT_PAYMENT", unitId: payment.document.unitId };
}
