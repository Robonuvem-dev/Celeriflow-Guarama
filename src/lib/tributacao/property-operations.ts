import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { appendPropertyAudit, appendPropertyRegistryEntry, insertProperty, listPropertyCopyCharacteristics, listSelectedProperties, lockProperty, lockPropertyKey, mutateProperty, propertyOriginExists, propertyProcessExists, propertySelectionPredicate, propertyTaxpayerExists, readLatestPropertyProfile, readProperty, readPropertyRegistrationPolicy } from "@/db/repositories/tax-property/records";
import { propertySnapshot } from "@/db/repositories/tax-property/snapshot";
import type { PropertyCreateInput, PropertyRecord } from "@/db/repositories/tax-property/contracts";
import { z } from "zod";
import type { TaxActor } from "./index";
import { attributePropertyHistory } from "./property-history";
import { taxScopeSnapshot } from "./scope";
import { parsePropertyInscription,propertyProfileSchema,propertyRegistrationPolicySchema } from "./property-profile-schema";

const scopeSchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), processId: z.string().nullable(), reason: z.string().trim().min(1).max(4000) });
const targetSchema = z.object({ id: z.string().min(1), updatedAt: z.string().datetime() });
const filterSchema = z.object({ query: z.string().trim().default(""), streetId: z.string().optional(), neighborhoodId: z.string().optional(), status: z.string().optional(), propertyUse: z.string().optional() });
const propertyPatchSchema = z.object({ municipalInsc: z.string().trim().min(1).optional(), registration: z.string().nullable().optional(), propertyType: z.string().optional(), streetName: z.string().nullable().optional(), streetId: z.string().nullable().optional(), neighborhoodId: z.string().nullable().optional(), number: z.string().nullable().optional(), complement: z.string().nullable().optional(), lot: z.string().nullable().optional(), block: z.string().nullable().optional(), landArea: z.number().finite().nonnegative().nullable().optional(), builtArea: z.number().finite().nonnegative().nullable().optional(), propertyUse: z.string().nullable().optional(), fiscalZone: z.string().nullable().optional(), status: z.string().trim().min(1).optional() }).strict();
export const bulkPropertyChangeSchema = scopeSchema.extend({ filter: filterSchema, targets: z.array(targetSchema).min(1).max(1000), changes: propertyPatchSchema }).refine(input => Object.keys(input.changes).length > 0, "Informe os campos a alterar.");
export const copyPropertySchema = scopeSchema.extend({ source: targetSchema, inscriptions: z.array(z.string().trim().min(1).max(120)).min(1).max(100) }).refine(input => new Set(input.inscriptions).size === input.inscriptions.length, "Informe inscrições distintas para as cópias.");
export const reorganizePropertySchema = scopeSchema.extend({ operation: z.enum(["SPLIT", "MERGE"]), sources: z.array(targetSchema).min(1).max(100), destinations: z.array(z.object({ inscription: z.string().trim().min(1).max(120), landArea: z.string(), builtArea: z.string(), propertyType: z.enum(["Terreno", "Unidade", "Rural"]), taxpayerId: z.string().nullable() })).min(1).max(100) });

export function propertyFilterWhere(input: z.input<typeof filterSchema>): SQL | undefined {
  const filter = filterSchema.parse(input);
  return propertySelectionPredicate(filter);
}

async function authorizeOperation(tx: DatabaseTransaction, actor: TaxActor, input: z.infer<typeof scopeSchema>) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await propertyOriginExists(tx, input.governmentEntityId, input.budgetUnitId)) throw new Error("Ente/UG não conciliados.");
  if (input.processId && !await propertyProcessExists(tx, input.processId)) throw new Error("Protocolo não encontrado.");
  await attributePropertyHistory(tx, actor.usuarioId);
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process', ${input.processId ?? ""}, true)`);
}

async function lockProperties(tx: DatabaseTransaction, targets: z.infer<typeof targetSchema>[]) {
  if (new Set(targets.map(target => target.id)).size !== targets.length) throw new Error("Imóveis repetidos na operação.");
  const sorted = [...targets].sort((a, b) => a.id.localeCompare(b.id));
  const rows: PropertyRecord[] = [];
  for (const target of sorted) {
    await lockProperty(tx, target.id);
    const row = await readProperty(tx, target.id);
    if (row.updatedAt.toISOString() !== target.updatedAt) throw new Error("Cadastro alterado após a seleção. Recarregue a prévia.");
    rows.push(row);
  }
  return rows;
}

