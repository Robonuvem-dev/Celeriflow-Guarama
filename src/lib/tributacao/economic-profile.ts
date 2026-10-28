import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { appendEconomicAudit, appendEconomicEntry, listEconomicCatalogs, listEconomicProfiles, lockEconomicKey, readEconomicAccountant, readEconomicProfile } from "@/db/repositories/tax-economic/registry";
import { countActiveEconomicTaxpayers, countEconomicProperties, countValidEconomicDocuments, hasEconomicOrigin, hasEconomicProcess, listEconomicTaxpayerNames, lockEconomicRegistration, readEconomicRegistration } from "@/db/repositories/tax-economic/registrations";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { createEconomicRegistrationWithHistoryInTransaction, updateEconomicRegistrationWithHistoryInTransaction } from "./economic-history";
import { assertEconomicTaxpayerDebtFree } from "./economic-debt-policy";
import { resolveEconomicActivityCode } from "./economic-activity-registry";
import { assertPropertyCadastralAccess } from "./property-access";

const address = z.object({ street: z.string().trim().min(1).max(240), number: z.string().max(40), complement: z.string().max(240), neighborhood: z.string().max(240), city: z.string().trim().min(1).max(240), state: z.string().length(2), zipCode: z.string().max(12) });
const share = z.string().refine(value => { try { const number = new Decimal(value); return number.isFinite() && number.gt(0) && number.lte(100) && number.decimalPlaces() <= 6; } catch { return false; } }, "Participação deve ser positiva e até 100%.");
export const economicProfileSchema = z.object({
  registrationId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1),
  accountantTaxpayerId: z.string().nullable(), accountantCrc: z.string().trim().max(80), companyType: z.string().trim().min(1).max(120),
  realEstateIds: z.array(z.string().min(1)).max(100), primaryCnae: z.string().regex(/^\d{7}$/, "CNAE principal exige sete dígitos."), secondaryCnaes: z.array(z.string().regex(/^\d{7}$/)).max(100),
  partners: z.array(z.object({ taxpayerId: z.string().min(1), role: z.string().trim().min(1).max(120), sharePercent: share, validateDebt: z.boolean() })).max(100),
  contractNumber: z.string().max(120), contractDate: z.iso.date().nullable(), companyAddress: address, correspondenceAddress: address,
  latitude: z.number().finite().min(-90).max(90).nullable(), longitude: z.number().finite().min(-180).max(180).nullable(),
  provisionalUntil: z.iso.date().nullable(), validateCompanyDebt: z.boolean(), validatePartnerDebts: z.boolean(), documentIds: z.array(z.string().min(1)).max(100), processId: z.string().nullable(), reason: z.string().trim().min(1).max(4000),
  provisionalDays: z.number().int().min(1).max(3650).nullable().optional(), provisionalStartDate: z.iso.date().nullable().optional(),
}).refine(input => (input.latitude === null) === (input.longitude === null), "Informe latitude e longitude juntas.")
  .refine(input => new Set(input.secondaryCnaes).size === input.secondaryCnaes.length && !input.secondaryCnaes.includes(input.primaryCnae), "Atividades secundárias devem ser distintas da principal.")
  .refine(input => new Set(input.partners.map(partner => partner.taxpayerId)).size === input.partners.length, "Sócios repetidos.")
  .refine(input => !input.partners.length || input.partners.reduce((sum, partner) => sum.plus(partner.sharePercent), new Decimal(0)).eq(100), "Participações dos sócios devem totalizar 100%.");

export async function saveEconomicProfile(db: DatabaseConnection, actor: TaxActor, raw: z.input<typeof economicProfileSchema>) {
  const input = economicProfileSchema.parse(raw);
  return withDatabaseTransaction(db, tx => saveEconomicProfileInTransaction(tx, actor, input), { isolationLevel: "serializable", timeoutMs: 60000 });
}

export async function createEconomicRegistrationWithProfile(db: DatabaseConnection, actor: TaxActor, raw: { municipalInsc: string; taxRegime: string; taxpayerId: string; profile: z.input<typeof economicProfileSchema> }) {
  return withDatabaseTransaction(db, tx => createEconomicRegistrationWithProfileInTransaction(tx, actor, raw), { isolationLevel: "serializable", timeoutMs: 60000 });
}

export async function createEconomicRegistrationWithProfileInTransaction(tx: DatabaseTransaction, actor: TaxActor, raw: { municipalInsc: string; taxRegime: string; taxpayerId: string; profile: z.input<typeof economicProfileSchema>; startDate?: Date }) {
    if (!raw.taxRegime.trim()) throw new Error("Informe o regime de tributação da empresa.");
    const row = await createEconomicRegistrationWithHistoryInTransaction(tx, actor, { municipalInsc: raw.municipalInsc, taxRegime: raw.taxRegime, taxpayerId: raw.taxpayerId, primaryCnae: raw.profile.primaryCnae, startDate: raw.startDate });
    const input = economicProfileSchema.parse({ ...raw.profile, registrationId: row.id, expectedVersion: 0 });
    await saveEconomicProfileInTransaction(tx, actor, input);
    return row;
}

