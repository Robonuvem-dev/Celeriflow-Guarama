"use server";
import { contractCustomFieldsPolicySchema } from "@/lib/rh/contract-custom-fields";
import { positionPlanSchema } from "@/lib/rh/position-plan";
import { receiptMessagesPolicySchema } from "@/lib/rh/receipt-messages";
import { serviceRightPolicySchema } from "@/lib/rh/service-rights";
import { serviceTimeAllowancePolicySchema } from "@/lib/rh/service-time-allowance";
import { payrollProvisionPolicySchema } from "@/lib/rh/payroll-provisions";
import { obligationExportPolicySchema } from "@/lib/rh/obligation-export";
import { timeBankExpirationPolicySchema } from "@/lib/rh/time-bank-expiration";
import { timeBankTransferPolicySchema } from "@/lib/rh/time-bank-transfer";
import { timeBankPaymentPolicySchema } from "@/lib/rh/time-bank-payment";
import { incomeTaxBandSchema, incomeTaxReductionSchema } from "@/lib/rh/income-tax";
import { pocSpecialPolicySchema } from "@/lib/rh/poc-special-payroll";
import { travelAllowancePolicySchema } from "@/lib/rh/travel-allowance";
import { vacationEntitlementPolicySchema } from "@/lib/rh/vacation-entitlement";
import { payrollPensionPolicySchema } from "@/lib/rh/payroll-pensions";
import { monthlyProrationPolicySchema } from "@/lib/rh/monthly-proration";

import { revalidatePath } from "next/cache";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { JsonNull } from "@/db/json";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { roles } from "@/db/schema/administration";
import { documents } from "@/db/schema/registry";
import { hrEmploymentContracts } from "@/db/schema/personnel-workforce";
import { hrCalculationPolicies, hrEmploymentRegimes, hrPayrollConfigurationChanges, hrPayrollRubricIncidences, hrPayrollRubrics, hrPayrollRules, hrPayrollRuleSets, hrSocialSecurityBands, hrSocialSecuritySchemes, hrVacationPolicies } from "@/db/schema/personnel-configuration";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import {
  auditEventTypes,
} from "@/lib/platform/audit-evidence";
import {
  getOrCreateHrConfigurationInstance,
  hrCalculationPolicyInputSchema,
  hrEmploymentRegimeInputSchema,
  hrPayrollRubricInputSchema,
  hrPayrollRuleInputSchema,
  hrRuleSetInputSchema,
  hrSocialSecurityBandInputSchema,
  hrSocialSecuritySchemeInputSchema,
  hrVacationPolicyInputSchema,
  parseRuleValue,
  serializeHrConfigurationSnapshot,
  toDecimal,
  type HrPayrollConfigurationDb,
} from "@/lib/rh/payroll-configuration";

type ActionResult = { error?: string; message?: string; ruleSetId?: string };

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível salvar a parametrização de RH.";
}

function revalidateRhConfiguration() {
  revalidatePath("/rh");
  revalidatePath("/rh/parametrizacoes");
  revalidatePath("/portal-servidor");
  revalidatePath("/portal-servidor/folha");
}

// Inputs de data representam dias civis. O fim da vigência é inclusivo para
// que "31/12" permaneça aplicável até o fim desse próprio dia.
function inclusiveEndOfUtcDay(value: Date | null | undefined) {
  if (!value) return null;
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

async function getManagedRuleSet(
  db: HrPayrollConfigurationDb,
  ruleSetId: string,
) {
  const instance = await getOrCreateHrConfigurationInstance(db);
  const [ruleSet] = await db.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.id, ruleSetId), eq(hrPayrollRuleSets.configuracaoInstanciaId, instance.id))).limit(1);
  if (!ruleSet)
    throw new Error(
      "O conjunto de regras informado não pertence à instância municipal atual.",
    );
  return ruleSet;
}