function cadastralCopy(property: PropertyRecord): PropertyCreateInput {
  return { registration: property.registration, propertyType: property.propertyType, streetName: property.streetName, number: property.number, complement: property.complement, lot: property.lot, block: property.block, landArea: property.landArea, builtArea: property.builtArea, propertyUse: property.propertyUse, fiscalZone: property.fiscalZone, neighborhoodId: property.neighborhoodId, streetId: property.streetId, taxpayerId: property.taxpayerId, status: "Regular" };
}

async function recordOperation(tx: DatabaseTransaction, actor: TaxActor, propertyId: string, input: z.infer<typeof scopeSchema>, operation: string, data: Record<string, unknown>) {
  const entry = await appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: propertyId, category: "CADASTRAL_OPERATION", title: operation, processId: input.processId, actorUsuarioId: actor.usuarioId, data: propertySnapshot({ ...data, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, reason: input.reason }) });
  await appendPropertyAudit(tx, { action: operation, entityType: "RealEstate", entityId: propertyId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: propertySnapshot({ operationId: entry.id, ...data, reason: input.reason, processId: input.processId }) });
  return entry;
}

export async function bulkChangeProperties(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof bulkPropertyChangeSchema>) {
  const input = bulkPropertyChangeSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await authorizeOperation(tx, actor, input);
    const where = propertyFilterWhere(input.filter);
    // Serialize filter previews: every row must still be in the exact selection.
    await lockPropertyKey(tx, "PROPERTY_BULK_CHANGE");
    const rows = await lockProperties(tx, input.targets);
    const filtered = await listSelectedProperties(tx, where);
    if (filtered.length !== rows.length || filtered.some(row => !rows.some(target => row.id === target.id))) throw new Error("A seleção do filtro mudou. Recarregue antes da alteração geral.");
    if (rows.length > 1 && input.changes.municipalInsc) throw new Error("Inscrição única não pode ser repetida numa alteração geral.");
    for (const row of rows) {
      await mutateProperty(tx, row.id, input.changes);
      await recordOperation(tx, actor, row.id, input, "BULK_PROPERTY_CHANGE", { before: propertySnapshot(row), changes: input.changes });
    }
    return { count: rows.length };
  }, { isolationLevel: "serializable", timeoutMs: 60000 });
}

export async function copyProperties(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof copyPropertySchema>) {
  const input = copyPropertySchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await authorizeOperation(tx, actor, input);
    const [source] = await lockProperties(tx, [input.source]);
    const profileEntry=await readLatestPropertyProfile(tx,source.id);
    const profile=profileEntry ? propertyProfileSchema.parse(profileEntry.data) : null;
    if(profile && (profile.governmentEntityId!==input.governmentEntityId || profile.budgetUnitId!==input.budgetUnitId)) throw new Error("A origem da cópia diverge do perfil imobiliário conciliado.");
    const policyEntry=profile ? await readPropertyRegistrationPolicy(tx,input.budgetUnitId) : null;
    const policy=policyEntry ? propertyRegistrationPolicySchema.parse(policyEntry.data) : null;
    if(policy?.requireProcess && !input.processId) throw new Error("A configuração municipal exige protocolo para copiar este cadastro.");
    const characteristics = await listPropertyCopyCharacteristics(tx, source.id);
    const latest = new Map<string, typeof characteristics[number]>();
    for (const characteristic of characteristics) { const key = characteristic.category==="FISCAL_OWNERSHIP" ? characteristic.category : `${characteristic.category}:${characteristic.title}`; if (!latest.has(key)) latest.set(key, characteristic); }
    const results: { id: string; inscription: string }[] = [];
    for (const inscription of input.inscriptions) {
      const row = await insertProperty(tx, { ...cadastralCopy(source), municipalInsc: inscription });
      if(profile) {
        const position=taxScopeSnapshot(latest.get("FISCAL_OWNERSHIP")?.data);
        const owners=Array.isArray(position.owners) ? position.owners.map(owner=>{const value=taxScopeSnapshot(owner);return {taxpayerId:value.taxpayerId,sharePercent:value.sharePercent,primary:value.taxpayerId===source.taxpayerId};}) : profile.owners;
        const copiedProfile=propertyProfileSchema.parse({...profile,propertyId:row.id,expectedUpdatedAt:row.updatedAt.toISOString(),expectedVersion:0,owners,inscriptionParts:policy ? parsePropertyInscription(policy,inscription) : {},processId:input.processId,reason:input.reason});
        await appendPropertyRegistryEntry(tx,{entityType:"REAL_ESTATE",entityId:row.id,category:"PROPERTY_PROFILE",title:"Perfil imobiliário",version:1,actorUsuarioId:actor.usuarioId,processId:input.processId,source:"COPIA_CADASTRAL",data:propertySnapshot({...copiedProfile,inscription,previousId:null,ownerNames:taxScopeSnapshot(position.ownerNames ?? taxScopeSnapshot(profileEntry?.data).ownerNames),copiedFrom:source.id,policyId:policyEntry?.id ?? null})});
      }
      for (const characteristic of latest.values()) if (characteristic.status === "ATIVO") {
        const data=taxScopeSnapshot(characteristic.data);
        const copiedData=characteristic.category==="FISCAL_OWNERSHIP" ? {governmentEntityId:input.governmentEntityId,budgetUnitId:input.budgetUnitId,owners:data.owners,ownerNames:data.ownerNames ?? {},primaryTaxpayerId:source.taxpayerId,copiedFrom:source.id} : {...data,copiedFrom:source.id};
        await appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: row.id, category: characteristic.category, title: characteristic.title, data: propertySnapshot(copiedData), status: "ATIVO", source: "COPIA_CADASTRAL", actorUsuarioId: actor.usuarioId, processId: input.processId, version: 1 });
      }
      await recordOperation(tx, actor, row.id, input, "COPY_PROPERTY", { sourceId: source.id, sourceSnapshot: propertySnapshot(source) });
      results.push({ id: row.id, inscription });
    }
    return results;
  }, { timeoutMs: 60000 });
}

