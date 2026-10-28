import { and, eq, ilike } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { taxes } from "@/db/schema/taxation-core";
import { itbiTransactionTypes } from "@/db/schema/tax-itbi";
import { auditItbi, firstItbiRegistryEntry, insertItbiRegistryEntry, itbiRegistryPosition, lockItbiKey, requireItbiRecord } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxScopeSnapshot } from "./scope";

const inputSchema = z.object({
  id: z.string().optional(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(240),
  rate: z.string().refine(value => { try { const rate = new Decimal(value); return rate.isFinite() && rate.gt(0) && rate.lte(100) && rate.decimalPlaces() <= 6; } catch { return false; } }, "Alíquota deve ser positiva, até 100%, com até seis casas decimais."),
  requiresDebtClearance: z.boolean(), legalBasis: z.string().trim().min(1).max(4000), expectedUpdatedAt: z.string().nullable(),
});

export async function saveItbiTransactionType(connection: DatabaseConnection, actor: TaxActor, value: z.infer<typeof inputSchema>) {
  const input = inputSchema.parse(value);
  return withDatabaseTransaction(connection, async tx => {
    const activeTaxes = await tx.select().from(taxes).where(and(ilike(taxes.name, "ITBI"), eq(taxes.isActive, true)));
    if (activeTaxes.length !== 1) throw new Error("Concilie um único tributo ITBI ativo.");
    const scope = await resolveTaxAssessmentScope(tx, actor, activeTaxes[0].id);
    if (!scope.budgetUnitId || !scope.governmentEntityId) throw new Error("Configure ente/UG arrecadador do ITBI.");
    await lockItbiKey(tx, `ITBI_TYPE:${input.id ?? input.code}`);
    const previous = input.id ? requireItbiRecord((await tx.select().from(itbiTransactionTypes).where(eq(itbiTransactionTypes.id, input.id)).limit(1))[0]) : null;
    if ((previous?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt) throw new Error("A modalidade foi alterada. Recarregue antes de salvar.");
    if (previous) {
      const origin = await firstItbiRegistryEntry(tx, itbiRegistryPosition("ITBI_TRANSACTION_TYPE", previous.id, "PARAMETER_SCOPE"));
      const stored = taxScopeSnapshot(origin?.data);
      if (origin && (stored.budgetUnitId !== scope.budgetUnitId || stored.governmentEntityId !== scope.governmentEntityId)) throw new Error("Modalidade pertence a outra origem municipal.");
      if (!origin && actor.allowedBudgetUnitIds) throw new Error("Modalidade legada sem origem conciliada; solicite a conciliação ao administrador.");
    }
    const data = { code: input.code, name: input.name, rate: input.rate, requiresDebtClearance: input.requiresDebtClearance, legalBasis: input.legalBasis };
    const storedData = { ...data, rate: new Decimal(input.rate) };
    const saved = requireItbiRecord((previous ? await tx.update(itbiTransactionTypes).set(storedData).where(eq(itbiTransactionTypes.id, previous.id)).returning() : await tx.insert(itbiTransactionTypes).values(storedData).returning())[0]);
    const origin = await firstItbiRegistryEntry(tx, itbiRegistryPosition("ITBI_TRANSACTION_TYPE", saved.id, "PARAMETER_SCOPE"));
    if (!origin) await insertItbiRegistryEntry(tx, { entityType: "ITBI_TRANSACTION_TYPE", entityId: saved.id, category: "PARAMETER_SCOPE", title: input.name, actorUsuarioId: actor.usuarioId, data: scope });
    await auditItbi(tx, { action: "SAVE_ITBI_TRANSACTION_TYPE", entityType: "ItbiTransactionType", entityId: saved.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous ? { code: previous.code, name: previous.name, rate: previous.rate.toString(), requiresDebtClearance: previous.requiresDebtClearance, legalBasis: previous.legalBasis } : null, after: data, ...scope } });
    return saved;
  });
}
