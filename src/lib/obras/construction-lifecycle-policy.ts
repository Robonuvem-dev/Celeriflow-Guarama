import { Decimal } from "@/db/decimal";
import { z } from "zod";
import { constructionDate, definitionSchema, validateConstructionFields } from "./construction-rules";

const id = z.string().trim().min(1);
const area = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, "Área com até quatro casas decimais.");
const base = z.object({ caseId: id, requestKey: z.uuid(), serviceRequestId: z.union([z.literal(""), id]).optional() });
const evidence = { checks: z.record(z.string(), z.boolean()), documentIds: z.record(z.string(), id), fieldValues: z.record(z.string(), z.string().max(4000)) };
/** F5 publishes as PUBLISHED and retires corrected/renewed originals as SUPERSEDED. */
export function constructionCurrentPublishedArtifactWhere(now = new Date()) {
  return { status: "PUBLISHED", publishedAt: { not: null, lte: now }, OR: [{ validUntil: null }, { validUntil: { gte: now } }] };
}
export const inspectionPlanSchema = base.extend({ reviewId: id, inspectionTypeIds: z.array(id).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "Tipos repetidos.") });
export const lifecycleStartSchema = base.extend({ startedAt: constructionDate, notes: z.string().trim().min(3).max(4000), documentIds: z.array(id).min(1).max(50) });
export const inspectionRequestSchema = base.extend({ inspectionTypeId: id, scheduledAt: z.union([z.literal(""), constructionDate]), notes: z.string().trim().min(3).max(4000) });
export const inspectionResultSchema = base.extend({ inspectionId: id, inspectedAt: constructionDate, decision: z.enum(["APPROVED", "FAILED"]), notes: z.string().trim().min(3).max(10000), requirementNote: z.string().trim().max(4000).optional(), ...evidence }).refine((value) => value.decision !== "FAILED" || (value.requirementNote || "").length >= 10, "Descreva a exigência de ajuste da obra ou parcelamento (mínimo 10 caracteres).");
export const completionSchema = base.extend({ kind: z.enum(["PARTIAL", "TOTAL"]), completedAt: constructionDate, area, notes: z.string().trim().min(3).max(4000), ...evidence });
export const propertyUpdateSchema = base.extend({ completionId: id, processTypeId: id, subjectId: id, changes: z.array(z.object({ realEstateId: id, expectedBuiltArea: area, builtArea: area, propertyUse: z.string().trim().min(2).max(100) })).min(1).max(100).refine((items) => new Set(items.map((item) => item.realEstateId)).size === items.length, "Imóveis repetidos.") });

export function calculateCompletionBalance(total: string | { toString(): string }, previous: (string | { toString(): string })[], amount: string, kind: "PARTIAL" | "TOTAL") {
  const approved = new Decimal(String(total));
  const increment = new Decimal(area.parse(amount));
  const cumulative = previous.reduce<Decimal>((sum, value) => sum.plus(String(value)), new Decimal(0)).plus(increment);
  const remaining = approved.minus(cumulative);
  if (!increment.greaterThan(0) || remaining.lessThan(0)) throw new Error("Área concluída deve ser positiva e não pode exceder a área aprovada.");
  if (kind === "TOTAL" && !remaining.isZero()) throw new Error("Conclusão total deve quitar exatamente o saldo de área.");
  if (kind === "PARTIAL" && remaining.isZero()) throw new Error("Use conclusão total para o último saldo.");
  return { area: increment.toFixed(4), cumulativeArea: cumulative.toFixed(4), remainingArea: remaining.toFixed(4) };
}

export function validateLifecycleEvidence(rawDefinition: unknown, input: { checks: Record<string, boolean>; documentIds: Record<string, string>; fieldValues: Record<string, string> }, approved: boolean) {
  const definition = definitionSchema.parse(rawDefinition);
  const fields = validateConstructionFields(definition, input.fieldValues);
  if (Object.keys(input.checks).some((key) => !definition.checks.some((check) => check.key === key))) throw new Error("Critério não previsto no checklist.");
  if (Object.keys(input.documentIds).some((key) => !definition.documents.some((document) => document.label === key))) throw new Error("Documento não previsto no checklist.");
  if (approved && definition.checks.some((check) => check.required && input.checks[check.key] !== true)) throw new Error("Atenda todos os critérios obrigatórios.");
  if (approved && definition.documents.some((document) => document.required && !input.documentIds[document.label])) throw new Error("Vincule todos os documentos obrigatórios.");
  return { fields, checks: input.checks, documentIds: input.documentIds };
}

export function assertMandatoryInspections(types: { id: string }[], inspections: { inspectionTypeId: string; status: string }[]) {
  if (!types.length) throw new Error("Defina o plano de vistorias obrigatórias no deferimento.");
  for (const type of types) {
    const latest = inspections.find((inspection) => inspection.inspectionTypeId === type.id);
    if (!latest || latest.status !== "APPROVED") throw new Error("Conclua e aprove todas as vistorias obrigatórias; nova pendência invalida o aceite anterior.");
  }
}