export async function reorganizeProperties(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof reorganizePropertySchema>) {
  const input = reorganizePropertySchema.parse(raw);
  if (input.operation === "SPLIT" && (input.sources.length !== 1 || input.destinations.length < 2) || input.operation === "MERGE" && (input.sources.length < 2 || input.destinations.length !== 1)) throw new Error("Desmembramento exige um imóvel e ao menos dois destinos; remembramento exige ao menos dois imóveis e um destino.");
  if (new Set(input.destinations.map(destination => destination.inscription)).size !== input.destinations.length) throw new Error("Inscrições de destino devem ser distintas.");
  const areas = input.destinations.map(destination => {
    const land = new Decimal(destination.landArea); const built = new Decimal(destination.builtArea);
    if (!land.isFinite() || !built.isFinite() || land.lte(0) || built.lt(0)) throw new Error("Áreas de destino inválidas.");
    return { land, built };
  });
  return withDatabaseTransaction(connection, async tx => {
    await authorizeOperation(tx, actor, input);
    const sources = await lockProperties(tx, input.sources);
    if (sources.some(source => source.landArea === null || source.builtArea === null || ["Desmembrado", "Remembrado", "Inativo", "Baixado"].includes(source.status))) throw new Error("Origens devem estar ativas e ter áreas documentadas.");
    const sourceLand = sources.reduce((sum, source) => sum.plus(String(source.landArea)), new Decimal(0));
    const sourceBuilt = sources.reduce((sum, source) => sum.plus(String(source.builtArea)), new Decimal(0));
    if (!areas.reduce((sum, area) => sum.plus(area.land), new Decimal(0)).eq(sourceLand) || !areas.reduce((sum, area) => sum.plus(area.built), new Decimal(0)).eq(sourceBuilt)) throw new Error("As áreas de destino devem conservar as áreas totais das origens.");
    const created: { id: string; inscription: string }[] = [];
    for (const [index, destination] of input.destinations.entries()) {
      if (destination.taxpayerId && !await propertyTaxpayerExists(tx, destination.taxpayerId)) throw new Error("Titular de destino não encontrado.");
      const row = await insertProperty(tx, { ...cadastralCopy(sources[0]), municipalInsc: destination.inscription, registration: null, propertyType: destination.propertyType, taxpayerId: destination.taxpayerId, landArea: Number(areas[index].land), builtArea: Number(areas[index].built) });
      created.push({ id: row.id, inscription: destination.inscription });
    }
    const data = { operation: input.operation, sources: propertySnapshot(sources), destinations: created, areas: areas.map(area => ({ landArea: area.land.toString(), builtArea: area.built.toString() })) };
    for (const source of sources) {
      await mutateProperty(tx, source.id, { status: input.operation === "SPLIT" ? "Desmembrado" : "Remembrado" });
      await recordOperation(tx, actor, source.id, input, "REORGANIZE_PROPERTY", data);
    }
    let certificateId = "";
    for (const destination of created) certificateId = (await recordOperation(tx, actor, destination.id, input, "REORGANIZE_PROPERTY", data)).id;
    return { created, certificateId };
  }, { timeoutMs: 60000 });
}
