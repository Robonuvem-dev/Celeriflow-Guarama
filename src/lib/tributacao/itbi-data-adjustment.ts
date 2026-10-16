import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { calculateItbi } from "./s3-engine";
import { taxScopeSnapshot } from "./scope";
import { attributeItbiHistory } from "./itbi-history";

export const itbiDataAdjustmentSchema = z.object({
  declaredPropertyValue: z.string().regex(/^\d{1,14}(?:\.\d{1,2})?$/).refine(value => new Prisma.Decimal(value).gt(0), "Informe valor declarado positivo."),
  transmittedFraction: z.string().regex(/^\d{1,3}(?:\.\d{1,6})?$/).refine(value => new Prisma.Decimal(value).gt(0) && new Prisma.Decimal(value).lte(100), "Fração deve estar entre 0 e 100%."),
  registryOffice: z.string().trim().min(1).max(240),
}).strict();

/** The accepted response changes the pre-assessment record and keeps both positions in the event. */
export async function applyItbiDataAdjustment(tx: Prisma.TransactionClient, actor: TaxActor, declarationId: string, responseId: string, raw: unknown) {
  const input = itbiDataAdjustmentSchema.parse(raw);
  await attributeItbiHistory(tx, actor);
  const declaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: declarationId }, include: { parties: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
  if (declaration.assessmentId || declaration.guideId || declaration.documentId || declaration.cadastralUpdatedAt || !["RASCUNHO", "PROTOCOLADA", "EM_ANALISE"].includes(declaration.status)) throw new Error("Readequação cadastral exige declaração em análise, antes da constituição do crédito.");
  const snapshot = taxScopeSnapshot(declaration.calculationSnapshot);
  const buyers = declaration.parties.filter(party => party.role === "ADQUIRENTE");
  const calculation = calculateItbi({
    propertyValue: snapshot.valuationMemory ? String(snapshot.propertyValue) : input.declaredPropertyValue,
    transmittedFractionPercent: input.transmittedFraction,
    ratePercent: declaration.appliedRate,
    buyerSharesPercent: buyers.map(party => party.participationPercent ?? 0),
  });
  const before = { declaredPropertyValue: declaration.declaredPropertyValue.toFixed(2), transmittedFraction: declaration.transmittedFraction.toString(), registryOffice: declaration.registryOffice, taxableBase: declaration.taxableBase.toFixed(2), taxAmount: declaration.taxAmount.toFixed(2), calculationSnapshot: declaration.calculationSnapshot };
  const after = { ...snapshot, declaredPropertyValue: new Prisma.Decimal(input.declaredPropertyValue).toFixed(2), propertyValue: calculation.propertyValue.toFixed(2), fractionPercent: calculation.fraction.toString(), taxableBase: calculation.taxableBase.toFixed(2), taxAmount: calculation.taxAmount.toFixed(2), adjustmentResponseId: responseId, allocations: calculation.allocations.map((allocation, index) => ({ taxpayerId: buyers[index].taxpayerId, sharePercent: allocation.sharePercent.toString(), transmittedValue: allocation.transmittedValue.toFixed(2), taxAmount: allocation.taxAmount.toFixed(2) })) };
  await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: {
    declaredPropertyValue: input.declaredPropertyValue, transmittedFraction: calculation.fraction, registryOffice: input.registryOffice,
    transmissionScope: calculation.fraction.eq(100) ? "INTEGRAL" : "PARCIAL", taxableBase: calculation.taxableBase, taxAmount: calculation.taxAmount,
    calculationSnapshot: after as Prisma.InputJsonObject,
    events: { create: { eventType: "DADOS_READEQUADOS", description: "Dados da resposta externa aplicados após conferência fiscal.", actorUsuarioId: actor.usuarioId, payload: { responseId, before, after: { ...input, calculationSnapshot: after } } as Prisma.InputJsonObject } },
  } });
  await tx.taxAuditLog.create({ data: { action: "APPLY_ITBI_DATA_ADJUSTMENT", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { responseId, before, after: input } as Prisma.InputJsonObject } });
}
