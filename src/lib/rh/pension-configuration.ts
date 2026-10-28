import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { people as personTable } from "@/db/schema/people";
import { hrEmploymentContracts, payrollEvents } from "@/db/schema/personnel-workforce";
import { hrEmploymentRegimes, hrPayrollRules, hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { findHrIntegrationEvent, lockPersonnel, personnelJson } from "@/db/repositories/personnel/integration";
import { z } from "zod";
import { payrollPensionPolicySchema } from "./payroll-pensions";
import { enqueueHrIntegration } from "./workforce-service";

export async function configurePayrollPensions(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ ruleSetId: z.string().min(1), requestKey: z.string().min(1).max(120), policy: payrollPensionPolicySchema }).strict().parse(raw);
  if (input.policy.entries.some(entry => !/^[A-Z0-9_]{1,40}$/.test(entry.id))) throw new Error("Use identificadores estáveis de pensão com letras maiúsculas, números e sublinhado (até 40 caracteres).");
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `PENSOES:${input.ruleSetId}`);
    const sourceKey = `PENSOES:CONFIGURACAO:${input.requestKey}`;
    const fingerprint = JSON.stringify(input);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      if ((previous.payload as { fingerprint: string }).fingerprint !== fingerprint) throw new Error("Chave de configuração de pensões reutilizada com outros dados.");
      return { id: (previous.payload as { ruleId: string }).ruleId };
    }
    const [set] = await tx.select().from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.id, input.ruleSetId)).limit(1);
    if (!set) throw new Error("Conjunto de regras não encontrado.");
    if (!set.isDemo || set.scope !== "DEMONSTRACAO" || set.status !== "ATIVA") throw new Error("Este configurador de pensões exige conjunto demonstrativo ativo.");
    const ids = [...new Set(input.policy.entries.map(entry => entry.contractId))];
    const regimes = await tx.select({ id: hrEmploymentRegimes.id }).from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.ruleSetId, set.id));
    if ((await tx.select({ id: hrEmploymentContracts.id }).from(hrEmploymentContracts).where(and(inArray(hrEmploymentContracts.id, ids), inArray(hrEmploymentContracts.regimeId, regimes.map(regime => regime.id))))).length !== ids.length) throw new Error("Pensão referencia contrato de outro conjunto ou inexistente.");
    const people = [...new Set(input.policy.entries.map(entry => entry.beneficiaryPersonId))];
    if ((await tx.select({ id: personTable.id }).from(personTable).where(and(inArray(personTable.id, people), eq(personTable.status, "Ativo")))).length !== people.length) throw new Error("Beneficiário deve existir e estar ativo no cadastro central.");
    const [mappingRule] = await tx.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.ruleSetId, set.id), eq(hrPayrollRules.code, "FOLHA_EVENTOS"))).limit(1);
    if (!mappingRule) throw new Error("Mapeamento de eventos não encontrado.");
    const mapping = z.record(z.string(), z.string()).parse(mappingRule.value);
    for (const entry of input.policy.entries) {
      const code = `PENSAO_${entry.id}`;
      await tx.insert(payrollEvents).values({ code: `POC_${set.id}_${code}`, name: `Pensão alimentícia POC · ${entry.id}`, type: "Desconto", isActive: true }).onConflictDoNothing({ target: payrollEvents.code });
      const [event] = await tx.select().from(payrollEvents).where(eq(payrollEvents.code, `POC_${set.id}_${code}`)).limit(1);
      mapping[code] = event.id;
    }
    await tx.update(hrPayrollRules).set({ value: mapping }).where(eq(hrPayrollRules.id, mappingRule.id));
    const value = personnelJson(input.policy);
    const [rule] = await tx.insert(hrPayrollRules).values({ ruleSetId: set.id, code: "PENSOES_FOLHA", name: "Pensões alimentícias — parâmetros POC", category: "CALCULO", valueType: "JSON", value, legalReference: input.policy.legalReference }).onConflictDoUpdate({ target: [hrPayrollRules.ruleSetId, hrPayrollRules.code], set: { value, legalReference: input.policy.legalReference, isActive: true } }).returning();
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "PENSOES_CONFIGURADAS", payload: { fingerprint, ruleId: rule.id, actorId, policy: input.policy } });
    return rule;
  }, { timeoutMs: 60000 });
}