function assertRuleSetCanChange(ruleSet: { status: string; scope: string }) {
  if (ruleSet.status === "ARQUIVADA") {
    throw new Error(
      "O conjunto de regras está arquivado. Crie uma nova versão para alterar parâmetros.",
    );
  }
  if (ruleSet.status === "ATIVA" && ruleSet.scope === "PRODUCAO") {
    throw new Error(
      "Regras ativas de produção são imutáveis. Crie uma nova versão com nova vigência.",
    );
  }
}

async function recordConfigurationChange(
  db: HrPayrollConfigurationDb,
  input: {
    ruleSetId: string;
    entityType: string;
    entityId: string;
    operation: "CRIADA" | "ALTERADA" | "ATIVADA" | "ARQUIVADA";
    beforeValue?: unknown;
    afterValue?: unknown;
    actorUsuarioId: string;
  },
) {
  await db.insert(hrPayrollConfigurationChanges).values({
      ruleSetId: input.ruleSetId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      beforeValue:
        input.beforeValue === undefined
          ? undefined
          : input.beforeValue === null ? JsonNull : serializeHrConfigurationSnapshot(input.beforeValue),
      afterValue:
        input.afterValue === undefined
          ? undefined
          : input.afterValue === null ? JsonNull : serializeHrConfigurationSnapshot(input.afterValue),
      actorUsuarioId: input.actorUsuarioId,
  });
  await writeAuditEvent(db, {
    actorUsuarioId: input.actorUsuarioId,
    eventType: auditEventTypes.administrativeMutation,
    targetType: "RH_PAYROLL_CONFIGURATION",
    targetId: `${input.entityType}:${input.entityId}`,
  });
}

