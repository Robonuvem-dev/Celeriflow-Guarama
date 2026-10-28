import { sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { appendPropertyAudit, appendPropertyRegistryEntry, closePropertyOwnership, countValidPropertyDocuments, insertProperty, listPropertyOwners, listPropertyProfileChildren, lockProperty, lockPropertyKey, mutateProperty, propertyNeighborhoodExists, propertyOriginExists, propertyProcessExists, propertyStreetExists, readLatestPropertyProfile, readProperty, readPropertyOwnership, readPropertyRegistrationPolicy } from "@/db/repositories/tax-property/records";
import { propertySnapshot } from "@/db/repositories/tax-property/snapshot";
import type { PropertyRecord, PropertyRegistryRecord } from "@/db/repositories/tax-property/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { attributePropertyHistory } from "./property-history";
import { formatPropertyInscription, propertyProfileSchema, propertyRegistrationPolicySchema } from "./property-profile-schema";

async function authorize(tx: DatabaseTransaction, actor: TaxActor, governmentEntityId: string, budgetUnitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await propertyOriginExists(tx, governmentEntityId, budgetUnitId)) throw new Error("Ente/UG não conciliados.");
}

export async function publishPropertyRegistrationPolicy(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof propertyRegistrationPolicySchema>): Promise<PropertyRegistryRecord> {
  const input = propertyRegistrationPolicySchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    await lockPropertyKey(tx, `PROPERTY_REGISTRATION_POLICY:${input.budgetUnitId}`);
    const previous = await readPropertyRegistrationPolicy(tx, input.budgetUnitId);
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("A configuração foi alterada. Recarregue antes de publicar.");
    if (previous && taxScopeSnapshot(previous.data).governmentEntityId !== input.governmentEntityId) throw new Error("Origem da configuração divergente.");
    const entry = await appendPropertyRegistryEntry(tx, { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "PROPERTY_REGISTRATION_POLICY", title: "Inscrição e controles imobiliários", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: propertySnapshot(input) });
    await appendPropertyAudit(tx, { action: "PUBLISH_PROPERTY_REGISTRATION_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: propertySnapshot({ before: previous?.data ?? null, after: input }) });
    return entry;
  });
}

export async function savePropertyProfile(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof propertyProfileSchema>): Promise<PropertyRegistryRecord> {
  return withDatabaseTransaction(connection, tx => savePropertyProfileInTransaction(tx, actor, raw), { isolationLevel: "serializable", timeoutMs: 60000 });
}

