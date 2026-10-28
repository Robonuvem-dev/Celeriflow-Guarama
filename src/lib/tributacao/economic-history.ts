import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { EconomicRegistrationRecord as EconomicRegistration } from "@/lib/contracts/tax-economic";
import { appendEconomicAudit, appendEconomicEntry, listCompanySituationCatalogs, listEconomicCatalogs, readEconomicHistory, readEconomicProfile } from "@/db/repositories/tax-economic/registry";
import { changeEconomicRegistration, insertEconomicRegistration, lockEconomicRegistration, readEconomicRegistration, readEconomicTaxpayer } from "@/db/repositories/tax-economic/registrations";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { enforceEconomicProfileDebtPolicy } from "./economic-debt-policy";
import { resolveEconomicActivityCode } from "./economic-activity-registry";

type Change = { municipalInsc?: string; primaryCnae?: string | null; taxRegime?: string | null; status?: string };
const snapshot = (row: EconomicRegistration) => ({ municipalInsc: row.municipalInsc, primaryCnae: row.primaryCnae, taxRegime: row.taxRegime, status: row.status, taxpayerId: row.taxpayerId, startDate: row.startDate?.toISOString() ?? null });

async function history(tx: DatabaseTransaction, actor: TaxActor, row: EconomicRegistration, before: ReturnType<typeof snapshot> | null, version: number, observedAt: Date) {
  const after = snapshot(row);
  const fields = Object.keys(after).filter(key => !before || before[key as keyof typeof before] !== after[key as keyof typeof after]);
  return appendEconomicEntry(tx, { entityType: "ECONOMIC_REGISTRATION", entityId: row.id, category: "CADASTRAL_HISTORY", title: `Posição cadastral ${version}`, version, effectiveFrom: observedAt, actorUsuarioId: actor.usuarioId, source: "CADASTRO_ECONOMICO", data: { before, after, fields, observedAt: observedAt.toISOString(), baseline: before === null } });
}

export async function createEconomicRegistrationWithHistory(db: DatabaseConnection, actor: TaxActor, input: { municipalInsc: string; primaryCnae: string; taxRegime: string; taxpayerId: string }) {
  return withDatabaseTransaction(db, tx => createEconomicRegistrationWithHistoryInTransaction(tx, actor, input), { timeoutMs: 5000 });
}

export async function createEconomicRegistrationWithHistoryInTransaction(tx: DatabaseTransaction, actor: TaxActor, input: { municipalInsc: string; primaryCnae: string; taxRegime: string; taxpayerId: string; startDate?: Date }): Promise<EconomicRegistration> {
  if (!input.municipalInsc.trim()) throw new Error("Inscrição municipal é obrigatória.");
  const taxpayer = await readEconomicTaxpayer(tx, input.taxpayerId);
  if (!taxpayer) throw new Error("Contribuinte não encontrado.");
  if (taxpayer.status !== "Ativo") throw new Error("Selecione um contribuinte ativo.");
  const now = new Date();
  const row = await insertEconomicRegistration(tx, { municipalInsc: input.municipalInsc.trim(), primaryCnae: input.primaryCnae.trim() || null, taxRegime: input.taxRegime.trim() || null, taxpayerId: taxpayer.id, status: "Ativo", startDate: input.startDate ?? now });
  await history(tx, actor, row, null, 1, now);
  await appendEconomicAudit(tx, { action: "CREATE_ECONOMIC_REGISTRATION", entityType: "EconomicRegistration", entityId: row.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { after: snapshot(row) } });
  return row;
}

export async function updateEconomicRegistrationWithHistory(db: DatabaseConnection, actor: TaxActor, id: string, input: Change) {
  return withDatabaseTransaction(db, tx => updateEconomicRegistrationWithHistoryInTransaction(tx, actor, id, input), { timeoutMs: 5000 });
}