export async function saveHrPayrollRuleSet(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const parsedInput = hrRuleSetInputSchema.parse(rawInput);
    const input = {
      ...parsedInput,
      effectiveUntil: inclusiveEndOfUtcDay(parsedInput.effectiveUntil),
    };
    const context = await getTenantContextForModuleOperation(
      "RH",
      input.id ? "update" : "create",
    );
    const saved = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instance = await getOrCreateHrConfigurationInstance(tx);
      if (input.status === "ATIVA" && input.scope === "PRODUCAO") {
        const activeEnd =
          input.effectiveUntil ?? new Date("9999-12-31T23:59:59.999Z");
        const [overlappingProductionRuleSet] = await tx.select({ id: hrPayrollRuleSets.id, name: hrPayrollRuleSets.name }).from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.configuracaoInstanciaId, instance.id), eq(hrPayrollRuleSets.scope, "PRODUCAO"), eq(hrPayrollRuleSets.status, "ATIVA"), input.id ? ne(hrPayrollRuleSets.id, input.id) : undefined, lte(hrPayrollRuleSets.effectiveFrom, activeEnd), or(isNull(hrPayrollRuleSets.effectiveUntil), gte(hrPayrollRuleSets.effectiveUntil, input.effectiveFrom)))).limit(1);
        if (overlappingProductionRuleSet) {
          throw new Error(
            `A vigência conflita com o conjunto de produção ativo “${overlappingProductionRuleSet.name}”. Arquive-o ou ajuste a vigência antes de ativar esta versão.`,
          );
        }
      }
      if (input.id) {
        const [previous] = await tx.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.id, input.id), eq(hrPayrollRuleSets.configuracaoInstanciaId, instance.id))).limit(1);
        if (!previous)
          throw new Error(
            "O conjunto de regras não foi encontrado nesta instância.",
          );
        assertRuleSetCanChange(previous);
        const [next] = await tx.update(hrPayrollRuleSets).set({
            code: input.code,
            name: input.name,
            status: input.status,
            scope: input.scope,
            effectiveFrom: input.effectiveFrom,
            effectiveUntil: input.effectiveUntil,
            legalReference: input.legalReference,
            notes: input.notes,
            isDemo: input.isDemo,
            approvedAt:
              input.status === "ATIVA"
                ? (previous.approvedAt ?? new Date())
                : null,
            archivedAt:
              input.status === "ARQUIVADA"
                ? (previous.archivedAt ?? new Date())
                : null,
        }).where(eq(hrPayrollRuleSets.id, previous.id)).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: next.id,
          entityType: "HR_PAYROLL_RULE_SET",
          entityId: next.id,
          operation:
            input.status === "ARQUIVADA"
              ? "ARQUIVADA"
              : input.status === "ATIVA" && previous.status !== "ATIVA"
                ? "ATIVADA"
                : "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
        return next;
      }

      const [next] = await tx.insert(hrPayrollRuleSets).values({
          configuracaoInstanciaId: instance.id,
          code: input.code,
          name: input.name,
          status: input.status,
          scope: input.scope,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil,
          legalReference: input.legalReference,
          notes: input.notes,
          isDemo: input.isDemo,
          approvedAt: input.status === "ATIVA" ? new Date() : null,
          archivedAt: input.status === "ARQUIVADA" ? new Date() : null,
      }).returning();
      await recordConfigurationChange(tx, {
        ruleSetId: next.id,
        entityType: "HR_PAYROLL_RULE_SET",
        entityId: next.id,
        operation: input.status === "ATIVA" ? "ATIVADA" : "CRIADA",
        afterValue: next,
        actorUsuarioId: context.user.id,
      });
      return next;
    });
    revalidateRhConfiguration();
    return { message: "Conjunto de regras salvo.", ruleSetId: saved.id };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function saveHrPayrollRule(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = hrPayrollRuleInputSchema.parse(rawInput);
    const context = await getTenantContextForModuleOperation(
      "RH",
      input.id ? "update" : "create",
    );
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const ruleSet = await getManagedRuleSet(tx, input.ruleSetId);
      assertRuleSetCanChange(ruleSet);
      const value = parseRuleValue(input.valueType, input.value);
      if (input.code === "PENSOES_FOLHA") {
        if (input.valueType !== "JSON") throw new Error("Pensões exigem política JSON.");
        payrollPensionPolicySchema.parse(value);
      }
      if (input.code === "RATEIO_MENSAL_CIVIL") {
        if (input.valueType !== "JSON") throw new Error("Rateio mensal exige política JSON.");
        monthlyProrationPolicySchema.parse(value);
      }
      if (input.code === "IRRF_FAIXAS") {
        if (input.valueType !== "JSON" || !Array.isArray(value) || !value.length) throw new Error("IRRF exige faixas em lista JSON.");
        value.forEach(band => incomeTaxBandSchema.parse(band));
      }
      if (input.code === "IRRF_REDUCAO_MENSAL") {
        if (input.valueType !== "JSON") throw new Error("Redução IRRF exige política JSON.");
        incomeTaxReductionSchema.parse(value);
      }
      if (input.code === "FOLHAS_ESPECIAIS_POC") {
        if (input.valueType !== "JSON") throw new Error("Folhas especiais POC exigem política JSON.");
        pocSpecialPolicySchema.parse(value);
      }
      if (["DIARIAS_POC", "DIARIAS_MUNICIPAIS"].includes(input.code)) {
        if (input.valueType !== "JSON") throw new Error("Diárias exigem política JSON.");
        travelAllowancePolicySchema.parse(value);
      }
      if (input.code === "FALTAS_FERIAS_POC") {
        if (input.valueType !== "JSON") throw new Error("Faixas de faltas/férias exigem política JSON.");
        vacationEntitlementPolicySchema.parse(value);
      }
      if (input.code === "CAMPOS_CONTRATO") {
        if (input.valueType !== "JSON") throw new Error("Campos configuráveis exigem regra JSON.");
        contractCustomFieldsPolicySchema.parse(value);
      }
      if (input.code === "MENSAGENS_RECIBO") {
        if (input.valueType !== "JSON") throw new Error("Mensagens de recibo exigem política JSON.");
        const policy = receiptMessagesPolicySchema.parse(value);
        const contractIds = [...new Set(policy.messages.flatMap(message => message.contractIds))];
        const regimeIds = [...new Set(policy.messages.flatMap(message => message.regimeIds))];
        if (contractIds.length && (await tx.select({ id: hrEmploymentContracts.id }).from(hrEmploymentContracts).where(inArray(hrEmploymentContracts.id, contractIds))).length !== contractIds.length) throw new Error("Mensagem referencia contrato inexistente.");
        if (regimeIds.length && (await tx.select({ id: hrEmploymentRegimes.id }).from(hrEmploymentRegimes).where(inArray(hrEmploymentRegimes.id, regimeIds))).length !== regimeIds.length) throw new Error("Mensagem referencia regime inexistente.");
      }
      if (input.code === "LICENCA_PREMIO") {
        if (input.valueType !== "JSON") throw new Error("Licença-prêmio exige política JSON.");
        serviceRightPolicySchema.parse(value);
      }
      if (input.code === "ATS") {
        if (input.valueType !== "JSON") throw new Error("ATS exige política JSON.");
        serviceTimeAllowancePolicySchema.parse(value);
      }
      if (input.code === "PROVISOES_FOLHA") {
        if (input.valueType !== "JSON") throw new Error("Provisões exigem política JSON.");
        payrollProvisionPolicySchema.parse(value);
      }
      if (input.code.startsWith("OBRIGACAO_LAYOUT")) {
        if (input.valueType !== "JSON") throw new Error("Layout de obrigação exige política JSON.");
        obligationExportPolicySchema.parse(value);
      }
      if (input.code === "BANCO_HORAS_EXPIRACAO") {
        if (input.valueType !== "JSON") throw new Error("Expiração de banco de horas exige política JSON.");
        timeBankExpirationPolicySchema.parse(value);
      }
      if (input.code === "BANCO_HORAS_PAGAMENTO") {
        if (input.valueType !== "JSON") throw new Error("Conversão de horas exige regra JSON.");
        const policy = timeBankPaymentPolicySchema.parse(value);
        if (!(await tx.select({ id: hrPayrollRubrics.id }).from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, input.ruleSetId), eq(hrPayrollRubrics.code, policy.rubricCode), eq(hrPayrollRubrics.isActive, true), eq(hrPayrollRubrics.type, "PROVENTO"), eq(hrPayrollRubrics.calculationMethod, "MANUAL"))).limit(1)).length) throw new Error("Conversão exige rubrica MANUAL de provento ativa no conjunto.");
      }
      if (input.code === "BANCO_HORAS_TRANSFERENCIA") {
        if (input.valueType !== "JSON") throw new Error("Transferência de horas exige regra JSON.");
        const policy = timeBankTransferPolicySchema.parse(value);
        const regimeIds = [...new Set(policy.allowedRegimePairs.flatMap(pair => [pair.sourceRegimeId, pair.targetRegimeId]))];
        if ((await tx.select({ id: hrEmploymentRegimes.id }).from(hrEmploymentRegimes).where(and(inArray(hrEmploymentRegimes.id, regimeIds), eq(hrEmploymentRegimes.isActive, true)))).length !== regimeIds.length) throw new Error("Transferência referencia regime inexistente/inativo.");
      }
      if (input.code === "QUADRO_CARGOS") {
        if (input.valueType !== "JSON") throw new Error("Quadro de cargos exige regra JSON.");
        const plan = positionPlanSchema.parse(value);
        const roleIds = [...new Set(plan.periods.flatMap(period => period.roles.map(role => role.roleId)))];
        if ((await tx.select({ id: roles.id }).from(roles).where(and(inArray(roles.id, roleIds), eq(roles.isActive, true)))).length !== roleIds.length) throw new Error("Quadro exige cargos ativos do cadastro central.");
        const documentIds = [...new Set(plan.periods.flatMap(period => period.roles.flatMap(role => role.documentIds)))];
        if (documentIds.length && (await tx.select({ id: documents.id }).from(documents).where(inArray(documents.id, documentIds))).length !== documentIds.length) throw new Error("Documento GED do quadro não encontrado.");
      }
      const data = {
        category: input.category,
        code: input.code,
        name: input.name,
        description: input.description,
        valueType: input.valueType,
        value,
        unit: input.unit,
        sortOrder: input.sortOrder,
        legalReference: input.legalReference,
        isRequired: input.isRequired,
        isActive: input.isActive,
      };
      if (input.id) {
        const [previous] = await tx.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.id, input.id), eq(hrPayrollRules.ruleSetId, ruleSet.id))).limit(1);
        if (!previous)
          throw new Error(
            "A regra não foi encontrada neste conjunto de regras.",
          );
        const [next] = await tx.update(hrPayrollRules).set(data).where(eq(hrPayrollRules.id, previous.id)).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_PAYROLL_RULE",
          entityId: next.id,
          operation: "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      } else {
        const [next] = await tx.insert(hrPayrollRules).values({ ruleSetId: ruleSet.id, ...data }).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_PAYROLL_RULE",
          entityId: next.id,
          operation: "CRIADA",
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      }
    });
    revalidateRhConfiguration();
    return { message: "Regra salva." };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function saveHrPayrollRubric(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = hrPayrollRubricInputSchema.parse(rawInput);
    const context = await getTenantContextForModuleOperation(
      "RH",
      input.id ? "update" : "create",
    );
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const ruleSet = await getManagedRuleSet(tx, input.ruleSetId);
      assertRuleSetCanChange(ruleSet);
      const data = {
        code: input.code,
        name: input.name,
        type: input.type,
        esocialNatureCode: input.esocialNatureCode,
        calculationMethod: input.calculationMethod,
        formulaExpression: input.formulaExpression,
        calculationBaseCode: input.calculationBaseCode,
        fixedValue: toDecimal(input.fixedValue),
        percentageRate: toDecimal(input.percentageRate),
        priority: input.priority,
        legalReference: input.legalReference,
        notes: input.notes,
        isActive: input.isActive,
      };
      if (input.id) {
        const [previousRow] = await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.id, input.id), eq(hrPayrollRubrics.ruleSetId, ruleSet.id))).limit(1);
        const previous = previousRow ? { ...previousRow, incidences: await tx.select().from(hrPayrollRubricIncidences).where(eq(hrPayrollRubricIncidences.rubricId, previousRow.id)).orderBy(asc(hrPayrollRubricIncidences.incidenceType)) } : null;
        if (!previous)
          throw new Error(
            "A rubrica não foi encontrada neste conjunto de regras.",
          );
        const [updated] = await tx.update(hrPayrollRubrics).set(data).where(eq(hrPayrollRubrics.id, previous.id)).returning();
        await tx.delete(hrPayrollRubricIncidences).where(eq(hrPayrollRubricIncidences.rubricId, previous.id));
        if (input.incidences.length) {
          await tx.insert(hrPayrollRubricIncidences).values(input.incidences.map((incidenceType) => ({
              rubricId: previous.id,
              incidenceType,
          })));
        }
        const next = { ...updated, incidences: await tx.select().from(hrPayrollRubricIncidences).where(eq(hrPayrollRubricIncidences.rubricId, previous.id)).orderBy(asc(hrPayrollRubricIncidences.incidenceType)) };
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_PAYROLL_RUBRIC",
          entityId: next.id,
          operation: "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      } else {
        const [next] = await tx.insert(hrPayrollRubrics).values({ ruleSetId: ruleSet.id, ...data }).returning();
        if (input.incidences.length) {
          await tx.insert(hrPayrollRubricIncidences).values(input.incidences.map((incidenceType) => ({
              rubricId: next.id,
              incidenceType,
          })));
        }
        const complete = { ...next, incidences: await tx.select().from(hrPayrollRubricIncidences).where(eq(hrPayrollRubricIncidences.rubricId, next.id)).orderBy(asc(hrPayrollRubricIncidences.incidenceType)) };
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_PAYROLL_RUBRIC",
          entityId: complete.id,
          operation: "CRIADA",
          afterValue: complete,
          actorUsuarioId: context.user.id,
        });
      }
    });
    revalidateRhConfiguration();
    return {
      message:
        "Rubrica salva. Ela só será usada por uma folha quando o motor versionado for integrado.",
    };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function saveHrVacationPolicy(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = hrVacationPolicyInputSchema.parse(rawInput);
    const context = await getTenantContextForModuleOperation(
      "RH",
      input.id ? "update" : "create",
    );
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const ruleSet = await getManagedRuleSet(tx, input.ruleSetId);
      assertRuleSetCanChange(ruleSet);
      const additionalPayRate = toDecimal(input.additionalPayRate);
      if (!additionalPayRate)
        throw new Error("Informe o percentual do adicional de férias.");
      const data = {
        code: input.code,
        name: input.name,
        employmentNature: input.employmentNature,
        acquisitionMonths: input.acquisitionMonths,
        concessionMonths: input.concessionMonths,
        entitlementDays: input.entitlementDays,
        maxSplits: input.maxSplits,
        minFirstSplitDays: input.minFirstSplitDays,
        minOtherSplitDays: input.minOtherSplitDays,
        additionalPayRate,
        allowsCashAbono: input.allowsCashAbono,
        maxCashAbonoDays: input.maxCashAbonoDays,
        allowsAdvanceThirteenth: input.allowsAdvanceThirteenth,
        requiresApproval: input.requiresApproval,
        legalReference: input.legalReference,
        notes: input.notes,
        isActive: input.isActive,
      };
      if (input.id) {
        const [previous] = await tx.select().from(hrVacationPolicies).where(and(eq(hrVacationPolicies.id, input.id), eq(hrVacationPolicies.ruleSetId, ruleSet.id))).limit(1);
        if (!previous)
          throw new Error(
            "A política de férias não foi encontrada neste conjunto de regras.",
          );
        const [next] = await tx.update(hrVacationPolicies).set(data).where(eq(hrVacationPolicies.id, previous.id)).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_VACATION_POLICY",
          entityId: next.id,
          operation: "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      } else {
        const [next] = await tx.insert(hrVacationPolicies).values({ ruleSetId: ruleSet.id, ...data }).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_VACATION_POLICY",
          entityId: next.id,
          operation: "CRIADA",
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      }
    });
    revalidateRhConfiguration();
    return { message: "Política de férias salva." };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function saveHrSocialSecurityScheme(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = hrSocialSecuritySchemeInputSchema.parse(rawInput);
    const context = await getTenantContextForModuleOperation(
      "RH",
      input.id ? "update" : "create",
    );
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const ruleSet = await getManagedRuleSet(tx, input.ruleSetId);
      assertRuleSetCanChange(ruleSet);
      const data = {
        code: input.code,
        name: input.name,
        regime: input.regime,
        employeeCalculationMethod: input.employeeCalculationMethod,
        ceilingValue: toDecimal(input.ceilingValue),
        employerContributionRate: toDecimal(input.employerContributionRate),
        actuarialContributionRate: toDecimal(input.actuarialContributionRate),
        legalReference: input.legalReference,
        notes: input.notes,
        isActive: input.isActive,
      };
      if (input.id) {
        const [previous] = await tx.select().from(hrSocialSecuritySchemes).where(and(eq(hrSocialSecuritySchemes.id, input.id), eq(hrSocialSecuritySchemes.ruleSetId, ruleSet.id))).limit(1);
        if (!previous)
          throw new Error(
            "O regime previdenciário não foi encontrado neste conjunto de regras.",
          );
        const [next] = await tx.update(hrSocialSecuritySchemes).set(data).where(eq(hrSocialSecuritySchemes.id, previous.id)).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_SOCIAL_SECURITY_SCHEME",
          entityId: next.id,
          operation: "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      } else {
        const [next] = await tx.insert(hrSocialSecuritySchemes).values({ ruleSetId: ruleSet.id, ...data }).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_SOCIAL_SECURITY_SCHEME",
          entityId: next.id,
          operation: "CRIADA",
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      }
    });
    revalidateRhConfiguration();
    return { message: "Regime previdenciário salvo." };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function saveHrSocialSecurityBand(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = hrSocialSecurityBandInputSchema.parse(rawInput);
    const context = await getTenantContextForModuleOperation(
      "RH",
      input.id ? "update" : "create",
    );
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [schemeRow] = await tx.select({ scheme: hrSocialSecuritySchemes, ruleSet: hrPayrollRuleSets }).from(hrSocialSecuritySchemes).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrSocialSecuritySchemes.ruleSetId)).where(eq(hrSocialSecuritySchemes.id, input.socialSecuritySchemeId)).limit(1);
      const scheme = schemeRow ? { ...schemeRow.scheme, ruleSet: schemeRow.ruleSet } : null;
      if (!scheme)
        throw new Error(
          "O regime previdenciário informado não foi encontrado.",
        );
      const managedRuleSet = await getManagedRuleSet(tx, scheme.ruleSetId);
      if (managedRuleSet.id !== scheme.ruleSet.id)
        throw new Error(
          "O regime previdenciário não pertence à instância municipal atual.",
        );
      assertRuleSetCanChange(managedRuleSet);
      const lowerLimit = toDecimal(input.lowerLimit);
      const employeeRate = toDecimal(input.employeeRate);
      if (!lowerLimit || !employeeRate)
        throw new Error("Informe o limite inferior e a alíquota do servidor.");
      const upperLimit = toDecimal(input.upperLimit);
      const employerRate = toDecimal(input.employerRate);
      const data = {
        sequence: input.sequence,
        lowerLimit,
        upperLimit,
        employeeRate,
        employerRate,
      };
      const comparisonUpperLimit =
        upperLimit === null
          ? new Decimal("9999999999999999.99")
          : upperLimit;
      const [overlappingBand] = await tx.select({ id: hrSocialSecurityBands.id, sequence: hrSocialSecurityBands.sequence }).from(hrSocialSecurityBands).where(and(eq(hrSocialSecurityBands.socialSecuritySchemeId, scheme.id), input.id ? ne(hrSocialSecurityBands.id, input.id) : undefined, lte(hrSocialSecurityBands.lowerLimit, comparisonUpperLimit), or(isNull(hrSocialSecurityBands.upperLimit), gte(hrSocialSecurityBands.upperLimit, lowerLimit)))).limit(1);
      if (overlappingBand) {
        throw new Error(
          `A faixa informada se sobrepõe à faixa ${overlappingBand.sequence} deste regime previdenciário.`,
        );
      }
      if (input.id) {
        const [previous] = await tx.select().from(hrSocialSecurityBands).where(and(eq(hrSocialSecurityBands.id, input.id), eq(hrSocialSecurityBands.socialSecuritySchemeId, scheme.id))).limit(1);
        if (!previous)
          throw new Error(
            "A faixa previdenciária não foi encontrada neste regime.",
          );
        const [next] = await tx.update(hrSocialSecurityBands).set(data).where(eq(hrSocialSecurityBands.id, previous.id)).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: managedRuleSet.id,
          entityType: "HR_SOCIAL_SECURITY_BAND",
          entityId: next.id,
          operation: "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      } else {
        const [next] = await tx.insert(hrSocialSecurityBands).values({ socialSecuritySchemeId: scheme.id, ...data }).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: managedRuleSet.id,
          entityType: "HR_SOCIAL_SECURITY_BAND",
          entityId: next.id,
          operation: "CRIADA",
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      }
    });
    revalidateRhConfiguration();
    return { message: "Faixa previdenciária salva." };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function saveHrCalculationPolicy(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = hrCalculationPolicyInputSchema.parse(rawInput);
    const context = await getTenantContextForModuleOperation("RH", "update");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const ruleSet = await getManagedRuleSet(tx, input.ruleSetId);
      assertRuleSetCanChange(ruleSet);
      const data = {
        currency: input.currency,
        roundingMode: input.roundingMode,
        roundingScale: input.roundingScale,
        movementCutoffDay: input.movementCutoffDay,
        paymentDay: input.paymentDay,
        negativeNetPayPolicy: input.negativeNetPayPolicy,
        maxConsignmentMarginRate: toDecimal(input.maxConsignmentMarginRate),
        remunerationCeiling: toDecimal(input.remunerationCeiling),
        freezeOnClose: input.freezeOnClose,
        legalReference: input.legalReference,
        notes: input.notes,
      };
      const [previous] = await tx.select().from(hrCalculationPolicies).where(eq(hrCalculationPolicies.ruleSetId, ruleSet.id)).limit(1);
      if (previous) {
        const [next] = await tx.update(hrCalculationPolicies).set(data).where(eq(hrCalculationPolicies.id, previous.id)).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_CALCULATION_POLICY",
          entityId: next.id,
          operation: "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      } else {
        const [next] = await tx.insert(hrCalculationPolicies).values({ ruleSetId: ruleSet.id, ...data }).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_CALCULATION_POLICY",
          entityId: next.id,
          operation: "CRIADA",
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      }
    });
    revalidateRhConfiguration();
    return { message: "Política de cálculo salva." };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}

