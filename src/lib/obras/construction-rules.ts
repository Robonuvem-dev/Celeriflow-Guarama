import { Prisma } from "@prisma/client";
import { z } from "zod";

const id = z.string().trim().min(1);
export const constructionDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const d = new Date(`${value}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; }, "Data inválida.");
const optionalDate = z.union([z.literal(""), constructionDate]);
const area = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/);
export const professionalTypes = { ENGINEER: "Engenheiro", ARCHITECT: "Arquiteto", BROKER: "Corretor" } as const;
export const professionalSchema = z.object({ id: id.optional(), personId: id, professionalType: z.enum(["ENGINEER", "ARCHITECT", "BROKER"]), council: z.enum(["CREA", "CAU", "CRECI"]), registration: z.string().trim().min(2).max(60).transform((value) => value.toUpperCase()), startsAt: constructionDate, endsAt: optionalDate, isActive: z.boolean() }).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, "Vigência invertida.").refine((value) => ({ ENGINEER: "CREA", ARCHITECT: "CAU", BROKER: "CRECI" })[value.professionalType] === value.council, "Conselho incompatível com a profissão.");
export const employerSchema = z.object({ id: id.optional(), professionalId: id, companyId: id, startsAt: constructionDate, endsAt: optionalDate, isActive: z.boolean() }).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, "Vigência invertida.");
export const fieldDefinitionSchema = z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,59}$/, "Use uma chave iniciada por letra, sem espaços."), label: z.string().trim().min(2).max(160), type: z.enum(["TEXT", "NUMBER", "DATE", "CHOICE"]), required: z.boolean(), options: z.array(z.string().trim().min(1).max(100)).max(100) }).refine((value) => value.type !== "CHOICE" || value.options.length > 0, "Informe as opções do campo de seleção.");
export const definitionSchema = z.object({ fields: z.array(fieldDefinitionSchema).max(50), checks: z.array(z.object({ key: id.max(60), label: z.string().trim().min(2).max(250), required: z.boolean() })).max(100), documents: z.array(z.object({ label: z.string().trim().min(2).max(160), required: z.boolean() })).max(50) }).superRefine((value, ctx) => {
  for (const [name, keys] of [["fields", value.fields.map((field) => field.key)], ["checks", value.checks.map((check) => check.key)]] as const) if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: [name], message: "Chaves duplicadas na definição." });
  if (new Set(value.documents.map((document) => document.label)).size !== value.documents.length) ctx.addIssue({ code: "custom", path: ["documents"], message: "Documentos duplicados na definição." });
});
export const definitionKinds = { FORM: "Formulário de abertura", VIABILITY: "Viabilidade", PERMIT: "Análise de alvará", INSPECTION: "Vistoria", COMPLETION: "Conclusão" } as const;
export const definitionPublicationSchema = z.object({ kind: z.enum(["FORM", "VIABILITY", "PERMIT", "INSPECTION", "COMPLETION"]), definition: definitionSchema });
export const distributionSchema = z.object({ departmentId: id, strategy: z.enum(["SECTOR", "USER", "MANAGER", "LOWEST_LOAD"]), employeeId: z.string() }).refine((value) => value.strategy !== "USER" || Boolean(value.employeeId), "Selecione o usuário responsável.");
export const zoneSchema = z.object({ code: z.string().trim().min(2).max(60).transform((value) => value.toUpperCase()), name: z.string().trim().min(2).max(160), legalBasis: z.string().trim().min(3).max(2000), startsAt: constructionDate, endsAt: optionalDate, allowedPurposeIds: z.array(id).min(1).max(100), allowedCategories: z.array(z.enum(["BUILDING", "SUBDIVISION"])).min(1), minimumLandArea: area, maxFloorAreaRatio: z.string().regex(/^\d{1,6}(\.\d{1,4})?$/).refine((value) => new Prisma.Decimal(value).greaterThan(0)), automatic: z.boolean() }).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, "Vigência invertida.");

export function validateConstructionFields(definition: unknown, values: unknown): Record<string, string> {
  const form = definitionSchema.parse(definition);
  const parsed = z.record(z.string(), z.string().max(4000)).parse(values);
  const keys = new Set(form.fields.map((field) => field.key));
  if (Object.keys(parsed).some((key) => !keys.has(key))) throw new Error("Há campos não previstos no formulário publicado.");
  const result: Record<string, string> = {};
  for (const field of form.fields) {
    const value = (parsed[field.key] || "").trim();
    if (field.required && !value) throw new Error(`${field.label}: campo obrigatório.`);
    if (value && field.type === "NUMBER" && !/^-?\d{1,14}(\.\d{1,6})?$/.test(value)) throw new Error(`${field.label}: número inválido.`);
    if (value && field.type === "DATE" && !constructionDate.safeParse(value).success) throw new Error(`${field.label}: data inválida.`);
    if (value && field.type === "CHOICE" && !field.options.includes(value)) throw new Error(`${field.label}: opção inválida.`);
    result[field.key] = value;
  }
  return result;
}

export function evaluateConstructionViability(input: { category: string; purposeId: string; landArea: string; proposedArea: string; today: string }, rawRule: unknown) {
  const rule = zoneSchema.parse(rawRule);
  const land = new Prisma.Decimal(area.parse(input.landArea));
  const proposed = new Prisma.Decimal(area.parse(input.proposedArea));
  constructionDate.parse(input.today);
  const reasons: string[] = [];
  const limit = land.mul(rule.maxFloorAreaRatio);
  const active = input.today >= rule.startsAt && (!rule.endsAt || input.today <= rule.endsAt);
  if (!active || !rule.automatic || land.isZero()) return { outcome: "MANUAL" as const, reasons: [!active ? "Regra fora de vigência." : !rule.automatic ? "Zoneamento exige análise técnica." : "Área territorial não informada."], limit: limit.toFixed(4) };
  if (!rule.allowedPurposeIds.includes(input.purposeId)) reasons.push("Finalidade não permitida no zoneamento.");
  if (!rule.allowedCategories.includes(input.category as "BUILDING" | "SUBDIVISION")) reasons.push("Categoria não permitida no zoneamento.");
  if (land.lessThan(rule.minimumLandArea)) reasons.push("Terreno inferior à área mínima.");
  if (proposed.greaterThan(limit)) reasons.push("Área proposta supera o coeficiente de aproveitamento.");
  return { outcome: reasons.length ? "DENIED" as const : "APPROVED" as const, reasons, limit: limit.toFixed(4) };
}
