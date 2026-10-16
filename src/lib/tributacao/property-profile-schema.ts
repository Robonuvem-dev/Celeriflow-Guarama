import { z } from "zod";

export const inscriptionSegmentSchema = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), label: z.string().trim().min(1).max(120), width: z.number().int().min(1).max(30), numeric: z.boolean() });
export const propertyRegistrationPolicySchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), segments: z.array(inscriptionSegmentSchema).min(1).max(12), separator: z.string().regex(/^[.\-/ ]?$/), requireProcess: z.boolean(), restrictRiskAreas: z.boolean(), legalBasis: z.string().trim().min(1).max(4000) }).refine(input => new Set(input.segments.map(segment => segment.key)).size === input.segments.length, "As chaves da inscrição devem ser distintas.").refine(input => input.segments.reduce((total, segment) => total + segment.width, 0) + input.separator.length * (input.segments.length - 1) <= 120, "A inscrição deve ter no máximo 120 caracteres.");
const decimal = z.string().trim().regex(/^\d+(?:\.\d{1,6})?$/).max(30);
export const propertyAddressSchema = z.object({ street: z.string().trim().min(1).max(240), number: z.string().max(40), complement: z.string().max(240), neighborhood: z.string().max(240), city: z.string().trim().min(1).max(240), state: z.string().regex(/^[A-Z]{2}$/), zipCode: z.string().max(12) });
export const propertyProfileSchema = z.object({ propertyId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), expectedUpdatedAt: z.iso.datetime(), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), kind: z.enum(["Terreno", "Unidade", "Rural"]), parentId: z.string().nullable(), unitMode: z.enum(["AUTONOMA", "ENGLOBADA"]).nullable(), owners: z.array(z.object({ taxpayerId: z.string().min(1), sharePercent: decimal, primary: z.boolean() })).min(1).max(100), inscriptionParts: z.record(z.string(), z.string().max(30)), correspondenceAddress: propertyAddressSchema, latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), floors: z.number().int().min(0).max(1000), frontSetback: decimal, sideSetback: decimal, riskArea: z.boolean(), environmentalProtection: z.boolean(), documentIds: z.array(z.string().min(1)).max(100), processId: z.string().nullable(), reason: z.string().trim().min(1).max(4000) }).refine(input => input.kind !== "Unidade" || Boolean(input.parentId && input.parentId !== input.propertyId && input.unitMode), "Uma unidade exige terreno principal e modalidade de englobamento.").refine(input => input.kind === "Unidade" || input.parentId === null && input.unitMode === null, "Somente unidades podem ter terreno principal e modalidade.").refine(input => (input.latitude === null) === (input.longitude === null), "Informe latitude e longitude juntas.").refine(input => new Set(input.owners.map(owner => owner.taxpayerId)).size === input.owners.length && input.owners.filter(owner => owner.primary).length === 1, "Informe proprietários distintos e exatamente um titular principal.");

export function formatPropertyInscription(policy: Pick<z.infer<typeof propertyRegistrationPolicySchema>, "segments" | "separator">, parts: Record<string, string>) {
  const keys = new Set(policy.segments.map(segment => segment.key));
  if (Object.keys(parts).some(key => !keys.has(key))) throw new Error("A inscrição contém componentes não configurados.");
  return policy.segments.map(segment => {
    const value = (parts[segment.key] ?? "").trim();
    if (!value || value.length > segment.width || (segment.numeric ? !/^\d+$/.test(value) : !/^[a-zA-Z0-9]+$/.test(value))) throw new Error(`${segment.label}: informe até ${segment.width} caracteres ${segment.numeric ? "numéricos" : "alfanuméricos"}.`);
    return value.padStart(segment.width, "0");
  }).join(policy.separator);
}

export function parsePropertyInscription(policy: Pick<z.infer<typeof propertyRegistrationPolicySchema>, "segments" | "separator">, inscription: string) {
  const parts: Record<string,string>={}; let offset=0;
  for(const [index,segment] of policy.segments.entries()) {
    parts[segment.key]=inscription.slice(offset,offset+segment.width);offset+=segment.width;
    if(index<policy.segments.length-1) {if(inscription.slice(offset,offset+policy.separator.length)!==policy.separator) throw new Error("Inscrição não corresponde à composição configurada.");offset+=policy.separator.length;}
  }
  if(offset!==inscription.length || formatPropertyInscription(policy,parts)!==inscription) throw new Error("Inscrição não corresponde à composição configurada.");
  return parts;
}