export async function saveHrEmploymentRegime(
  rawInput: unknown,
): Promise<ActionResult> {
  try {
    const input = hrEmploymentRegimeInputSchema.parse(rawInput);
    const context = await getTenantContextForModuleOperation(
      "RH",
      input.id ? "update" : "create",
    );
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const ruleSet = await getManagedRuleSet(tx, input.ruleSetId);
      assertRuleSetCanChange(ruleSet);

      if (input.socialSecuritySchemeId) {
        const [scheme] = await tx.select({ id: hrSocialSecuritySchemes.id }).from(hrSocialSecuritySchemes).where(and(eq(hrSocialSecuritySchemes.id, input.socialSecuritySchemeId), eq(hrSocialSecuritySchemes.ruleSetId, ruleSet.id))).limit(1);
        if (!scheme)
          throw new Error(
            "O regime previdenciário informado não pertence a este conjunto de regras.",
          );
      }
      if (input.vacationPolicyId) {
        const [vacationPolicy] = await tx.select({ id: hrVacationPolicies.id }).from(hrVacationPolicies).where(and(eq(hrVacationPolicies.id, input.vacationPolicyId), eq(hrVacationPolicies.ruleSetId, ruleSet.id))).limit(1);
        if (!vacationPolicy)
          throw new Error(
            "A política de férias informada não pertence a este conjunto de regras.",
          );
      }

      const data = {
        code: input.code,
        name: input.name,
        employmentNature: input.employmentNature,
        esocialCategory: input.esocialCategory,
        defaultMonthlyHours: input.defaultMonthlyHours,
        socialSecuritySchemeId: input.socialSecuritySchemeId,
        vacationPolicyId: input.vacationPolicyId,
        legalReference: input.legalReference,
        isActive: input.isActive,
      };
      if (input.id) {
        const [previous] = await tx.select().from(hrEmploymentRegimes).where(and(eq(hrEmploymentRegimes.id, input.id), eq(hrEmploymentRegimes.ruleSetId, ruleSet.id))).limit(1);
        if (!previous)
          throw new Error(
            "O vínculo não foi encontrado neste conjunto de regras.",
          );
        const [next] = await tx.update(hrEmploymentRegimes).set(data).where(eq(hrEmploymentRegimes.id, previous.id)).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_EMPLOYMENT_REGIME",
          entityId: next.id,
          operation: "ALTERADA",
          beforeValue: previous,
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      } else {
        const [next] = await tx.insert(hrEmploymentRegimes).values({ ruleSetId: ruleSet.id, ...data }).returning();
        await recordConfigurationChange(tx, {
          ruleSetId: ruleSet.id,
          entityType: "HR_EMPLOYMENT_REGIME",
          entityId: next.id,
          operation: "CRIADA",
          afterValue: next,
          actorUsuarioId: context.user.id,
        });
      }
    });
    revalidateRhConfiguration();
    return { message: "Vínculo salvo." };
  } catch (error) {
    return { error: messageFrom(error) };
  }
}
