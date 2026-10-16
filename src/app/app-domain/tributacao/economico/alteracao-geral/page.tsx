import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicQuerySchema, readEconomicProfiles } from "@/lib/tributacao/economic-query";
import EconomicBulkChangeClient from "./EconomicBulkChangeClient";
import EconomicBulkExtendedClient from "./EconomicBulkExtendedClient";
import { fiscalCatalogSchema } from "@/lib/tributacao/configurable-cadastres";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export const dynamic="force-dynamic";
export default async function EconomicBulkChangePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {prisma,user}=await getTenantContextForModule("TRIBUTACAO");
  const allowedBudgetUnitIds=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const units=await prisma.planningEntityUnit.findMany({where:allowedBudgetUnitIds ? {budgetUnitId:{in:allowedBudgetUnitIds}} : {},include:{governmentEntity:true,budgetUnit:true}});
  const params=await searchParams;
  const raw=Object.fromEntries(Object.entries(params).filter(([,value])=>typeof value==="string" && value!==""));
  const parsed=economicQuerySchema.safeParse({governmentEntityId:units[0]?.governmentEntityId,...raw});
  if(!parsed.success) return <p className="p-4">{parsed.error.issues[0]?.message}</p>;
  let rows:Awaited<ReturnType<typeof readEconomicProfiles>>;
  try {rows=await readEconomicProfiles(prisma,{allowedBudgetUnitIds},parsed.data);}
  catch(error){return <p className="p-4">{error instanceof Error ? error.message : "Consulta indisponível."}</p>;}
  const processes=await prisma.process.findMany({select:{id:true,protocolNumber:true},orderBy:{createdAt:"desc"},take:200});
  const [definitions, records] = await Promise.all([
    prisma.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", AND: [{ data: { path: ["governmentEntityId"], equals: parsed.data.governmentEntityId } }, { data: { path: ["kind"], equals: "FORMULARIO_EMPRESA" } }] }, orderBy: { version: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: { in: rows.map(row => row.id) }, category: "TYPED_FISCAL_RECORD" }, orderBy: { version: "desc" } }),
  ]);
  const latestDefinitions = new Map<string, typeof definitions[number]>(); for (const row of definitions) if (!latestDefinitions.has(row.entityId)) latestDefinitions.set(row.entityId, row);
  const latestRecords = new Map<string, typeof records[number]>(); for (const row of records) if (!latestRecords.has(`${row.entityId}:${row.title}`)) latestRecords.set(`${row.entityId}:${row.title}`, row);
  const selectedRows = rows.map(row => ({ id: row.id, label: `${row.inscription} · ${row.name}`, updatedAt: row.updatedAt, profileVersion: row.profileVersion }));
  const processOptions = processes.map(process => ({ id: process.id, label: process.protocolNumber }));
  const catalogs = [...latestDefinitions.values()].map(row => ({ id: row.entityId, version: row.version, data: fiscalCatalogSchema.parse(row.data) })).filter(row => row.data.active && rows.length > 0 && rows.every(item => item.profile.budgetUnitId === row.data.budgetUnitId));
  return <div className="h-full overflow-auto [&>div]:h-auto [&>div]:overflow-visible"><EconomicBulkChangeClient filter={parsed.data} rows={selectedRows} units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code}`}))} processes={processOptions}/><EconomicBulkExtendedClient filter={parsed.data} rows={selectedRows} processes={processOptions} catalogs={catalogs} positions={[...latestRecords.values()].map(row => ({ registrationId: row.entityId, catalogId: String(taxScopeSnapshot(row.data).catalogId), version: row.version }))}/></div>;
}
