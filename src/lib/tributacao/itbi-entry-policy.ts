import { and, eq } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import { itbiTransactionTypes } from "@/db/schema/tax-itbi";
import { auditItbi, firstItbiRegistryEntry, insertItbiRegistryEntry, itbiRegistryPosition, latestItbiRegistryEntry, lockItbiKey, readItbiMunicipalUnit } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

export const itbiEntryPolicySchema = z.object({
  governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), active: z.boolean(),
  legalBasis: z.string().trim().min(1).max(4000),
  rules: z.array(z.object({ code: z.string().trim().min(1).max(60), condition: z.enum(["TAX_DEBT", "NON_TAX_DEBT", "RISK_AREA", "PROTECTED_AREA", "MISSING_COORDINATES", "DECLARED_BELOW_VALUATION", "INACTIVE_PROPERTY", "PARTIAL_TRANSFER", "LEASEHOLD"]), action: z.enum(["BLOCK", "WARN"]), message: z.string().trim().min(1).max(2000), transactionTypeIds: z.array(z.string().min(1)).max(100) }).strict()).max(100),
}).strict().refine(input => new Set(input.rules.map(rule => rule.code)).size === input.rules.length, "Informe códigos distintos para as regras de inclusão.");

export async function publishItbiEntryPolicy(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof itbiEntryPolicySchema>) {
  const input = itbiEntryPolicySchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    if (!await readItbiMunicipalUnit(tx, input)) throw new Error("Origem municipal não conciliada.");
    await lockItbiKey(tx, `ITBI_ENTRY_POLICY:${input.budgetUnitId}`);
    const previous = await latestItbiRegistryEntry(tx, "BUDGET_UNIT", input.budgetUnitId, "ITBI_ENTRY_POLICY");
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Política alterada. Recarregue antes de publicar.");
    if (previous && taxScopeSnapshot(previous.data).governmentEntityId !== input.governmentEntityId) throw new Error("A origem da política é imutável.");
    for (const typeId of new Set(input.rules.flatMap(rule => rule.transactionTypeIds))) {
      if (!(await tx.select({ id: itbiTransactionTypes.id }).from(itbiTransactionTypes).where(and(eq(itbiTransactionTypes.id, typeId), eq(itbiTransactionTypes.isActive, true))).limit(1)).length) throw new Error("Selecione modalidades ativas.");
      const origin = await firstItbiRegistryEntry(tx, itbiRegistryPosition("ITBI_TRANSACTION_TYPE", typeId, "PARAMETER_SCOPE"));
      const scope = taxScopeSnapshot(origin?.data);
      if (scope.governmentEntityId !== input.governmentEntityId || scope.budgetUnitId !== input.budgetUnitId) throw new Error("Modalidade sem origem conciliada nesta UG.");
    }
    const entry = await insertItbiRegistryEntry(tx, { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ITBI_ENTRY_POLICY", version: input.expectedVersion + 1, title: "Bloqueios e avisos na inclusão de ITBI", actorUsuarioId: actor.usuarioId, data: input });
    await auditItbi(tx, { action: "PUBLISH_ITBI_ENTRY_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } });
    return entry;
  }, { isolationLevel: "serializable" });
}

export async function evaluateItbiEntryPolicy(tx: DatabaseTransaction, scope: { governmentEntityId?: string | null; budgetUnitId?: string | null }, input: { transactionTypeId: string; propertyStatus: string; profile: JsonValue | null; declaredValue: Decimal; valuation: Decimal; taxDebt: Decimal; nonTaxDebt: Decimal; fraction: Decimal; leasehold: boolean }) {
  if (!scope.governmentEntityId || !scope.budgetUnitId) return { policyId: null, policyVersion: null, warnings: [] as { code: string; message: string }[] };
  await lockItbiKey(tx, `ITBI_ENTRY_POLICY:${scope.budgetUnitId}`);
  const entry = await latestItbiRegistryEntry(tx, "BUDGET_UNIT", scope.budgetUnitId, "ITBI_ENTRY_POLICY");
  if (!entry) return { policyId: null, policyVersion: null, warnings: [] as { code: string; message: string }[] };
  const policy = itbiEntryPolicySchema.parse(entry.data);
  if (policy.governmentEntityId !== scope.governmentEntityId) throw new Error("Política de inclusão de outro ente municipal.");
  const warnings: { code: string; message: string }[] = [];
  if (policy.active) {
    const profile = taxScopeSnapshot(input.profile);
    const profileRequired = new Set(["RISK_AREA", "PROTECTED_AREA", "MISSING_COORDINATES"]);
    for (const rule of policy.rules) {
      if (rule.transactionTypeIds.length && !rule.transactionTypeIds.includes(input.transactionTypeId)) continue;
      if (profileRequired.has(rule.condition) && (profile.governmentEntityId !== scope.governmentEntityId || profile.budgetUnitId !== scope.budgetUnitId || typeof profile.riskArea !== "boolean" || typeof profile.environmentalProtection !== "boolean")) throw new Error("Concilie o perfil imobiliário para aplicar os bloqueios e avisos configurados.");
      const matches = { TAX_DEBT: input.taxDebt.gt(0), NON_TAX_DEBT: input.nonTaxDebt.gt(0), RISK_AREA: profile.riskArea === true, PROTECTED_AREA: profile.environmentalProtection === true, MISSING_COORDINATES: typeof profile.latitude !== "number" || typeof profile.longitude !== "number", DECLARED_BELOW_VALUATION: input.declaredValue.lt(input.valuation), INACTIVE_PROPERTY: ["Inativo", "Baixado", "Desmembrado", "Remembrado"].includes(input.propertyStatus), PARTIAL_TRANSFER: input.fraction.lt(100), LEASEHOLD: input.leasehold };
      if (!matches[rule.condition]) continue;
      if (rule.action === "BLOCK") throw new Error(`Inclusão de ITBI bloqueada (${rule.code}): ${rule.message}`);
      warnings.push({ code: rule.code, message: rule.message });
    }
  }
  return { policyId: entry.id, policyVersion: entry.version, legalBasis: policy.legalBasis, warnings };
}
