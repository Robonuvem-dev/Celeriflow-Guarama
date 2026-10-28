import { eq, inArray, count } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import type { JsonObject } from "@/db/json";
import { withDatabaseTransaction } from "@/db/transaction";
import { accountingPlans } from "@/db/schema/finance-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { lockTaxAccountingKey, readTaxAccountingCatalog, readTaxDefinition, readTaxEntityBinding, taxAccountingObject as taxScopeSnapshot, taxProfilePeriod } from "@/db/repositories/tax-accounting/records";
import type { FinanceActor } from "@/lib/financeiro";
import { resolveAccountClassificationSnapshots } from "@/lib/financeiro/account-catalog";

export type TaxAccountingProfileInput = {
  taxId: string; budgetUnitId: string; catalogVersionId: string;
  receivableAccountId: string; revenueAccountId: string; deductionAccountId: string; lossAccountId: string;
  effectiveFrom: Date; effectiveUntil: Date; reason: string; idempotencyKey: string; supersedesEntryId?: string;
};

/** A replacement is an additional immutable edition, not an edit to the previous profile. */
export async function configureTaxAccountingProfile(db: DatabaseConnection, actor: FinanceActor, input: TaxAccountingProfileInput) {
  if (!input.reason.trim() || !input.idempotencyKey.trim() || !Number.isFinite(input.effectiveFrom.getTime()) || !Number.isFinite(input.effectiveUntil.getTime()) || input.effectiveUntil < input.effectiveFrom || input.effectiveFrom.getUTCFullYear() !== input.effectiveUntil.getUTCFullYear()) throw new Error("Informe fundamento, chave e vigência válida dentro de um exercício.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("Perfil fora das unidades gestoras autorizadas.");
  return withDatabaseTransaction(db, async tx => {
    await lockTaxAccountingKey(tx, `TAX_PROFILE:${input.taxId}:${input.budgetUnitId}`);
    const binding = await readTaxEntityBinding(tx, input.budgetUnitId);
    const tax = await readTaxDefinition(tx, input.taxId);
    if (!tax.isActive) throw new Error("Selecione tributo ativo.");
    const data: JsonObject = {
      budgetUnitId: input.budgetUnitId, governmentEntityId: binding.governmentEntityId, catalogVersionId: input.catalogVersionId,
      receivableAccountId: input.receivableAccountId, revenueAccountId: input.revenueAccountId, deductionAccountId: input.deductionAccountId, lossAccountId: input.lossAccountId,
      reason: input.reason.trim(), supersedesEntryId: input.supersedesEntryId?.trim() || null,
    };
    const id = `TAX_ACCOUNTING_PROFILE:${input.idempotencyKey.trim()}`;
    const existing = (await tx.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id)).limit(1))[0];
    if (existing) {
      const stored = taxScopeSnapshot(existing.data);
      if (existing.entityType !== "TAX" || existing.entityId !== input.taxId || existing.category !== "ACCOUNTING_PROFILE" || existing.status !== "ATIVO" || existing.effectiveFrom.getTime() !== input.effectiveFrom.getTime() || existing.effectiveUntil?.getTime() !== input.effectiveUntil.getTime() || Object.keys(stored).length !== Object.keys(data).length || Object.entries(data).some(([key, value]) => stored[key] !== value)) throw new Error("Perfil já registrado com outros dados; preserve a edição original.");
      return existing;
    }
    const catalog = await readTaxAccountingCatalog(tx, input.catalogVersionId);
    const accounts = [input.receivableAccountId, input.revenueAccountId, input.deductionAccountId, input.lossAccountId];
    if (catalog.status !== "PUBLISHED" || catalog.year !== input.effectiveFrom.getUTCFullYear() || new Set(accounts).size !== 4) throw new Error("Selecione quatro contas distintas de edição publicada do exercício.");
    if ((await tx.select({ total: count() }).from(accountingPlans).where(inArray(accountingPlans.id, accounts)))[0].total !== 4) throw new Error("Vínculos do catálogo devem apontar para quatro contas contábeis existentes.");
    for (const [index, accountId] of accounts.entries()) {
      const entries = catalog.entries.filter(entry => entry.kind === "ACCOUNT" && entry.canonicalId === accountId);
      const attributes = taxScopeSnapshot(entries[0]?.attributes);
      if (entries.length !== 1 || attributes.operational !== true || attributes.pocOnly !== false || attributes.informationNature !== "P" || attributes.balanceNature !== (index === 1 ? "C" : "D")) throw new Error("Contas exigem vínculo municipal único, natureza patrimonial e D/C compatível.");
    }
    await resolveAccountClassificationSnapshots(tx, accounts.map(id => ({ id })), input.effectiveFrom, binding);
    await resolveAccountClassificationSnapshots(tx, accounts.map(id => ({ id })), input.effectiveUntil, binding);
    const overlapping = await tx.select().from(taxRegistryEntries).where(taxProfilePeriod(input.taxId, "ACCOUNTING_PROFILE", input.budgetUnitId, input.effectiveFrom, input.effectiveUntil));
    const replaced = new Set(overlapping.map(entry => taxScopeSnapshot(entry.data).supersedesEntryId).filter((id): id is string => typeof id === "string"));
    const current = overlapping.filter(entry => !replaced.has(entry.id));
    if (input.supersedesEntryId) {
      if (current.length !== 1 || current[0].id !== input.supersedesEntryId || input.effectiveFrom <= current[0].effectiveFrom || !current[0].effectiveUntil || input.effectiveUntil > current[0].effectiveUntil) throw new Error("A nova edição deve substituir o perfil corrente a partir de data posterior, dentro da vigência anterior.");
    } else if (current.length) throw new Error("Perfil sobreposto; selecione a edição corrente que será substituída.");
    const [entry] = await tx.insert(taxRegistryEntries).values({ id, entityType: "TAX", entityId: input.taxId, category: "ACCOUNTING_PROFILE", title: `${tax.name} — perfil patrimonial por UG`, status: "ATIVO", source: "MUNICIPAL", actorUsuarioId: actor.usuarioId, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, version: input.supersedesEntryId ? current[0].version + 1 : 1, data }).returning();
    await tx.insert(taxAuditLogs).values({ action: "CONFIGURE_ACCOUNTING_PROFILE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...data, taxId: input.taxId, effectiveFrom: input.effectiveFrom.toISOString(), effectiveUntil: input.effectiveUntil.toISOString() } });
    return entry;
  });
}

export type TaxDebtAccountingProfileInput = Omit<TaxAccountingProfileInput, "receivableAccountId" | "revenueAccountId" | "deductionAccountId"> & { originalReceivableAccountId: string; debtReceivableAccountId: string };

export async function configureTaxDebtAccountingProfile(db: DatabaseConnection, actor: FinanceActor, input: TaxDebtAccountingProfileInput) {
  if (!input.reason.trim() || !input.idempotencyKey.trim() || !Number.isFinite(input.effectiveFrom.getTime()) || !Number.isFinite(input.effectiveUntil.getTime()) || input.effectiveUntil < input.effectiveFrom || input.effectiveFrom.getUTCFullYear() !== input.effectiveUntil.getUTCFullYear()) throw new Error("Informe fundamento, chave e vigência válida dentro de um exercício.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("Perfil de dívida ativa fora das UGs autorizadas.");
  return withDatabaseTransaction(db, async tx => {
    await lockTaxAccountingKey(tx, `TAX_DEBT_PROFILE:${input.taxId}:${input.budgetUnitId}`);
    const binding = await readTaxEntityBinding(tx, input.budgetUnitId);
    const tax = await readTaxDefinition(tx, input.taxId);
    if (!tax.isActive) throw new Error("Selecione tributo ativo.");
    const data: JsonObject = { budgetUnitId: input.budgetUnitId, governmentEntityId: binding.governmentEntityId, catalogVersionId: input.catalogVersionId, originalReceivableAccountId: input.originalReceivableAccountId, debtReceivableAccountId: input.debtReceivableAccountId, lossAccountId: input.lossAccountId, reason: input.reason.trim(), supersedesEntryId: input.supersedesEntryId?.trim() || null };
    const id = `TAX_DEBT_ACCOUNTING_PROFILE:${input.idempotencyKey.trim()}`;
    const previous = (await tx.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id)).limit(1))[0];
    if (previous) {
      const stored = taxScopeSnapshot(previous.data);
      if (previous.entityType !== "TAX" || previous.entityId !== input.taxId || previous.category !== "DEBT_ACCOUNTING_PROFILE" || previous.status !== "ATIVO" || previous.effectiveFrom.getTime() !== input.effectiveFrom.getTime() || previous.effectiveUntil?.getTime() !== input.effectiveUntil.getTime() || Object.keys(stored).length !== Object.keys(data).length || Object.entries(data).some(([key, value]) => stored[key] !== value)) throw new Error("Perfil DA já registrado com outros dados.");
      return previous;
    }
    const catalog = await readTaxAccountingCatalog(tx, input.catalogVersionId);
    const ids = [input.originalReceivableAccountId, input.debtReceivableAccountId, input.lossAccountId];
    const accounts = await tx.select().from(accountingPlans).where(inArray(accountingPlans.id, ids));
    if (new Set(ids).size !== 3 || accounts.length !== 3 || catalog.status !== "PUBLISHED" || catalog.year !== input.effectiveFrom.getUTCFullYear()) throw new Error("Perfil DA exige três contas distintas de edição municipal publicada do exercício.");
    for (const [index, id] of ids.entries()) {
      const entries = catalog.entries.filter(entry => entry.kind === "ACCOUNT" && entry.canonicalId === id);
      const attributes = taxScopeSnapshot(entries[0]?.attributes);
      if (entries.length !== 1 || attributes.operational !== true || attributes.pocOnly !== false || attributes.informationNature !== "P" || attributes.balanceNature !== "D" || accounts.find(account => account.id === id)?.type !== (index === 2 ? "VPD" : "Ativo")) throw new Error("Perfil DA exige direitos analíticos de ativo e VPD de extinção, com natureza patrimonial/devedora.");
    }
    await resolveAccountClassificationSnapshots(tx, ids.map(id => ({ id })), input.effectiveFrom, binding);
    await resolveAccountClassificationSnapshots(tx, ids.map(id => ({ id })), input.effectiveUntil, binding);
    const overlapping = await tx.select().from(taxRegistryEntries).where(taxProfilePeriod(input.taxId, "DEBT_ACCOUNTING_PROFILE", input.budgetUnitId, input.effectiveFrom, input.effectiveUntil));
    const replaced = new Set(overlapping.map(entry => taxScopeSnapshot(entry.data).supersedesEntryId));
    const current = overlapping.filter(entry => !replaced.has(entry.id));
    if (input.supersedesEntryId ? current.length !== 1 || current[0].id !== input.supersedesEntryId || input.effectiveFrom <= current[0].effectiveFrom || !current[0].effectiveUntil || input.effectiveUntil > current[0].effectiveUntil : current.length > 0) throw new Error("Sobreposição DA: substitua a edição corrente a partir de data posterior, dentro da vigência anterior.");
    const [entry] = await tx.insert(taxRegistryEntries).values({ id, entityType: "TAX", entityId: input.taxId, category: "DEBT_ACCOUNTING_PROFILE", title: `${tax.name} — perfil de dívida ativa por UG`, source: "MUNICIPAL", actorUsuarioId: actor.usuarioId, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, version: input.supersedesEntryId ? current[0].version + 1 : 1, data }).returning();
    await tx.insert(taxAuditLogs).values({ action: "CONFIGURE_DEBT_ACCOUNTING_PROFILE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...data, effectiveFrom: input.effectiveFrom.toISOString(), effectiveUntil: input.effectiveUntil.toISOString() } });
    return entry;
  }, { timeoutMs: 60000 });
}
