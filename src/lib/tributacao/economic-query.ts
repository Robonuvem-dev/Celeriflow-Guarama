import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { listEconomicOriginUnits, listEconomicRegistrations } from "@/db/repositories/tax-economic/registrations";
import { listEconomicProfiles, listEconomicFiscalRecords } from "@/db/repositories/tax-economic/registry";
import { z } from "zod";
import type { TaxActor } from "./index";
import { economicProfileSchema } from "./economic-profile";
import { taxScopeSnapshot } from "./scope";

export const economicQuerySchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().optional(), query: z.string().trim().max(240).default(""), companyType: z.string().default(""), cnae: z.string().default(""), accountantId: z.string().default(""), partnerId: z.string().default(""), simples: z.enum(["ALL", "YES", "NO"]).default("ALL"), startFrom: z.iso.date().optional(), startUntil: z.iso.date().optional(), fieldKey: z.string().default(""), fieldValue: z.string().default("") });

export async function readEconomicProfiles(db: DatabaseConnection, actor: Pick<TaxActor, "allowedBudgetUnitIds">, raw: z.input<typeof economicQuerySchema>) {
  return withDatabaseTransaction(db, tx => readEconomicProfilesInTransaction(tx, actor, raw), { isolationLevel: "repeatable read", timeoutMs: 60000 });
}

export async function readEconomicProfilesInTransaction(tx: DatabaseTransaction, actor: Pick<TaxActor, "allowedBudgetUnitIds">, raw: z.input<typeof economicQuerySchema>) {
  const input = economicQuerySchema.parse(raw);
  if (input.startFrom && input.startUntil && input.startFrom > input.startUntil) throw new Error("Período de abertura inválido.");
    const units = await listEconomicOriginUnits(tx, input.governmentEntityId, actor.allowedBudgetUnitIds);
    if (!units.length || input.budgetUnitId && !units.some(unit => unit.budgetUnitId === input.budgetUnitId)) throw new Error("Ente/UG fora do acesso autorizado.");
    const allowed = input.budgetUnitId ? [input.budgetUnitId] : units.map(unit => unit.budgetUnitId);
    const entries = await listEconomicProfiles(tx, { governmentEntityId: input.governmentEntityId, budgetUnitIds: allowed });
    const latest = new Map<string, typeof entries[number]>();
    for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
    const registrations = await listEconomicRegistrations(tx, [...latest.keys()]);
    const additionalEntries = input.fieldKey ? await listEconomicFiscalRecords(tx, [...latest.keys()], allowed) : [];
    const additional = new Map<string, typeof additionalEntries[number]>();
    for (const entry of additionalEntries) { const key = `${entry.entityId}:${entry.title}`; if (!additional.has(key)) additional.set(key, entry); }
    return registrations.flatMap(registration => {
      const entry = latest.get(registration.id)!; const profile = economicProfileSchema.parse(entry.data);
      // The native activity can be changed by REDESIM and other cadastral producers.
      profile.primaryCnae = registration.primaryCnae ?? "";
      const name = registration.taxpayer.company?.corporateName ?? registration.taxpayer.person?.fullName ?? registration.taxpayerId;
      const isSimples = /simples|simei/i.test(registration.taxRegime ?? "");
      const start = registration.startDate?.toISOString().slice(0, 10);
      if (!`${name} ${registration.municipalInsc}`.toLocaleLowerCase("pt-BR").includes(input.query.toLocaleLowerCase("pt-BR")) || input.companyType && profile.companyType !== input.companyType || input.cnae && profile.primaryCnae !== input.cnae && !profile.secondaryCnaes.includes(input.cnae) || input.accountantId && profile.accountantTaxpayerId !== input.accountantId || input.partnerId && !profile.partners.some(partner => partner.taxpayerId === input.partnerId) || input.simples === "YES" && !isSimples || input.simples === "NO" && isSimples || input.startFrom && (!start || start < input.startFrom) || input.startUntil && (!start || start > input.startUntil)) return [];
      if (input.fieldKey && ![...additional.values()].some(record => record.entityId === registration.id && record.status === "ATIVO" && String(taxScopeSnapshot(taxScopeSnapshot(record.data).values)[input.fieldKey] ?? "") === input.fieldValue)) return [];
      return [{ id: registration.id, inscription: registration.municipalInsc, name, status: registration.status, taxRegime: registration.taxRegime, updatedAt: registration.updatedAt.toISOString(), startDate: start ?? null, profileVersion: entry.version, profile }];
    }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