export async function saveEconomicProfileInTransaction(tx: DatabaseTransaction, actor: TaxActor, raw: z.input<typeof economicProfileSchema>) {
    const input = economicProfileSchema.parse(raw);
    if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    if (!await hasEconomicOrigin(tx, input)) throw new Error("Ente/UG não conciliados.");
    input.primaryCnae=await resolveEconomicActivityCode(tx,input.governmentEntityId,input.budgetUnitId,input.primaryCnae);
    const secondary:string[]=[];
    for(const code of input.secondaryCnaes) {const resolved=await resolveEconomicActivityCode(tx,input.governmentEntityId,input.budgetUnitId,code);if(resolved!==input.primaryCnae && !secondary.includes(resolved)) secondary.push(resolved);}
    input.secondaryCnaes=secondary;
    await lockEconomicRegistration(tx, input.registrationId);
    const registration = await readEconomicRegistration(tx, input.registrationId);
    const previous = await readEconomicProfile(tx, registration.id);
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O perfil econômico foi alterado. Recarregue antes de salvar.");
    if (previous) { const scope = taxScopeSnapshot(previous.data); if (scope.budgetUnitId !== input.budgetUnitId || scope.governmentEntityId !== input.governmentEntityId) throw new Error("Origem do perfil econômico é imutável."); }
    const definitions = await listEconomicCatalogs(tx, input.budgetUnitId);
    const latestDefinitions = new Map<string, typeof definitions[number]>();
    for (const definition of definitions) if (!latestDefinitions.has(definition.entityId)) latestDefinitions.set(definition.entityId, definition);
    const scopedDefinitions = [...latestDefinitions.values()].filter(definition => taxScopeSnapshot(definition.data).governmentEntityId === input.governmentEntityId);
    const companyTypes = scopedDefinitions.filter(definition => taxScopeSnapshot(definition.data).kind === "TIPO_EMPRESA");
    const partnerTypes = scopedDefinitions.filter(definition => taxScopeSnapshot(definition.data).kind === "TIPO_SOCIO");
    if (companyTypes.length && !companyTypes.some(definition => definition.title === input.companyType && definition.status === "ATIVO")) throw new Error("Selecione um tipo de empresa ativo na UG do perfil.");
    const companyType=companyTypes.find(definition=>definition.title===input.companyType && definition.status==="ATIVO");
    const typeData=taxScopeSnapshot(companyType?.data);
    input.validateCompanyDebt=input.validateCompanyDebt || typeData.validateCompanyDebt===true;
    input.validatePartnerDebts=input.validatePartnerDebts || typeData.validateCompanyPartnerDebts===true;
    if(!previous && !input.provisionalUntil && !input.provisionalDays && typeof typeData.provisionalValidityDays==="number") input.provisionalDays=typeData.provisionalValidityDays;
    if(input.provisionalDays) {
      const start=input.provisionalStartDate ?? registration.startDate?.toISOString().slice(0,10) ?? new Date().toISOString().slice(0,10);
      const end=new Date(`${start}T12:00:00.000Z`);end.setUTCDate(end.getUTCDate()+input.provisionalDays-1);
      const until=end.toISOString().slice(0,10);
      if(input.provisionalUntil && input.provisionalUntil!==until) throw new Error("Validade provisória diverge da data inicial e quantidade de dias.");
      input.provisionalStartDate=start;input.provisionalUntil=until;
    }
    for (const partner of input.partners) {
      if (!partnerTypes.length) continue;
      const type = partnerTypes.find(definition => definition.title === partner.role && definition.status === "ATIVO");
      if (!type) throw new Error("Selecione um tipo de sócio ativo na UG do perfil.");
      partner.validateDebt = taxScopeSnapshot(type.data).validatePartnerDebt === true;
    }
    const ids = [...new Set([input.accountantTaxpayerId, ...input.partners.map(partner => partner.taxpayerId)].filter((id): id is string => Boolean(id)))];
    if (await countActiveEconomicTaxpayers(tx, ids) !== ids.length) throw new Error("Contador e sócios devem pertencer ao cadastro único e estar ativos.");
    if (input.accountantTaxpayerId && !input.accountantCrc.trim()) throw new Error("Informe o CRC do contador.");
    if (input.accountantTaxpayerId) {
      await lockEconomicKey(tx, `ACCOUNTANT:${input.accountantTaxpayerId}`);
      const accountant = await readEconomicAccountant(tx, input.accountantTaxpayerId);
      if (accountant && taxScopeSnapshot(accountant.data).crc !== input.accountantCrc) throw new Error("CRC diverge do cadastro único do contador.");
      if (!accountant) await appendEconomicEntry(tx, { entityType: "TAXPAYER", entityId: input.accountantTaxpayerId, category: "ACCOUNTANT", title: input.accountantCrc, actorUsuarioId: actor.usuarioId, data: { crc: input.accountantCrc } });
    }
    if (await countEconomicProperties(tx, input.realEstateIds) !== new Set(input.realEstateIds).size) throw new Error("Imóvel vinculado não encontrado.");
    for (const propertyId of new Set(input.realEstateIds)) {
      const property = await assertPropertyCadastralAccess(tx, actor, propertyId);
      if (property.scope.governmentEntityId !== input.governmentEntityId || property.scope.budgetUnitId !== input.budgetUnitId) throw new Error("Imóvel relacionado exige perfil conciliado na mesma origem da empresa.");
    }
    if (input.processId && !await hasEconomicProcess(tx, input.processId)) throw new Error("Protocolo não encontrado.");
    if (await countValidEconomicDocuments(tx, input.documentIds) !== new Set(input.documentIds).size) throw new Error("Anexo GED inválido.");
    const debtScope = { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId };
    if (input.validateCompanyDebt) await assertEconomicTaxpayerDebtFree(tx, registration.taxpayerId, debtScope);
    if (input.validatePartnerDebts) for (const partner of input.partners.filter(partner => partner.validateDebt)) await assertEconomicTaxpayerDebtFree(tx, partner.taxpayerId, debtScope);
    const relatedTaxpayers = await listEconomicTaxpayerNames(tx, ids);
    const relatedTaxpayerNames = Object.fromEntries(relatedTaxpayers.map(taxpayer => [taxpayer.id, taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id]));
    await updateEconomicRegistrationWithHistoryInTransaction(tx, actor, registration.id, { primaryCnae: input.primaryCnae }, { profileManaged: true });
    const profile = await appendEconomicEntry(tx, { entityType: "ECONOMIC_REGISTRATION", entityId: registration.id, category: "ECONOMIC_PROFILE", title: "Perfil econômico", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, processId: input.processId, data: economicSnapshot({ ...input, relatedTaxpayerNames, previousId: previous?.id ?? null }) });
    await appendEconomicAudit(tx, { action: "SAVE_ECONOMIC_PROFILE", entityType: "EconomicRegistration", entityId: registration.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: profile.data } });
    return profile;
}

