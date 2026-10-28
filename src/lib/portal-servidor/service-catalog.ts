import { and, eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { activePortalEmployee, activePortalPolicies, portalCount, portalFirst, portalRequired, requiredPortalPolicy } from "@/db/repositories/portal-servidor/records";
import { hrPayrollRules } from "@/db/schema/personnel-configuration";
import { publicServices } from "@/db/schema/portal-services";
import { employeePortalServiceConfigurations } from "@/db/schema/employee-portal";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

export const functionalFieldSchema = z.object({
  code: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/), label: z.string().trim().min(1).max(160),
  type: z.enum(["TEXT", "DATE", "NUMBER", "SELECT"]), required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
}).strict();

const functionalServiceBase = z.object({
  origin: z.literal("SERVICO_PORTAL_SERVIDOR"), version: z.number().int().positive(),
  publicServiceId: z.string().min(1), budgetUnitId: z.string().min(1),
  group: z.string().trim().min(1).max(120), processTypeId: z.string().min(1), subjectId: z.string().min(1),
  operation: z.enum(["SOLICITACAO_RH", "FERIAS", "AJUSTE_PONTO"]),
  employeeIds: z.array(z.string().min(1)).max(10000).default([]),
  fields: z.array(functionalFieldSchema).max(40),
  requiredDocuments: z.array(z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), label: z.string().trim().min(1).max(160), documentClassCode: z.string().min(1) }).strict()).max(20).default([]),
  acceptance: z.string().trim().max(8000).default(""),
}).strict();
export const functionalServiceSchema = functionalServiceBase.superRefine((value, ctx) => {
  if (new Set(value.fields.map(field => field.code)).size !== value.fields.length) ctx.addIssue({ code: "custom", message: "Campos do formulário devem ter códigos distintos." });
  if (value.fields.some(field => ["description", "accepted", "attendanceUpdatedAt"].includes(field.code))) ctx.addIssue({ code: "custom", message: "Formulário utiliza um código de campo reservado." });
  if (new Set(value.requiredDocuments.map(document => document.code)).size !== value.requiredDocuments.length) ctx.addIssue({ code: "custom", message: "Documentos devem ter códigos distintos." });
  for (const field of value.fields) if (field.type === "SELECT" && (!field.options.length || new Set(field.options).size !== field.options.length)) ctx.addIssue({ code: "custom", message: `Opções inválidas para ${field.label}.` });
});

export type FunctionalService = z.infer<typeof functionalServiceSchema>;
export const functionalServiceInputSchema = z.object({
  id: z.string().optional(), ruleSetId: z.string().min(1), code: z.string().regex(/^PORTAL_SERVICO_[A-Z0-9_]{1,48}$/),
  name: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(4000),
  requirements: z.string().max(4000).default(""), steps: z.string().max(4000).default(""), deadline: z.string().max(500).default(""),
  isActive: z.boolean(), configuration: functionalServiceBase.omit({ origin: true, version: true, publicServiceId: true }),
}).strict();

export async function listFunctionalServices(db: DatabaseExecutor, employeeId: string) {
  const now = new Date();
  if (!await activePortalEmployee(db, employeeId)) return [];
  const rules = await activePortalPolicies(db, now);
  const links = rules.length ? await db.select().from(employeePortalServiceConfigurations).where(inArray(employeePortalServiceConfigurations.ruleId, rules.map(rule => rule.id))) : [];
  const services = rules.flatMap(rule => {
    const parsed = functionalServiceSchema.safeParse(rule.value);
    const link = links.find(link => link.ruleId === rule.id);
    return parsed.success && link && link.version === parsed.data.version && link.publicServiceId === parsed.data.publicServiceId && link.budgetUnitId === parsed.data.budgetUnitId && link.processTypeId === parsed.data.processTypeId && link.subjectId === parsed.data.subjectId && link.operation === parsed.data.operation && (!parsed.data.employeeIds.length || parsed.data.employeeIds.includes(employeeId)) ? [{ rule, configuration: parsed.data }] : [];
  });
  const descriptions = services.length ? await db.select().from(publicServices).where(and(inArray(publicServices.id, services.map(service => service.configuration.publicServiceId)), eq(publicServices.target, "Servidor"), eq(publicServices.isActive, true))) : [];
  return services.flatMap(service => {
    const description = descriptions.find(item => item.id === service.configuration.publicServiceId);
    return description ? [{ ...description, id: service.rule.id, code: service.rule.code, configuration: service.configuration, ruleId: service.rule.id }] : [];
  });
}

