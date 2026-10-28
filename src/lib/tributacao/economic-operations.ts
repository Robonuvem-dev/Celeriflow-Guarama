import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { appendEconomicEntry, lockEconomicKey, readEconomicCatalog, readEconomicFiscalRecord } from "@/db/repositories/tax-economic/registry";
import { changeEconomicRegistration, hasEconomicProcess, lockEconomicRegistration } from "@/db/repositories/tax-economic/registrations";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import { z } from "zod";
import type { TaxActor } from "./index";
import { economicQuerySchema, readEconomicProfilesInTransaction } from "./economic-query";
import { economicProfileSchema, saveEconomicProfileInTransaction } from "./economic-profile";
import { updateEconomicRegistrationWithHistoryInTransaction } from "./economic-history";
import { fiscalCatalogSchema, saveConfiguredFiscalRecordInTransaction } from "./configurable-cadastres";
import { taxScopeSnapshot } from "./scope";

const profilePatchSchema = z.object({ ...economicProfileSchema.shape }).omit({ registrationId: true, expectedVersion: true, governmentEntityId: true, budgetUnitId: true, primaryCnae: true, secondaryCnaes: true, companyType: true, processId: true, reason: true }).partial().strict();
export const economicBulkChangeSchema = z.object({ filter: economicQuerySchema, targets: z.array(z.object({ id: z.string().min(1), updatedAt: z.iso.datetime(), profileVersion: z.number().int().positive() })).min(1).max(1000), changes: z.object({ primaryCnae: z.string().regex(/^\d{7}$/).optional(), companyType: z.string().trim().min(1).max(120).optional(), taxRegime: z.string().trim().min(1).max(80).optional(), status: z.string().trim().min(1).max(120).optional(), secondaryCnaes: z.array(z.string().regex(/^\d{7}$/)).max(100).optional() }).strict(), profilePatch: profilePatchSchema.optional(), form: z.object({ catalogId: z.string().min(1), expectedCatalogVersion: z.number().int().positive(), expectedRecordVersions: z.record(z.string(), z.number().int().nonnegative()), values: z.record(z.string(), z.unknown()) }).optional(), processId: z.string().nullable(), reason: z.string().trim().min(1).max(4000) }).refine(input => Object.keys(input.changes).length + Object.keys(input.profilePatch ?? {}).length > 0 || input.form !== undefined,"Informe os campos da alteração geral.");

export async function bulkChangeEconomicProfiles(db: DatabaseConnection, actor: TaxActor, raw: z.input<typeof economicBulkChangeSchema>) {
  const input=economicBulkChangeSchema.parse(raw);
  if(new Set(input.targets.map(target=>target.id)).size!==input.targets.length) throw new Error("Cadastros repetidos na seleção.");
  return withDatabaseTransaction(db, async tx => {
    await lockEconomicKey(tx, `ECONOMIC_BULK_CHANGE:${input.filter.governmentEntityId}`);
    if (input.form) await lockEconomicKey(tx, `FISCAL_CATALOG_ID:${input.form.catalogId}`);
    for(const target of [...input.targets].sort((a,b)=>a.id.localeCompare(b.id))) await lockEconomicRegistration(tx,target.id);
    const rows=await readEconomicProfilesInTransaction(tx,actor,input.filter);
    if(rows.length!==input.targets.length || rows.some(row=>!input.targets.some(target=>target.id===row.id && target.updatedAt===row.updatedAt && target.profileVersion===row.profileVersion))) throw new Error("O filtro, a seleção ou a posição cadastral mudou. Recarregue a prévia.");
    if (input.form) {
      const definition = await readEconomicCatalog(tx, input.form.catalogId);
      const catalog = fiscalCatalogSchema.parse(definition.data);
      if (!catalog.active || catalog.kind !== "FORMULARIO_EMPRESA" || definition.version !== input.form.expectedCatalogVersion || rows.some(row => row.profile.governmentEntityId !== catalog.governmentEntityId || row.profile.budgetUnitId !== catalog.budgetUnitId)) throw new Error("Formulário alterado ou de outra origem. Refaça a prévia na UG do formulário.");
    }
    for(const row of rows.sort((a,b)=>a.id.localeCompare(b.id))) {
      if (input.processId && !await hasEconomicProcess(tx, input.processId)) throw new Error("Protocolo não encontrado.");
      if(input.changes.primaryCnae!==undefined || input.changes.companyType!==undefined || input.changes.secondaryCnaes!==undefined || Object.keys(input.profilePatch ?? {}).length) await saveEconomicProfileInTransaction(tx,actor,{...row.profile,...input.profilePatch,registrationId:row.id,expectedVersion:row.profileVersion,primaryCnae:input.changes.primaryCnae ?? row.profile.primaryCnae,companyType:input.changes.companyType ?? row.profile.companyType,secondaryCnaes:input.changes.secondaryCnaes ?? row.profile.secondaryCnaes,processId:input.processId,reason:input.reason});
      if(input.changes.taxRegime!==undefined || input.changes.status!==undefined) await updateEconomicRegistrationWithHistoryInTransaction(tx,actor,row.id,{taxRegime:input.changes.taxRegime,status:input.changes.status});
      if (input.form) {
        const previous = await readEconomicFiscalRecord(tx, row.id, input.form.catalogId);
        if (input.form.expectedRecordVersions[row.id] !== (previous?.version ?? 0)) throw new Error("Um formulário da seleção foi alterado. Refaça a prévia.");
        const frozen = taxScopeSnapshot(previous?.data);
        await saveConfiguredFiscalRecordInTransaction(tx, actor, { catalogId: input.form.catalogId, entityType: "ECONOMIC_REGISTRATION", entityId: row.id, expectedVersion: previous?.version ?? 0, active: true, values: { ...taxScopeSnapshot(frozen.values), ...input.form.values }, processId: input.processId, documentIds: Array.isArray(frozen.documentIds) ? frozen.documentIds.filter((id): id is string => typeof id === "string") : [], frontage: null });
        await changeEconomicRegistration(tx, row.id, {});
      }
      await appendEconomicEntry(tx,{entityType:"ECONOMIC_REGISTRATION",entityId:row.id,category:"ECONOMIC_BULK_CHANGE",title:"Alteração geral econômica",processId:input.processId,actorUsuarioId:actor.usuarioId,data:economicSnapshot({governmentEntityId:row.profile.governmentEntityId,budgetUnitId:row.profile.budgetUnitId,filter:input.filter,changes:input.changes,profilePatch:input.profilePatch ?? null,form:input.form ?? null,before:{profileVersion:row.profileVersion,status:row.status,taxRegime:row.taxRegime},reason:input.reason})});
    }
    return {count:rows.length};
  },{isolationLevel:"serializable",timeoutMs:60000});
}
