import { Prisma } from "@prisma/client";
import type { FleetScope } from "./service";
import { controlSchemas } from "./control-policy";
import { FleetControlError, lockFleetResources, scopedFleetDriver, scopedFleetEvidence, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { fleetProvider } from "./control-fuel";
import { dateOnly, todayInBrazil } from "./contract";

export async function registerFleetFine(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.fine.parse(raw);
  await lockFleetResources(tx, [`UNIT:${input.unitId}`, ...(input.driverId ? [`DRIVER:${input.driverId}`] : [])]);
  const unit = await scopedFleetUnit(tx, scope, input.unitId, false);
  if (input.driverId) await scopedFleetDriver(tx, scope, input.driverId, unit.departmentId!);
  const entry = await tx.fleetCatalogEntry.findFirst({ where: { id: input.ctbEntryId, version: { kind: "CTB", published: true } }, include: { version: true } });
  if (!entry) throw new FleetControlError("Selecione infração de catálogo CTB publicado.");
  const definition = entry.details as { points: number; amount: string; validFrom: string; validUntil: string | null; nature: string; article: string };
  if (input.occurredAt < definition.validFrom || definition.validUntil && input.occurredAt > definition.validUntil) throw new FleetControlError("Infração não vigente na data informada.");
  if (input.occurredAt > todayInBrazil() || input.dueAt < input.occurredAt || new Prisma.Decimal(input.amount).lte(0)) throw new FleetControlError("Datas/valor da multa incoerentes.");
  if (input.evidenceVersionId) await scopedFleetEvidence(tx, scope, input.evidenceVersionId, unit.id);
  const result = await tx.fleetFine.create({ data: { ...input, driverId: input.driverId || null, evidenceVersionId: input.evidenceVersionId || null, occurredAt: dateOnly(input.occurredAt), dueAt: dateOnly(input.dueAt), amount: input.amount, points: definition.points, ctbSnapshot: { ...definition, code: entry.code, description: entry.name, catalogReference: entry.version.reference, catalogSource: entry.version.sourceReference, catalogHash: entry.version.sha256 }, createdById: scope.actorId } });
  return { id: result.id, type: "FINE", unitId: unit.id };
}
export async function changeFleetFineStatus(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.fineStatus.parse(raw), fine = await tx.fleetFine.findUniqueOrThrow({ where: { id: input.fineId } });
  await lockFleetResources(tx, [`FINE:${fine.id}`, ...(fine.driverId ? [`DRIVER:${fine.driverId}`] : [])]); await scopedFleetUnit(tx, scope, fine.unitId, false);
  if (await tx.fleetFinePayment.count({ where: { fineId: fine.id, reversedAt: null } })) throw new FleetControlError("Preserve pagamentos registrados; estorne formalmente antes de cancelar/reabrir.");
  await tx.fleetFine.update({ where: { id: fine.id }, data: { status: input.status, reason: input.reason } });
  return { id: fine.id, type: "FINE", unitId: fine.unitId };
}
export async function recordFleetFinePayment(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.payFine.parse(raw);
  await lockFleetResources(tx, [`FINE:${input.fineId}`, ...(input.financialPaymentId ? [`FINANCIAL_PAYMENT:${input.financialPaymentId}`] : [])]);
  const fine = await tx.fleetFine.findUniqueOrThrow({ where: { id: input.fineId } }); await scopedFleetUnit(tx, scope, fine.unitId, false);
  if (fine.status === "CANCELADA" || fine.status === "PAGA") throw new FleetControlError("Multa cancelada ou integralmente paga.");
  const amount = new Prisma.Decimal(input.amount), previous = await tx.fleetFinePayment.aggregate({ where: { fineId: fine.id, reversedAt: null }, _sum: { amount: true } });
  const paid = (previous._sum.amount || new Prisma.Decimal(0)).add(amount);
  if (amount.lte(0) || paid.gt(fine.amount) || input.paidAt > todayInBrazil() || dateOnly(input.paidAt) < fine.occurredAt) throw new FleetControlError("Parcela, total ou data de pagamento incoerentes.");
  await scopedFleetEvidence(tx, scope, input.proofVersionId, fine.unitId);
  if (input.financialPaymentId) {
    const payment = await tx.payment.findFirst({ where: { id: input.financialPaymentId, status: "Pago" }, select: { valueDecimal: true } });
    const allocated = await tx.fleetFinePayment.aggregate({ where: { financialPaymentId: input.financialPaymentId, reversedAt: null }, _sum: { amount: true } });
    if (!payment?.valueDecimal || (allocated._sum.amount || new Prisma.Decimal(0)).add(amount).gt(payment.valueDecimal)) throw new FleetControlError("Pagamento financeiro não confirmado ou alocação superior ao pago.");
  }
  const result = await tx.fleetFinePayment.create({ data: { ...input, paidAt: dateOnly(input.paidAt), amount, financialPaymentId: input.financialPaymentId || null, createdById: scope.actorId } });
  const expense = await tx.fleetExpense.create({ data: { unitId: fine.unitId, nature: "MULTA", occurredAt: result.paidAt, amount, description: `Pagamento informado da multa ${fine.aitNumber}`, sourceType: "PAGAMENTO_MULTA", sourceId: result.id, sourceKey: `fine-payment:${result.id}`, reference: input.financialPaymentId || input.proofVersionId, createdById: scope.actorId } });
  await tx.fleetFinePayment.update({ where: { id: result.id }, data: { expenseId: expense.id } });
  await tx.fleetFine.update({ where: { id: fine.id }, data: { status: paid.eq(fine.amount) ? "PAGA" : "PAGA_PARCIAL" } });
  return { id: result.id, type: "FINE_PAYMENT", unitId: fine.unitId };
}
export async function reverseFleetFinePayment(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.reverseFinePayment.parse(raw), payment = await tx.fleetFinePayment.findUniqueOrThrow({ where: { id: input.paymentId }, include: { fine: true } });
  await lockFleetResources(tx, [`FINE:${payment.fineId}`]); await scopedFleetUnit(tx, scope, payment.fine.unitId, false);
  if (payment.reversedAt) throw new FleetControlError("Parcela já estornada.");
  await tx.fleetFinePayment.update({ where: { id: payment.id }, data: { reversedAt: new Date() } });
  await tx.fleetExpense.create({ data: { unitId: payment.fine.unitId, nature: "MULTA", occurredAt: new Date(), amount: payment.amount.neg(), description: `Estorno da parcela da multa ${payment.fine.aitNumber}: ${input.reason}`, sourceType: "ESTORNO_MULTA", sourceId: payment.id, sourceKey: `fine-payment-reversal:${payment.id}`, createdById: scope.actorId } });
  const paid = await tx.fleetFinePayment.aggregate({ where: { fineId: payment.fineId, reversedAt: null }, _sum: { amount: true } });
  await tx.fleetFine.update({ where: { id: payment.fineId }, data: { status: paid._sum.amount?.gt(0) ? "PAGA_PARCIAL" : "PENDENTE" } });
  return { id: payment.id, type: "FINE_PAYMENT", unitId: payment.fine.unitId };
}
export async function registerFleetOccurrence(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.occurrence.parse(raw); await scopedFleetUnit(tx, scope, input.unitId, false);
  if (input.occurredAt > todayInBrazil()) throw new FleetControlError("Ocorrência não pode ter data futura.");
  const result = await tx.fleetOccurrence.create({ data: { ...input, occurredAt: dateOnly(input.occurredAt), involvedValue: input.involvedValue ? new Prisma.Decimal(input.involvedValue) : null, latitude: input.latitude === null ? null : new Prisma.Decimal(input.latitude), longitude: input.longitude === null ? null : new Prisma.Decimal(input.longitude), createdById: scope.actorId } });
  return { id: result.id, type: "OCCURRENCE", unitId: result.unitId };
}
export async function openFleetClaim(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.claim.parse(raw);
  await lockFleetResources(tx, [`OCCURRENCE:${input.occurrenceId}`]);
  const occurrence = await tx.fleetOccurrence.findUniqueOrThrow({ where: { id: input.occurrenceId } }); await scopedFleetUnit(tx, scope, occurrence.unitId, false);
  if (occurrence.type !== "ACIDENTE") throw new FleetControlError("Sinistro deve ser originado de ocorrência de acidente.");
  const policies = await tx.fleetDocument.findMany({ where: { unitId: occurrence.unitId, kind: "SEGURO", startsAt: { lte: occurrence.occurredAt }, dueAt: { gte: occurrence.occurredAt } } });
  const policy = input.policyDocumentId ? policies.find((row) => row.id === input.policyDocumentId) : policies.length === 1 ? policies[0] : null;
  if (input.policyDocumentId && !policy || policies.length > 1 && !policy) throw new FleetControlError("Selecione a apólice de origem quando existir mais de uma vigente.");
  if (input.workshopProviderId) await fleetProvider(tx, input.workshopProviderId, "OFICINA");
  const result = await tx.fleetClaim.create({ data: { unitId: occurrence.unitId, occurrenceId: occurrence.id, responsibility: input.responsibility, policyDocumentId: policy?.id, policySnapshot: policy ? { insurerId: policy.insurerId, insurerName: policy.insurerName, policyNumber: policy.reference, startsAt: policy.startsAt?.toISOString(), dueAt: policy.dueAt.toISOString(), type: policy.type } : { status: "SEM_APOLICE_VIGENTE_IDENTIFICADA" }, workshopProviderId: input.workshopProviderId || null, parties: input.parties, createdById: scope.actorId } });
  return { id: result.id, type: "CLAIM", unitId: result.unitId };
}
export async function changeFleetClaim(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.claimStatus.parse(raw), claim = await tx.fleetClaim.findUniqueOrThrow({ where: { id: input.claimId } });
  await scopedFleetUnit(tx, scope, claim.unitId, false);
  if (input.workshopProviderId) await fleetProvider(tx, input.workshopProviderId, "OFICINA");
  await tx.fleetClaim.update({ where: { id: claim.id }, data: { status: input.status, workshopProviderId: input.workshopProviderId || null } });
  return { id: claim.id, type: "CLAIM", unitId: claim.unitId };
}