export async function saveFunctionalService(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = functionalServiceInputSchema.parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para configurar serviços funcionais.", 403);
  assertBudgetUnitAccess(context.user, input.configuration.budgetUnitId);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_CATALOGO:${input.ruleSetId}:${input.code}`}))`);
    const ruleSet = await portalRequired<{ status: string }>(tx, sql`SELECT status FROM "HrPayrollRuleSet" WHERE id=${input.ruleSetId}`);
    if (ruleSet.status !== "ATIVA") throw new Error("Selecione uma configuração RH ativa.");
    const subject = await portalFirst<{ initialDepartmentId: string | null; typeInitialDepartmentId: string | null; typeActive: boolean; typeInternal: boolean }>(tx, sql`SELECT s."initialDepartmentId",t."initialDepartmentId" AS "typeInitialDepartmentId",t."isActive" AS "typeActive",t."allowsInternalOpening" AS "typeInternal" FROM "Subject" s JOIN "ProcessType" t ON t.id=s."processTypeId" WHERE s.id=${input.configuration.subjectId} AND s."processTypeId"=${input.configuration.processTypeId} AND s."isActive" AND s."allowsInternalOpening" LIMIT 1`);
    if (!subject?.typeActive || !subject.typeInternal) throw new Error("Tipo/assunto não permite abertura interna.");
    const unit = await portalRequired<{ secretariatId: string | null }>(tx, sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${input.configuration.budgetUnitId}`);
    if (input.configuration.employeeIds.length && await portalCount(tx, sql`SELECT count(*) FROM "Employee" WHERE id=ANY(${sql.param(input.configuration.employeeIds)}::text[]) AND "isActive"`) !== new Set(input.configuration.employeeIds).size) throw new Error("Público contém servidores não encontrados ou inativos.");
    const previous = input.id ? await requiredPortalPolicy(tx, input.id) : null;
    const prior = previous ? functionalServiceSchema.parse(previous.value) : null;
    if (previous && (previous.ruleSetId !== input.ruleSetId || previous.code !== input.code)) throw new Error("Preserve o conjunto e o código do serviço existente.");
    if (prior) assertBudgetUnitAccess(context.user, prior.budgetUnitId);
    const destination = subject.initialDepartmentId || subject.typeInitialDepartmentId;
    if (destination) {
      const department = await portalRequired<{ isActive: boolean; secretariatId: string }>(tx, sql`SELECT "isActive","secretariatId" FROM "Department" WHERE id=${destination}`);
      if (!department.isActive || department.secretariatId !== unit.secretariatId) throw new Error("Destino inicial incompatível com a unidade gestora do serviço.");
    }
    const commonData = { name: input.name, description: input.description, requirements: input.requirements, steps: input.steps, deadline: input.deadline, isActive: input.isActive };
    const [common] = prior ? await tx.update(publicServices).set(commonData).where(eq(publicServices.id, prior.publicServiceId)).returning() : await tx.insert(publicServices).values({ ...commonData, target: "Servidor" }).returning();
    if (!common) throw new Error("Registro não encontrado.");
    const configuration = functionalServiceSchema.parse({ ...input.configuration, origin: "SERVICO_PORTAL_SERVIDOR", version: (prior?.version || 0) + 1, publicServiceId: common.id });
    const data = { name: input.name, description: input.description, category: "PORTAL", valueType: "JSON", value: configuration, isActive: input.isActive };
    const [rule] = previous ? await tx.update(hrPayrollRules).set(data).where(eq(hrPayrollRules.id, previous.id)).returning() : await tx.insert(hrPayrollRules).values({ ...data, ruleSetId: input.ruleSetId, code: input.code }).returning();
    const link = { publicServiceId: common.id, budgetUnitId: configuration.budgetUnitId, processTypeId: configuration.processTypeId, subjectId: configuration.subjectId, version: configuration.version, operation: configuration.operation, snapshot: configuration };
    await tx.insert(employeePortalServiceConfigurations).values({ ruleId: rule.id, ...link }).onConflictDoUpdate({ target: employeePortalServiceConfigurations.ruleId, set: link });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "EMPLOYEE_PORTAL_SERVICE", targetId: rule.id });
    return rule.id;
  });
}

export function validateFunctionalValues(service: FunctionalService, raw: Record<string, unknown>) {
  const result: Record<string, string> = {};
  if (Object.keys(raw).some(key => !service.fields.some(field => field.code === key))) throw new AccessError("Campo não autorizado no formulário.", 403);
  for (const field of service.fields) {
    const value = raw[field.code];
    if (value !== undefined && typeof value !== "string") throw new Error(`Valor inválido: ${field.label}.`);
    const text = (value as string | undefined)?.trim() || "";
    if (!text && field.required) throw new Error(`Preencha ${field.label}.`);
    if (text.length > 4000) throw new Error(`Conteúdo excede o limite: ${field.label}.`);
    if (text && field.type === "SELECT" && !field.options.includes(text)) throw new Error(`Selecione uma opção válida: ${field.label}.`);
    if (text && field.type === "NUMBER" && (!/^-?\d+(\.\d+)?$/.test(text) || !Number.isFinite(Number(text)))) throw new Error(`Número inválido: ${field.label}.`);
    if (text && field.type === "DATE" && (!z.iso.date().safeParse(text).success || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)) throw new Error(`Data inválida: ${field.label}.`);
    result[field.code] = text;
  }
  return result;
}
