import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

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

export async function listFunctionalServices(db: PrismaClient | Prisma.TransactionClient, employeeId: string) {
  const now = new Date();
  if (!await db.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } })) return [];
  const rules = await db.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON", isActive: true, ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } }, include: { functionalPortalConfiguration: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const services = rules.flatMap(rule => {
    const parsed = functionalServiceSchema.safeParse(rule.value);
    const link = rule.functionalPortalConfiguration;
    return parsed.success && link && link.version === parsed.data.version && link.publicServiceId === parsed.data.publicServiceId && link.budgetUnitId === parsed.data.budgetUnitId && link.processTypeId === parsed.data.processTypeId && link.subjectId === parsed.data.subjectId && link.operation === parsed.data.operation && (!parsed.data.employeeIds.length || parsed.data.employeeIds.includes(employeeId)) ? [{ rule, configuration: parsed.data }] : [];
  });
  const publicServices = await db.publicService.findMany({ where: { id: { in: services.map(service => service.configuration.publicServiceId) }, target: "Servidor", isActive: true } });
  return services.flatMap(service => {
    const description = publicServices.find(item => item.id === service.configuration.publicServiceId);
    return description ? [{ ...description, id: service.rule.id, code: service.rule.code, configuration: service.configuration, ruleId: service.rule.id }] : [];
  });
}

export async function saveFunctionalService(context: AppContext, raw: unknown) {
  const input = functionalServiceInputSchema.parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para configurar serviços funcionais.", 403);
  assertBudgetUnitAccess(context.user, input.configuration.budgetUnitId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_CATALOGO:${input.ruleSetId}:${input.code}`}))`;
    const ruleSet = await tx.hrPayrollRuleSet.findUniqueOrThrow({ where: { id: input.ruleSetId } });
    if (ruleSet.status !== "ATIVA") throw new Error("Selecione uma configuração RH ativa.");
    const subject = await tx.subject.findFirst({ where: { id: input.configuration.subjectId, processTypeId: input.configuration.processTypeId, isActive: true, allowsInternalOpening: true }, include: { processType: true } });
    if (!subject?.processType.isActive || !subject.processType.allowsInternalOpening) throw new Error("Tipo/assunto não permite abertura interna.");
    const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: input.configuration.budgetUnitId } });
    if (input.configuration.employeeIds.length && await tx.employee.count({ where: { id: { in: input.configuration.employeeIds }, isActive: true } }) !== new Set(input.configuration.employeeIds).size) throw new Error("Público contém servidores não encontrados ou inativos.");
    const previous = input.id ? await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.id } }) : null;
    const prior = previous ? functionalServiceSchema.parse(previous.value) : null;
    if (previous && (previous.ruleSetId !== input.ruleSetId || previous.code !== input.code)) throw new Error("Preserve o conjunto e o código do serviço existente.");
    if (prior) assertBudgetUnitAccess(context.user, prior.budgetUnitId);
    const destination = subject.initialDepartmentId || subject.processType.initialDepartmentId;
    if (destination) {
      const department = await tx.department.findUniqueOrThrow({ where: { id: destination } });
      if (!department.isActive || department.secretariatId !== unit.secretariatId) throw new Error("Destino inicial incompatível com a unidade gestora do serviço.");
    }
    const common = prior ? await tx.publicService.update({ where: { id: prior.publicServiceId }, data: { name: input.name, description: input.description, requirements: input.requirements, steps: input.steps, deadline: input.deadline, isActive: input.isActive } }) : await tx.publicService.create({ data: { name: input.name, description: input.description, requirements: input.requirements, steps: input.steps, deadline: input.deadline, target: "Servidor", isActive: input.isActive } });
    const configuration = functionalServiceSchema.parse({ ...input.configuration, origin: "SERVICO_PORTAL_SERVIDOR", version: (prior?.version || 0) + 1, publicServiceId: common.id });
    const data = { name: input.name, description: input.description, category: "PORTAL", valueType: "JSON", value: JSON.parse(JSON.stringify(configuration)) as Prisma.InputJsonValue, isActive: input.isActive };
    const rule = previous ? await tx.hrPayrollRule.update({ where: { id: previous.id }, data }) : await tx.hrPayrollRule.create({ data: { ...data, ruleSetId: input.ruleSetId, code: input.code } });
    const link = { publicServiceId: common.id, budgetUnitId: configuration.budgetUnitId, processTypeId: configuration.processTypeId, subjectId: configuration.subjectId, version: configuration.version, operation: configuration.operation, snapshot: JSON.parse(JSON.stringify(configuration)) as Prisma.InputJsonValue };
    await tx.hrPortalServiceConfiguration.upsert({ where: { ruleId: rule.id }, create: { ruleId: rule.id, ...link }, update: link });
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