export async function updateEconomicRegistrationWithHistoryInTransaction(tx: DatabaseTransaction, actor: TaxActor, id: string, input: Change, options: { profileManaged?: boolean } = {}): Promise<EconomicRegistration> {
  const data: Change = {};
  if (input.municipalInsc !== undefined) { if (!input.municipalInsc.trim()) throw new Error("Inscrição municipal é obrigatória."); data.municipalInsc = input.municipalInsc.trim(); }
  if (input.primaryCnae !== undefined) data.primaryCnae = input.primaryCnae?.trim() || null;
  if (data.primaryCnae && !/^\d{7}$/.test(data.primaryCnae)) throw new Error("CNAE principal exige sete dígitos.");
  if (input.taxRegime !== undefined) data.taxRegime = input.taxRegime?.trim() || null;
  if (input.status !== undefined) {
    if (!["Ativo", "Inativo", "Baixado", "Suspenso"].includes(input.status)) {
      const definitions = await listCompanySituationCatalogs(tx);
      const latest = new Map<string, typeof definitions[number]>();
      for (const definition of definitions) if (!latest.has(definition.entityId)) latest.set(definition.entityId, definition);
      if (![...latest.values()].some(definition => { const configuration = taxScopeSnapshot(definition.data); return definition.title === input.status && configuration.kind === "SITUACAO_EMPRESA" && configuration.active === true && (!actor.allowedBudgetUnitIds || typeof configuration.budgetUnitId === "string" && actor.allowedBudgetUnitIds.includes(configuration.budgetUnitId)); })) throw new Error("Situação cadastral inválida.");
    }
    data.status = input.status;
  }
  await lockEconomicRegistration(tx, id);
  const before = await readEconomicRegistration(tx, id);
  const profile = await readEconomicProfile(tx, id);
  const profileScope = taxScopeSnapshot(profile?.data);
  if (!profile && actor.allowedBudgetUnitIds && !options.profileManaged) throw new Error("Cadastro econômico sem origem conciliada para o acesso autorizado.");
  if(profile && data.primaryCnae===null) throw new Error("Perfil econômico conciliado exige atividade principal.");
  if(data.primaryCnae && typeof profileScope.governmentEntityId==="string" && typeof profileScope.budgetUnitId==="string") data.primaryCnae=await resolveEconomicActivityCode(tx,profileScope.governmentEntityId,profileScope.budgetUnitId,data.primaryCnae);
  if (profile && actor.allowedBudgetUnitIds && (typeof profileScope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(profileScope.budgetUnitId))) throw new Error("UG fora do acesso autorizado.");
  if (profile && data.status && !["Ativo", "Inativo", "Baixado", "Suspenso"].includes(data.status)) {
    const definitions = await listEconomicCatalogs(tx, economicSnapshot(profileScope.budgetUnitId), economicSnapshot(profileScope.governmentEntityId));
    const latest = new Map<string, typeof definitions[number]>(); for (const entry of definitions) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
    if (![...latest.values()].some(entry => { const scope = taxScopeSnapshot(entry.data); return entry.title === data.status && scope.kind === "SITUACAO_EMPRESA" && scope.active === true && entry.status === "ATIVO"; })) throw new Error("Situação cadastral não pertence à origem conciliada da empresa.");
  }
  const last = await readEconomicHistory(tx, id);
  const currentSnapshot = snapshot(before);
  if (last) {
    const stored = taxScopeSnapshot(taxScopeSnapshot(last.data).after);
    if (Object.entries(currentSnapshot).some(([key, value]) => stored[key] !== value)) throw new Error("Cadastro alterado fora do histórico; concilie a posição antes de editar.");
  }
  let version = last?.version ?? 0;
  const now = new Date();
  if (!last) { await history(tx, actor, before, null, ++version, now); }
  const changed = Object.entries(data).some(([key, value]) => currentSnapshot[key as keyof typeof currentSnapshot] !== value);
  if (!changed) return before;
  if (data.municipalInsc !== undefined || data.primaryCnae !== undefined || data.taxRegime !== undefined || data.status === "Ativo") await enforceEconomicProfileDebtPolicy(tx, actor, id);
  const row = await changeEconomicRegistration(tx, id, data);
  if (profile && !options.profileManaged && data.primaryCnae !== undefined && before.primaryCnae !== row.primaryCnae) {
    const secondaryCnaes = Array.isArray(profileScope.secondaryCnaes) ? profileScope.secondaryCnaes.filter(code => typeof code === "string" && code !== row.primaryCnae) : [];
    await appendEconomicEntry(tx, { entityType: "ECONOMIC_REGISTRATION", entityId: row.id, category: "ECONOMIC_PROFILE", title: "Perfil econômico", version: profile.version + 1, source: "CADASTRO_ECONOMICO", actorUsuarioId: actor.usuarioId, data: economicSnapshot({ ...profileScope, primaryCnae: row.primaryCnae, secondaryCnaes, expectedVersion: profile.version, previousId: profile.id, reason: "Atualização da atividade principal pelo cadastro econômico." }) });
  }
  await history(tx, actor, row, currentSnapshot, version + 1, now);
  await appendEconomicAudit(tx, { action: "UPDATE_ECONOMIC_REGISTRATION", entityType: "EconomicRegistration", entityId: id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: currentSnapshot, after: snapshot(row), changedFields: Object.keys(data) } });
  return row;
}
