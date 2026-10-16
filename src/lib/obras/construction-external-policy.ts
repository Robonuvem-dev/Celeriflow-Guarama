import { z } from "zod";
import { constructionCaseSchema } from "./construction-policy";
import { definitionSchema } from "./construction-rules";

const ids = z.array(z.string().trim().min(1)).min(1).max(100).refine((values) => new Set(values).size === values.length, "Não repita referências.");
export const constructionAuthorizationSchema = z.object({ requestKey: z.uuid(), identityId: z.string().min(1), personId: z.string(), companyId: z.string(), propertyIds: ids, subjectIds: ids, authorizationReason: z.string().trim().min(10).max(4000), expiresAt: z.iso.datetime() }).refine((data) => Boolean(data.personId) !== Boolean(data.companyId), "Informe um único requerente.");
export const constructionExternalOpeningSchema = constructionCaseSchema.and(z.object({ applicationId: z.string().min(1), termId: z.string().min(1), acceptTerm: z.literal(true), documentIds: z.record(z.string(), z.string().min(1)), checks: z.record(z.string(), z.boolean()).default({}) }));

export function assertExternalApplicationScope(application: { identityId: string; personId: string | null; companyId: string | null; propertyIds: string[]; subjectIds: string[]; expiresAt: Date; revokedAt: Date | null }, identityId: string, input?: { personId: string; companyId: string; propertyIds: string[]; subjectId: string }, now = new Date()) {
  if (application.identityId !== identityId || application.revokedAt || application.expiresAt <= now) throw new Error("Autorização indisponível ou vencida.");
  if (input && ((application.personId || "") !== input.personId || (application.companyId || "") !== input.companyId || !application.subjectIds.includes(input.subjectId) || input.propertyIds.length !== application.propertyIds.length || input.propertyIds.some((id) => !application.propertyIds.includes(id)))) throw new Error("Requerente, imóveis ou assunto fora da autorização administrativa.");
}

export function validateExternalOpeningEvidence(rawDefinition: unknown, documents: Record<string, string>, checks: Record<string, boolean>) {
  const definition = definitionSchema.parse(rawDefinition);
  if (Object.keys(documents).some((label) => !definition.documents.some((doc) => doc.label === label))) throw new Error("Documento não previsto no formulário.");
  if (definition.documents.some((doc) => doc.required && !documents[doc.label])) throw new Error("Envie todos os documentos obrigatórios antes de protocolar.");
  if (Object.keys(checks).some((key) => !definition.checks.some((check) => check.key === key)) || definition.checks.some((check) => check.required && checks[check.key] !== true)) throw new Error("Confirme todos os critérios obrigatórios do formulário.");
}
