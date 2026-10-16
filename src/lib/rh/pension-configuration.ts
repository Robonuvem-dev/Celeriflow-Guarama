import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPensionPolicySchema } from "./payroll-pensions";
import { enqueueHrIntegration } from "./workforce-service";

export async function configurePayrollPensions(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ ruleSetId: z.string().min(1), requestKey: z.string().min(1).max(120), policy: payrollPensionPolicySchema }).strict().parse(raw);
  if (input.policy.entries.some(entry => !/^[A-Z0-9_]{1,40}$/.test(entry.id))) throw new Error("Use identificadores estáveis de pensão com letras maiúsculas, números e sublinhado (até 40 caracteres).");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:PENSOES:${input.ruleSetId}`}))`;
    const sourceKey = `PENSOES:CONFIGURACAO:${input.requestKey}`;
    const fingerprint = JSON.stringify(input);
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      if ((previous.payload as { fingerprint: string }).fingerprint !== fingerprint) throw new Error("Chave de configuração de pensões reutilizada com outros dados.");
      return { id: (previous.payload as { ruleId: string }).ruleId };
    }
    const set = await tx.hrPayrollRuleSet.findUniqueOrThrow({ where: { id: input.ruleSetId } });
    if (!set.isDemo || set.scope !== "DEMONSTRACAO" || set.status !== "ATIVA") throw new Error("Este configurador de pensões exige conjunto demonstrativo ativo.");
    const ids = [...new Set(input.policy.entries.map(entry => entry.contractId))];
    const regimes = await tx.hrEmploymentRegime.findMany({ where: { ruleSetId: set.id }, select: { id: true } });
    if (await tx.hrEmploymentContract.count({ where: { id: { in: ids }, regimeId: { in: regimes.map(regime => regime.id) } } }) !== ids.length) throw new Error("Pensão referencia contrato de outro conjunto ou inexistente.");
    const people = [...new Set(input.policy.entries.map(entry => entry.beneficiaryPersonId))];
    if (await tx.person.count({ where: { id: { in: people }, status: "Ativo" } }) !== people.length) throw new Error("Beneficiário deve existir e estar ativo no cadastro central.");
    const mappingRule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { ruleSetId_code: { ruleSetId: set.id, code: "FOLHA_EVENTOS" } } });
    const mapping = z.record(z.string(), z.string()).parse(mappingRule.value);
    for (const entry of input.policy.entries) {
      const code = `PENSAO_${entry.id}`;
      const event = await tx.payrollEvent.upsert({ where: { code: `POC_${set.id}_${code}` }, create: { code: `POC_${set.id}_${code}`, name: `Pensão alimentícia POC · ${entry.id}`, type: "Desconto", isActive: true }, update: {} });
      mapping[code] = event.id;
    }
    await tx.hrPayrollRule.update({ where: { id: mappingRule.id }, data: { value: mapping } });
    const rule = await tx.hrPayrollRule.upsert({ where: { ruleSetId_code: { ruleSetId: set.id, code: "PENSOES_FOLHA" } }, create: { ruleSetId: set.id, code: "PENSOES_FOLHA", name: "Pensões alimentícias — parâmetros POC", category: "CALCULO", valueType: "JSON", value: input.policy as Prisma.InputJsonValue, legalReference: input.policy.legalReference }, update: { value: input.policy as Prisma.InputJsonValue, legalReference: input.policy.legalReference, isActive: true } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "PENSOES_CONFIGURADAS", payload: { fingerprint, ruleId: rule.id, actorId, policy: input.policy } });
    return rule;
  }, { timeout: 60000 });
}
