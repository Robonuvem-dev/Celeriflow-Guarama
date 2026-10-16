import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { economicQuerySchema, readEconomicProfilesInTransaction } from "./economic-query";
import { economicProfileSchema, saveEconomicProfileInTransaction } from "./economic-profile";
import { updateEconomicRegistrationWithHistoryInTransaction } from "./economic-history";
import { fiscalCatalogSchema, saveConfiguredFiscalRecordInTransaction } from "./configurable-cadastres";
import { taxScopeSnapshot } from "./scope";

const profilePatchSchema = z.object({ ...economicProfileSchema.shape }).omit({ registrationId: true, expectedVersion: true, governmentEntityId: true, budgetUnitId: true, primaryCnae: true, secondaryCnaes: true, companyType: true, processId: true, reason: true }).partial().strict();
export const economicBulkChangeSchema = z.object({ filter: economicQuerySchema, targets: z.array(z.object({ id: z.string().min(1), updatedAt: z.iso.datetime(), profileVersion: z.number().int().positive() })).min(1).max(1000), changes: z.object({ primaryCnae: z.string().regex(/^\d{7}$/).optional(), companyType: z.string().trim().min(1).max(120).optional(), taxRegime: z.string().trim().min(1).max(80).optional(), status: z.string().trim().min(1).max(120).optional(), secondaryCnaes: z.array(z.string().regex(/^\d{7}$/)).max(100).optional() }).strict(), profilePatch: profilePatchSchema.optional(), form: z.object({ catalogId: z.string().min(1), expectedCatalogVersion: z.number().int().positive(), expectedRecordVersions: z.record(z.string(), z.number().int().nonnegative()), values: z.record(z.string(), z.unknown()) }).optional(), processId: z.string().nullable(), reason: z.string().trim().min(1).max(4000) }).refine(input => Object.keys(input.changes).length + Object.keys(input.profilePatch ?? {}).length > 0 || input.form !== undefined,"Informe os campos da alteração geral.");

export async function bulkChangeEconomicProfiles(db: PrismaClient, actor: TaxActor, raw: z.input<typeof economicBulkChangeSchema>) {
  const input=economicBulkChangeSchema.parse(raw);
  if(new Set(input.targets.map(target=>target.id)).size!==input.targets.length) throw new Error("Cadastros repetidos na seleção.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ECONOMIC_BULK_CHANGE:${input.filter.governmentEntityId}`},0))::text`;
    if (input.form) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_CATALOG_ID:${input.form.catalogId}`},0))::text`;
    for(const target of [...input.targets].sort((a,b)=>a.id.localeCompare(b.id))) await tx.$queryRaw`SELECT id FROM "EconomicRegistration" WHERE id=${target.id} FOR UPDATE`;
    const rows=await readEconomicProfilesInTransaction(tx,actor,input.filter);
    if(rows.length!==input.targets.length || rows.some(row=>!input.targets.some(target=>target.id===row.id && target.updatedAt===row.updatedAt && target.profileVersion===row.profileVersion))) throw new Error("O filtro, a seleção ou a posição cadastral mudou. Recarregue a prévia.");
    if (input.form) {
      const definition = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "FISCAL_CATALOG", entityId: input.form.catalogId, category: "TYPED_FISCAL_CATALOG" }, orderBy: { version: "desc" } });
      const catalog = fiscalCatalogSchema.parse(definition.data);
      if (!catalog.active || catalog.kind !== "FORMULARIO_EMPRESA" || definition.version !== input.form.expectedCatalogVersion || rows.some(row => row.profile.governmentEntityId !== catalog.governmentEntityId || row.profile.budgetUnitId !== catalog.budgetUnitId)) throw new Error("Formulário alterado ou de outra origem. Refaça a prévia na UG do formulário.");
    }
    for(const row of rows.sort((a,b)=>a.id.localeCompare(b.id))) {
      if (input.processId && !await tx.process.findUnique({ where: { id: input.processId } })) throw new Error("Protocolo não encontrado.");
      if(input.changes.primaryCnae!==undefined || input.changes.companyType!==undefined || input.changes.secondaryCnaes!==undefined || Object.keys(input.profilePatch ?? {}).length) await saveEconomicProfileInTransaction(tx,actor,{...row.profile,...input.profilePatch,registrationId:row.id,expectedVersion:row.profileVersion,primaryCnae:input.changes.primaryCnae ?? row.profile.primaryCnae,companyType:input.changes.companyType ?? row.profile.companyType,secondaryCnaes:input.changes.secondaryCnaes ?? row.profile.secondaryCnaes,processId:input.processId,reason:input.reason});
      if(input.changes.taxRegime!==undefined || input.changes.status!==undefined) await updateEconomicRegistrationWithHistoryInTransaction(tx,actor,row.id,{taxRegime:input.changes.taxRegime,status:input.changes.status});
      if (input.form) {
        const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: row.id, category: "TYPED_FISCAL_RECORD", title: input.form.catalogId }, orderBy: { version: "desc" } });
        if (input.form.expectedRecordVersions[row.id] !== (previous?.version ?? 0)) throw new Error("Um formulário da seleção foi alterado. Refaça a prévia.");
        const frozen = taxScopeSnapshot(previous?.data);
        await saveConfiguredFiscalRecordInTransaction(tx, actor, { catalogId: input.form.catalogId, entityType: "ECONOMIC_REGISTRATION", entityId: row.id, expectedVersion: previous?.version ?? 0, active: true, values: { ...taxScopeSnapshot(frozen.values), ...input.form.values }, processId: input.processId, documentIds: Array.isArray(frozen.documentIds) ? frozen.documentIds.filter((id): id is string => typeof id === "string") : [], frontage: null });
        await tx.economicRegistration.update({ where: { id: row.id }, data: { updatedAt: new Date() } });
      }
      await tx.taxRegistryEntry.create({data:{entityType:"ECONOMIC_REGISTRATION",entityId:row.id,category:"ECONOMIC_BULK_CHANGE",title:"Alteração geral econômica",processId:input.processId,actorUsuarioId:actor.usuarioId,data:JSON.parse(JSON.stringify({governmentEntityId:row.profile.governmentEntityId,budgetUnitId:row.profile.budgetUnitId,filter:input.filter,changes:input.changes,profilePatch:input.profilePatch ?? null,form:input.form ?? null,before:{profileVersion:row.profileVersion,status:row.status,taxRegime:row.taxRegime},reason:input.reason}))}});
    }
    return {count:rows.length};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