export async function savePropertyProfileInTransaction(tx: DatabaseTransaction, actor: TaxActor, raw: z.input<typeof propertyProfileSchema>): Promise<PropertyRegistryRecord> {
  const input = propertyProfileSchema.parse(raw);
  const total = input.owners.reduce((sum, owner) => { const share = new Decimal(owner.sharePercent); if (!share.isFinite() || share.lte(0) || share.gt(100)) throw new Error("Participação de proprietário inválida."); return sum.plus(share); }, new Decimal(0));
  if (!total.eq(100)) throw new Error("As participações dos proprietários devem totalizar 100%.");
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    await lockPropertyKey(tx, `PROPERTY_REGISTRATION_POLICY:${input.budgetUnitId}`);
    // Parent and child are locked in the same deterministic order as other operations.
    for (const id of [...new Set([input.propertyId, input.parentId].filter((value): value is string => Boolean(value)))].sort()) await lockProperty(tx, id);
    const property = await readProperty(tx, input.propertyId);
    if (property.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("O imóvel foi alterado. Recarregue antes de salvar.");
    const previous = await readLatestPropertyProfile(tx, property.id);
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O perfil imobiliário foi alterado. Recarregue antes de salvar.");
    if (previous) { const data = taxScopeSnapshot(previous.data); if (data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId) throw new Error("Origem do perfil imobiliário é imutável."); }
    if (input.parentId) {
      const parent = await readProperty(tx, input.parentId);
      const parentProfile = await readLatestPropertyProfile(tx, parent.id);
      const data = taxScopeSnapshot(parentProfile?.data);
      if (data.kind !== "Terreno" || data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId || ["Baixado", "Inativo", "Desmembrado", "Remembrado"].includes(parent.status)) throw new Error("Selecione um terreno ativo com perfil conciliado na mesma origem.");
    }
    if (input.kind !== "Terreno") {
      const children = await listPropertyProfileChildren(tx, property.id);
      for (const child of children) { const latest = await readLatestPropertyProfile(tx, child.entityId); if (taxScopeSnapshot(latest?.data).parentId === property.id) throw new Error("Terreno com unidades vinculadas não pode mudar de tipo."); }
    }
    const owners = await listPropertyOwners(tx, input.owners.map(owner => owner.taxpayerId));
    if (owners.length !== input.owners.length) throw new Error("Selecione proprietários ativos do cadastro único.");
    if (input.processId && !await propertyProcessExists(tx, input.processId)) throw new Error("Protocolo não encontrado.");
    if (await countValidPropertyDocuments(tx, input.documentIds) !== new Set(input.documentIds).size) throw new Error("Anexo GED inválido.");
    const definition = await readPropertyRegistrationPolicy(tx, input.budgetUnitId);
    const policy = definition ? propertyRegistrationPolicySchema.parse(definition.data) : null;
    if (policy?.requireProcess && !input.processId) throw new Error("A configuração municipal exige protocolo para alterar este cadastro.");
    const inscription = policy ? formatPropertyInscription(policy, input.inscriptionParts) : property.municipalInsc;
    if (!policy && Object.keys(input.inscriptionParts).length) throw new Error("Publique a composição da inscrição antes de informar seus componentes.");
    const ownerNames = Object.fromEntries(owners.map(owner => [owner.id, owner.company?.corporateName ?? owner.person?.fullName ?? owner.id]));
    const entry = await appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE", title: "Perfil imobiliário", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, processId: input.processId, data: propertySnapshot({ ...input, inscription, policyId: definition?.id ?? null, ownerNames, previousId: previous?.id ?? null }) });
    const primary = input.owners.find(owner => owner.primary)!.taxpayerId;
    const position = await readPropertyOwnership(tx, property.id);
    const ownersSnapshot = input.owners.map(owner => ({ taxpayerId: owner.taxpayerId, sharePercent: new Decimal(owner.sharePercent).toString() })).sort((a,b) => a.taxpayerId.localeCompare(b.taxpayerId));
    const positionData = taxScopeSnapshot(position?.data);
    if (!position || JSON.stringify(positionData.owners) !== JSON.stringify(ownersSnapshot) || positionData.primaryTaxpayerId !== primary) {
      const observed = new Date();
      if (position) await closePropertyOwnership(tx, position.id, observed);
      await appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: property.id, category: "FISCAL_OWNERSHIP", title: "Titularidade fiscal do perfil imobiliário", version: (position?.version ?? 0)+1, effectiveFrom: observed, actorUsuarioId: actor.usuarioId, processId: input.processId, source: "PROPERTY_PROFILE", data: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, owners: ownersSnapshot, ownerNames, primaryTaxpayerId: primary, profileId: entry.id, previousPositionId: position?.id ?? null } });
    }
    await attributePropertyHistory(tx, actor.usuarioId);
    await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process', ${input.processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change', 'true', true), set_config('celeriflow.cadastral_new_profile', ${property.id}, true)`);
    await mutateProperty(tx, property.id, { municipalInsc: inscription, propertyType: input.kind, taxpayerId: primary });
    await appendPropertyAudit(tx, { action: "SAVE_PROPERTY_PROFILE", entityType: "RealEstate", entityId: property.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data, profileId: entry.id } });
    return entry;
}

export const newPropertyWithProfileSchema = z.object({
  profile: propertyProfileSchema,
  cadastral: z.object({ registration:z.string().trim().max(120),streetName:z.string().trim().min(1).max(240),streetId:z.string().nullable(),neighborhoodId:z.string().nullable(),number:z.string().trim().max(40),complement:z.string().trim().max(240),lot:z.string().trim().max(80),block:z.string().trim().max(80),landArea:z.number().finite().nonnegative(),builtArea:z.number().finite().nonnegative(),propertyUse:z.string().trim().min(1).max(120),fiscalZone:z.string().trim().max(120) }),
});

export async function createPropertyWithProfile(connection:DatabaseConnection,actor:TaxActor,raw:z.input<typeof newPropertyWithProfileSchema>): Promise<PropertyRecord> {
  const input=newPropertyWithProfileSchema.parse({...raw,profile:{...raw.profile,propertyId:randomUUID(),expectedVersion:0,expectedUpdatedAt:new Date().toISOString()}});
  return withDatabaseTransaction(connection,async tx=>{
    await authorize(tx,actor,input.profile.governmentEntityId,input.profile.budgetUnitId);
    if(input.cadastral.streetId && !await propertyStreetExists(tx,input.cadastral.streetId)) throw new Error("Logradouro cadastrado não encontrado.");
    if(input.cadastral.neighborhoodId && !await propertyNeighborhoodExists(tx,input.cadastral.neighborhoodId)) throw new Error("Bairro cadastrado não encontrado.");
    const policy=await readPropertyRegistrationPolicy(tx,input.profile.budgetUnitId);
    if(!policy) throw new Error("Publique a composição da inscrição para incluir o imóvel completo.");
    const inscription=formatPropertyInscription(propertyRegistrationPolicySchema.parse(policy.data),input.profile.inscriptionParts);
    await attributePropertyHistory(tx,actor.usuarioId);
    await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process',${input.profile.processId ?? ""},true)`);
    const property=await insertProperty(tx,{id:input.profile.propertyId,...input.cadastral,municipalInsc:inscription,propertyType:input.profile.kind,status:"Ativo",taxpayerId:input.profile.owners.find(owner=>owner.primary)!.taxpayerId});
    await savePropertyProfileInTransaction(tx,actor,{...input.profile,propertyId:property.id,expectedVersion:0,expectedUpdatedAt:property.updatedAt.toISOString()});
    return readProperty(tx,property.id);
  },{isolationLevel:"serializable",timeoutMs:60000});
}
