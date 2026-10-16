import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TaxError, type TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxScopeSnapshot } from "./scope";
import { resolveFiscalRule } from "./s2-service";
import { evaluateFiscalRule } from "./fiscal-engine";

export const annualRuleCopyInput = z.object({ taxId: z.string().min(1), parameterId: z.string().min(1), sourceYear: z.number().int().min(1900).max(2199), targetYear: z.number().int().min(1901).max(2200), calendar: z.array(z.iso.date()).min(1).max(120), paymentOptionDates: z.record(z.string().min(1).max(60), z.iso.date()).optional(), legalBasis: z.string().trim().min(10).max(4000), reference: z.string().trim().min(3).max(300), indexFactor: z.string().regex(/^\d+(?:\.\d{1,6})?$/).optional(), fiscalUnitValue: z.string().regex(/^\d+(?:\.\d{1,6})?$/).optional(), reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().trim().min(1).max(150) }).strict().refine(input => input.targetYear === input.sourceYear + 1, "Virada anual deve copiar para o exercício seguinte.");
export type AnnualRuleCopyInput = z.input<typeof annualRuleCopyInput>;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Additive annual initialization: never changes the rule or assessment of a prior year. */
export async function copyTaxAnnualRule(db: PrismaClient, actor: TaxActor, raw: AnnualRuleCopyInput) {
  const input = annualRuleCopyInput.parse(raw);
  const requestHash = digest(input);
  return db.$transaction(async tx => {
    const scope = await resolveTaxAssessmentScope(tx, actor, input.taxId);
    if (!scope.governmentEntityId || !scope.budgetUnitId) throw new TaxError("Virada anual exige arrecadador com ente/UG duráveis.");
    const key = `ANNUAL_RULE_COPY:${scope.governmentEntityId}:${input.idempotencyKey}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ANNUAL_RULE_YEAR:${scope.governmentEntityId}:${input.taxId}:${input.targetYear}`}, 0))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const previous = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
    if (previous) {
      const memory = previous.result as Prisma.JsonObject;
      if (memory.requestHash !== requestHash || memory.actorUsuarioId !== actor.usuarioId || memory.budgetUnitId !== scope.budgetUnitId || typeof memory.parameterId !== "string") throw new TaxError("Chave da virada já usada com outra configuração/escopo.");
      return tx.taxParameter.findUniqueOrThrow({ where: { id: memory.parameterId } });
    }
    const year = await resolveTaxFinancialYear(tx, input.targetYear, scope, false);
    await tx.$queryRaw`SELECT id FROM "TaxParameter" WHERE id=${input.parameterId} FOR SHARE`;
    const source = await resolveFiscalRule(tx, { taxId: input.taxId, parameterId: input.parameterId, effectiveAt: new Date(`${input.sourceYear}-12-31T12:00:00Z`) });
    const sourceOrigin = await tx.taxRegistryEntry.findFirst({ where: { entityType: "TAX_PARAMETER", entityId: source.parameter.id, category: "PARAMETER_SCOPE" } });
    const frozenOrigin = taxScopeSnapshot(sourceOrigin?.data);
    if (sourceOrigin && (frozenOrigin.governmentEntityId !== scope.governmentEntityId || frozenOrigin.budgetUnitId !== scope.budgetUnitId) || !sourceOrigin && actor.allowedBudgetUnitIds) throw new TaxError("Regra de origem sem vínculo conciliado na mesma origem municipal para a cópia anual.");
    if (source.configuration.version !== undefined && (!Number.isSafeInteger(source.configuration.version) || source.configuration.version < 1)) throw new TaxError("Versão da regra de origem inválida; concilie a parametrização antes da cópia.");
    if (input.calendar.length !== (source.configuration.installments ?? 1) || input.calendar.some((date, at) => !date.startsWith(`${input.targetYear}-`) || at > 0 && date <= input.calendar[at - 1])) throw new TaxError("Informe calendário completo, crescente e pertencente ao novo exercício.");
    if (input.fiscalUnitValue !== undefined && source.configuration.formula !== "UNIDADE_FISCAL") throw new TaxError("Atualização de unidade fiscal exige fórmula correspondente.");
    const sourceMemory = { id: source.parameter.id, taxId: source.parameter.taxId, code: source.parameter.code, configuration: source.parameter.configuration, effectiveFrom: source.parameter.effectiveFrom.toISOString(), effectiveUntil: source.parameter.effectiveUntil?.toISOString() ?? null };
    const sourceOptions = source.configuration.paymentOptions ?? [];
    if (Object.keys(input.paymentOptionDates ?? {}).some(code => !sourceOptions.some(option => option.code === code))) throw new TaxError("Informe vencimentos apenas para opções existentes na regra de origem.");
    const paymentOptions = sourceOptions.map(option => ({ ...option, dueDate: input.paymentOptionDates?.[option.code] ?? `${input.targetYear}${option.dueDate.slice(4)}` }));
    if (paymentOptions.some(option => !option.dueDate.startsWith(`${input.targetYear}-`) || !z.iso.date().safeParse(option.dueDate).success)) throw new TaxError("A cópia gerou data inválida ou de outro exercício. Informe o vencimento da opção no novo ano, inclusive para 29 de fevereiro.");
    const configuration = { ...source.configuration, ...(paymentOptions ? { paymentOptions } : {}), calendar: input.calendar, legalBasis: input.legalBasis, reference: input.reference, version: (source.configuration.version ?? 1) + 1, ...(input.indexFactor !== undefined ? { indexFactor: input.indexFactor } : {}), ...(input.fiscalUnitValue !== undefined ? { fiscalUnitValue: input.fiscalUnitValue } : {}), annualCopy: { sourceParameterId: source.parameter.id, sourceYear: input.sourceYear, targetYear: input.targetYear, governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId, sourceHash: digest(sourceMemory), reason: input.reason } };
    evaluateFiscalRule({ taxableBase: "1", configuration });
    const effectiveFrom = new Date(`${input.targetYear}-01-01T00:00:00Z`);
    const effectiveUntil = new Date(`${input.targetYear}-12-31T23:59:59.999Z`);
    const competing = await tx.taxParameter.count({ where: { taxId: input.taxId, isActive: true, effectiveFrom: { lte: effectiveUntil }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: effectiveFrom } }] } });
    if (competing) throw new TaxError("Há regra ativa abrangendo o novo exercício; concilie a vigência sem sobrescrever regras anteriores.");
    const parameter = await tx.taxParameter.create({ data: { taxId: input.taxId, code: source.parameter.code, name: `${source.parameter.name} · ${input.targetYear}`, calculationType: source.parameter.calculationType, configuration: json(configuration), effectiveFrom, effectiveUntil, isActive: true } });
    await tx.taxRegistryEntry.create({ data: { entityType: "TAX_PARAMETER", entityId: parameter.id, category: "PARAMETER_SCOPE", title: parameter.name, actorUsuarioId: actor.usuarioId, data: scope } });
    const result = { parameterId: parameter.id, requestHash, actorUsuarioId: actor.usuarioId, governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId, financialYearId: year.id, source: sourceMemory, sourceHash: digest(sourceMemory) };
    await tx.taxIntegrationEvent.create({ data: { integrationCode: "FISCAL_ENGINE", eventType: "ANNUAL_RULE_COPIED", idempotencyKey: key, status: "PROCESSADO", evidenceLevel: "L1", payload: json(input), result: json(result), processedAt: new Date() } });
    await tx.taxAuditLog.create({ data: { entityType: "TaxParameter", entityId: parameter.id, action: "ANNUAL_RULE_COPIED", payload: json({ ...result, reason: input.reason }), authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId } });
    return parameter;
  });
}