/** Called by the scheduled municipal worker; no default validity is assumed. */
export async function expireProvisionalEconomicRegistrations(db: DatabaseConnection, actor: TaxActor, input: { governmentEntityId: string; budgetUnitId: string; date: string }) {
  const date = z.iso.date().parse(input.date);
  return withDatabaseTransaction(db, async tx => {
    if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    if (!await hasEconomicOrigin(tx, input)) throw new Error("Ente/UG não conciliados.");
    await lockEconomicKey(tx, `PROVISIONAL_ECONOMIC_EXPIRY:${input.budgetUnitId}`);
    const profiles = await listEconomicProfiles(tx, { budgetUnitId: input.budgetUnitId, expiry: true });
    const latest = new Map<string, typeof profiles[number]>();
    for (const profile of profiles) if (!latest.has(profile.entityId)) latest.set(profile.entityId, profile);
    let count = 0;
    for (const profile of [...latest.values()].sort((a, b) => a.entityId.localeCompare(b.entityId))) {
      const data = economicProfileSchema.parse(profile.data);
      if (data.governmentEntityId !== input.governmentEntityId || !data.provisionalUntil || data.provisionalUntil >= date) continue;
      await lockEconomicRegistration(tx, profile.entityId);
      const currentProfile = await readEconomicProfile(tx, profile.entityId, true);
      if (currentProfile?.id !== profile.id) throw new Error("Perfil provisório alterado durante a expiração. Repita a execução.");
      const row = await readEconomicRegistration(tx, profile.entityId);
      if (["Baixado", "Inativo"].includes(row.status)) continue;
      await updateEconomicRegistrationWithHistoryInTransaction(tx, actor, row.id, { status: "Inativo" });
      await appendEconomicEntry(tx, { entityType: "ECONOMIC_REGISTRATION", entityId: row.id, category: "PROVISIONAL_EXPIRY", title: `Vencimento ${data.provisionalUntil}`, actorUsuarioId: actor.usuarioId, data: { profileId: profile.id, date, provisionalUntil: data.provisionalUntil, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId } });
      count++;
    }
    return { count };
  }, { timeoutMs: 60000 });
}
