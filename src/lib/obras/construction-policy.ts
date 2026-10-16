import { Prisma } from "@prisma/client";
import { z } from "zod";

export const constructionCatalogs = { PERMIT_TYPE: "Tipos de alvará", PURPOSE: "Finalidades", CONSTRUCTION_TYPE: "Tipos construtivos", SUBDIVISION_TYPE: "Parcelamentos", INSPECTION_TYPE: "Tipos de vistoria" } as const;
export const constructionRoles = { ANALYST: "Analista", INSPECTOR: "Fiscal", MANAGER: "Gestor" } as const;
export const areaLabels = { existingArea: "Existente", expandedArea: "Ampliada", irregularArea: "Irregular", renovationArea: "Reforma", demolitionArea: "A demolir" } as const;
export const areaKeys = Object.keys(areaLabels) as (keyof typeof areaLabels)[];
const id = z.string().trim().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const d = new Date(`${value}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; }, "Data inválida.");
const area = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, "Informe área não negativa com até quatro casas decimais.");
const areas = z.object({ existingArea: area, expandedArea: area, irregularArea: area, renovationArea: area, demolitionArea: area });
export const weightsSchema = z.object({ existingArea: z.number().int().min(-1).max(1), expandedArea: z.number().int().min(-1).max(1), irregularArea: z.number().int().min(-1).max(1), renovationArea: z.number().int().min(-1).max(1), demolitionArea: z.number().int().min(-1).max(1) }).refine((value) => Object.values(value).some((weight) => weight !== 0), "Selecione ao menos um componente da regra de área.");
export const constructionCatalogSchema = z.object({ id: id.optional(), kind: z.enum(["PERMIT_TYPE", "PURPOSE", "CONSTRUCTION_TYPE", "SUBDIVISION_TYPE", "INSPECTION_TYPE"]), name: z.string().trim().min(2).max(160), description: z.string().trim().max(2000), isActive: z.boolean() });
export const constructionConfigSchema = z.object({ freeRevisions: z.number().int().min(0).max(100), correctionDays: z.number().int().min(1).max(3650), checkPropertyDebts: z.boolean(), subjectIds: z.array(id).min(1, "Selecione ao menos um assunto urbanístico.").max(100).refine((ids) => new Set(ids).size === ids.length), areaWeights: weightsSchema, instructions: z.string().trim().min(3).max(10000) });
export const constructionStaffSchema = z.object({ id: id.optional(), employeeId: id, departmentId: id, role: z.enum(["ANALYST", "INSPECTOR", "MANAGER"]), startsAt: date, endsAt: z.union([z.literal(""), date]), isActive: z.boolean() }).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, "Fim da vigência anterior ao início.");
export const constructionCaseSchema = areas.extend({ requestKey: z.uuid(), configurationVersion: z.number().int().positive(), formVersion: z.number().int().nonnegative().default(0), additionalValues: z.record(z.string(), z.string().max(4000)).default({}), processTypeId: id, subjectId: id, personId: z.string(), companyId: z.string(), category: z.enum(["BUILDING", "SUBDIVISION"]), locationType: z.enum(["URBAN", "RURAL"]), regularization: z.boolean(), modalityId: id, purposeId: id, constructionTypeId: z.string(), propertyIds: z.array(id).min(1).max(100), description: z.string().trim().min(3).max(4000) }).refine((value) => Boolean(value.personId) !== Boolean(value.companyId), "Selecione uma pessoa ou uma empresa requerente.").refine((value) => value.category !== "BUILDING" || Boolean(value.constructionTypeId), "Informe o tipo construtivo.").refine((value) => new Set(value.propertyIds).size === value.propertyIds.length, "Não repita imóveis.");

export function calculateConstructionArea(input: unknown, rule: unknown) {
  const values = areas.parse(input);
  const weights = weightsSchema.parse(rule);
  const total = areaKeys.reduce((sum, key) => sum.plus(new Prisma.Decimal(values[key]).mul(weights[key])), new Prisma.Decimal(0));
  if (total.lessThan(0) || total.greaterThan("9999999999.9999")) throw new Error("A regra resulta em área negativa ou superior ao limite permitido.");
  return { total: total.toFixed(4), memory: { areas: values, weights, total: total.toFixed(4), unit: "m²", formula: "Soma dos componentes multiplicados pelos coeficientes publicados" } };
}

export type ConstructionAccess = { administrator: boolean; employeeId: string | null; departmentId: string | null; roles: string[] };
export function constructionCaseWhere(access: ConstructionAccess): Prisma.ConstructionCaseWhereInput {
  if (access.administrator) return {};
  if (!access.departmentId || !access.roles.length) return { id: { in: [] } };
  return { process: { currentDepartmentId: access.departmentId } };
}
