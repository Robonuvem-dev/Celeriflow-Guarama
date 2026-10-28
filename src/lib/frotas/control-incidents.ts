import { and, eq, gte, isNull, lte, sum } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import * as f from "@/db/schema/fleet";
import { fleetJson, requiredFleetRecord } from "@/db/repositories/fleet/records";
import { readFleetPaidAmount } from "@/db/repositories/fleet/sources";
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
  const [entry] = await tx.select({ id: f.fleetCatalogEntries.id, code: f.fleetCatalogEntries.code, name: f.fleetCatalogEntries.name, details: f.fleetCatalogEntries.details, version: { reference: f.fleetCatalogVersions.reference, sourceReference: f.fleetCatalogVersions.sourceReference, sha256: f.fleetCatalogVersions.sha256 } }).from(f.fleetCatalogEntries).innerJoin(f.fleetCatalogVersions, eq(f.fleetCatalogVersions.id, f.fleetCatalogEntries.versionId)).where(and(eq(f.fleetCatalogEntries.id, input.ctbEntryId), eq(f.fleetCatalogVersions.kind, "CTB"), eq(f.fleetCatalogVersions.published, true))).limit(1);
  if (!entry) throw new FleetControlError("Selecione infração de catálogo CTB publicado.");
  const definition = z.object({ points: z.number(), amount: z.string().nullable(), validFrom: z.string(), validUntil: z.string().nullable(), nature: z.string(), article: z.string() }).passthrough().parse(entry.details);
  if (input.occurredAt < definition.validFrom || definition.validUntil && input.occurredAt > definition.validUntil) throw new FleetControlError("Infração não vigente na data informada.");
  if (input.occurredAt > todayInBrazil() || input.dueAt < input.occurredAt || new Decimal(input.amount).lte(0)) throw new FleetControlError("Datas/valor da multa incoerentes.");
  if (input.evidenceVersionId) await scopedFleetEvidence(tx, scope, input.evidenceVersionId, unit.id);
  const result = requiredFleetRecord(await tx.insert(f.fleetFines).values({ ...input, driverId: input.driverId || null, evidenceVersionId: input.evidenceVersionId || null, occurredAt: dateOnly(input.occurredAt), dueAt: dateOnly(input.dueAt), amount: new Decimal(input.amount), points: definition.points, ctbSnapshot: fleetJson({ ...definition, code: entry.code, description: entry.name, catalogReference: entry.version.reference, catalogSource: entry.version.sourceReference, catalogHash: entry.version.sha256 }), createdById: scope.actorId }).returning());
  return { id: result.id, type: "FINE", unitId: unit.id };
}
export async function changeFleetFineStatus(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.fineStatus.parse(raw), fine = requiredFleetRecord(await tx.select().from(f.fleetFines).where(eq(f.fleetFines.id, input.fineId)).limit(1));
  await lockFleetResources(tx, [`FINE:${fine.id}`, ...(fine.driverId ? [`DRIVER:${fine.driverId}`] : [])]); await scopedFleetUnit(tx, scope, fine.unitId, false);
  if ((await tx.select({ id: f.fleetFinePayments.id }).from(f.fleetFinePayments).where(and(eq(f.fleetFinePayments.fineId, fine.id), isNull(f.fleetFinePayments.reversedAt))).limit(1)).length) throw new FleetControlError("Preserve pagamentos registrados; estorne formalmente antes de cancelar/reabrir.");
  await tx.update(f.fleetFines).set({ status: input.status, reason: input.reason }).where(eq(f.fleetFines.id, fine.id));
  return { id: fine.id, type: "FINE", unitId: fine.unitId };
}
export async function recordFleetFinePayment(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.payFine.parse(raw);
  await lockFleetResources(tx, [`FINE:${input.fineId}`, ...(input.financialPaymentId ? [`FINANCIAL_PAYMENT:${input.financialPaymentId}`] : [])]);
  const fine = requiredFleetRecord(await tx.select().from(f.fleetFines).where(eq(f.fleetFines.id, input.fineId)).limit(1)); await scopedFleetUnit(tx, scope, fine.unitId, false);
  if (fine.status === "CANCELADA" || fine.status === "PAGA") throw new FleetControlError("Multa cancelada ou integralmente paga.");
  const amount = new Decimal(input.amount), [previous] = await tx.select({ amount: sum(f.fleetFinePayments.amount) }).from(f.fleetFinePayments).where(and(eq(f.fleetFinePayments.fineId, fine.id), isNull(f.fleetFinePayments.reversedAt)));
  const paid = new Decimal(previous.amount || 0).add(amount);
  if (amount.lte(0) || paid.gt(fine.amount) || input.paidAt > todayInBrazil() || dateOnly(input.paidAt) < fine.occurredAt) throw new FleetControlError("Parcela, total ou data de pagamento incoerentes.");
  await scopedFleetEvidence(tx, scope, input.proofVersionId, fine.unitId);
  if (input.financialPaymentId) {
    const payment = await readFleetPaidAmount(tx, input.financialPaymentId);
    const [allocated] = await tx.select({ amount: sum(f.fleetFinePayments.amount) }).from(f.fleetFinePayments).where(and(eq(f.fleetFinePayments.financialPaymentId, input.financialPaymentId), isNull(f.fleetFinePayments.reversedAt)));
    if (!payment || new Decimal(allocated.amount || 0).add(amount).gt(payment)) throw new FleetControlError("Pagamento financeiro não confirmado ou alocação superior ao pago.");
  }
  const result = requiredFleetRecord(await tx.insert(f.fleetFinePayments).values({ ...input, paidAt: dateOnly(input.paidAt), amount, financialPaymentId: input.financialPaymentId || null, createdById: scope.actorId }).returning());
  const expense = requiredFleetRecord(await tx.insert(f.fleetExpenses).values({ unitId: fine.unitId, nature: "MULTA", occurredAt: result.paidAt, amount, description: `Pagamento informado da multa ${fine.aitNumber}`, sourceType: "PAGAMENTO_MULTA", sourceId: result.id, sourceKey: `fine-payment:${result.id}`, reference: input.financialPaymentId || input.proofVersionId, createdById: scope.actorId }).returning());
  await tx.update(f.fleetFinePayments).set({ expenseId: expense.id }).where(eq(f.fleetFinePayments.id, result.id));
  await tx.update(f.fleetFines).set({ status: paid.eq(fine.amount) ? "PAGA" : "PAGA_PARCIAL" }).where(eq(f.fleetFines.id, fine.id));
  return { id: result.id, type: "FINE_PAYMENT", unitId: fine.unitId };
}
export async function reverseFleetFinePayment(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.reverseFinePayment.parse(raw), payment = requiredFleetRecord(await tx.select().from(f.fleetFinePayments).where(eq(f.fleetFinePayments.id, input.paymentId)).limit(1));
  const fine = requiredFleetRecord(await tx.select().from(f.fleetFines).where(eq(f.fleetFines.id, payment.fineId)).limit(1));
  await lockFleetResources(tx, [`FINE:${payment.fineId}`]); await scopedFleetUnit(tx, scope, fine.unitId, false);
  if (payment.reversedAt) throw new FleetControlError("Parcela já estornada.");
  await tx.update(f.fleetFinePayments).set({ reversedAt: new Date() }).where(eq(f.fleetFinePayments.id, payment.id));
  await tx.insert(f.fleetExpenses).values({ unitId: fine.unitId, nature: "MULTA", occurredAt: new Date(), amount: payment.amount.neg(), description: `Estorno da parcela da multa ${fine.aitNumber}: ${input.reason}`, sourceType: "ESTORNO_MULTA", sourceId: payment.id, sourceKey: `fine-payment-reversal:${payment.id}`, createdById: scope.actorId });
  const [paid] = await tx.select({ amount: sum(f.fleetFinePayments.amount) }).from(f.fleetFinePayments).where(and(eq(f.fleetFinePayments.fineId, payment.fineId), isNull(f.fleetFinePayments.reversedAt)));
  await tx.update(f.fleetFines).set({ status: new Decimal(paid.amount || 0).gt(0) ? "PAGA_PARCIAL" : "PENDENTE" }).where(eq(f.fleetFines.id, payment.fineId));
  return { id: payment.id, type: "FINE_PAYMENT", unitId: fine.unitId };
}
export async function registerFleetOccurrence(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.occurrence.parse(raw); await scopedFleetUnit(tx, scope, input.unitId, false);
  if (input.occurredAt > todayInBrazil()) throw new FleetControlError("Ocorrência não pode ter data futura.");
  const result = requiredFleetRecord(await tx.insert(f.fleetOccurrences).values({ ...input, occurredAt: dateOnly(input.occurredAt), involvedValue: input.involvedValue ? new Decimal(input.involvedValue) : null, latitude: input.latitude === null ? null : new Decimal(input.latitude), longitude: input.longitude === null ? null : new Decimal(input.longitude), createdById: scope.actorId }).returning());
  return { id: result.id, type: "OCCURRENCE", unitId: result.unitId };
}
export async function openFleetClaim(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.claim.parse(raw);
  await lockFleetResources(tx, [`OCCURRENCE:${input.occurrenceId}`]);
  const occurrence = requiredFleetRecord(await tx.select().from(f.fleetOccurrences).where(eq(f.fleetOccurrences.id, input.occurrenceId)).limit(1)); await scopedFleetUnit(tx, scope, occurrence.unitId, false);
  if (occurrence.type !== "ACIDENTE") throw new FleetControlError("Sinistro deve ser originado de ocorrência de acidente.");
  const policies = await tx.select().from(f.fleetDocuments).where(and(eq(f.fleetDocuments.unitId, occurrence.unitId), eq(f.fleetDocuments.kind, "SEGURO"), lte(f.fleetDocuments.startsAt, occurrence.occurredAt), gte(f.fleetDocuments.dueAt, occurrence.occurredAt)));
  const policy = input.policyDocumentId ? policies.find((row) => row.id === input.policyDocumentId) : policies.length === 1 ? policies[0] : null;
  if (input.policyDocumentId && !policy || policies.length > 1 && !policy) throw new FleetControlError("Selecione a apólice de origem quando existir mais de uma vigente.");
  if (input.workshopProviderId) await fleetProvider(tx, input.workshopProviderId, "OFICINA");
  const result = requiredFleetRecord(await tx.insert(f.fleetClaims).values({ unitId: occurrence.unitId, occurrenceId: occurrence.id, responsibility: input.responsibility, policyDocumentId: policy?.id, policySnapshot: fleetJson(policy ? { insurerId: policy.insurerId, insurerName: policy.insurerName, policyNumber: policy.reference, startsAt: policy.startsAt?.toISOString(), dueAt: policy.dueAt.toISOString(), type: policy.type } : { status: "SEM_APOLICE_VIGENTE_IDENTIFICADA" }), workshopProviderId: input.workshopProviderId || null, parties: input.parties, createdById: scope.actorId }).returning());
  return { id: result.id, type: "CLAIM", unitId: result.unitId };
}
export async function changeFleetClaim(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.claimStatus.parse(raw), claim = requiredFleetRecord(await tx.select().from(f.fleetClaims).where(eq(f.fleetClaims.id, input.claimId)).limit(1));
  await scopedFleetUnit(tx, scope, claim.unitId, false);
  if (input.workshopProviderId) await fleetProvider(tx, input.workshopProviderId, "OFICINA");
  await tx.update(f.fleetClaims).set({ status: input.status, workshopProviderId: input.workshopProviderId || null }).where(eq(f.fleetClaims.id, claim.id));
  return { id: claim.id, type: "CLAIM", unitId: claim.unitId };
}
