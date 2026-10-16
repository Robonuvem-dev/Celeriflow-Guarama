import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { licensePolicySchema } from "@/lib/tributacao/license-policy";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ConfiguredLicensesClient from "./ConfiguredLicensesClient";
import LicensePortalPolicyClient from "./LicensePortalPolicyClient";
import LicenseSignaturesClient from "./LicenseSignaturesClient";

export const dynamic="force-dynamic";
export default async function ConfiguredLicensesPage() {
  const {prisma,user}=await getTenantContextForModule("TRIBUTACAO");const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const scope=allowed ? {OR:allowed.map(budgetUnitId=>({data:{path:["budgetUnitId"],equals:budgetUnitId}}))} : {};
  const [units,policies,profiles,issuances,taxes]=await Promise.all([
    prisma.planningEntityUnit.findMany({where:allowed ? {budgetUnitId:{in:allowed}} : {},include:{governmentEntity:true,budgetUnit:true}}),
    prisma.taxRegistryEntry.findMany({where:{entityType:"LICENSE_POLICY",category:"LICENSE_POLICY",...scope},orderBy:{version:"desc"}}),
    prisma.taxRegistryEntry.findMany({where:{entityType:"ECONOMIC_REGISTRATION",category:"ECONOMIC_PROFILE",...scope},orderBy:{version:"desc"}}),
    prisma.taxRegistryEntry.findMany({where:{entityType:"LICENSE",category:"LICENSE_ISSUANCE",...scope},orderBy:{createdAt:"desc"}}),
    prisma.tax.findMany({where:{isActive:true},select:{id:true,name:true}}),
  ]);
  const latestPolicies=new Map<string,typeof policies[number]>();for(const row of policies) if(!latestPolicies.has(row.entityId)) latestPolicies.set(row.entityId,row);
  const latestProfiles=new Map<string,typeof profiles[number]>();for(const row of profiles) if(!latestProfiles.has(row.entityId)) latestProfiles.set(row.entityId,row);
  const registrations=await prisma.economicRegistration.findMany({where:{id:{in:[...latestProfiles.keys()]},status:"Ativo"},include:{taxpayer:{include:{person:true,company:true}}},orderBy:{municipalInsc:"asc"}});
  const licenses=await prisma.license.findMany({where:{id:{in:issuances.map(entry=>entry.entityId)}},orderBy:{createdAt:"desc"}});
  const configurations=[...latestPolicies.values()].map(entry=>({id:entry.entityId,version:entry.version,data:licensePolicySchema.parse(entry.data)}));
  const memories=new Map(issuances.map(entry=>[entry.entityId,taxScopeSnapshot(entry.data)]));
  const licensePositions=licenses.map(row=>({id:row.id,type:row.licenseType,status:row.status,validUntil:row.validUntil?.toISOString().slice(0,10) ?? "",issuedAt:row.issueDate?.toISOString().slice(0,10) ?? "",taxpayer:String(memories.get(row.id)?.taxpayerName ?? row.taxpayerId ?? ""),inscription:String(memories.get(row.id)?.inscription ?? ""),updatedAt:row.updatedAt.toISOString(),authCode:row.qrCode ?? ""}));
  const [signatures, certificates] = await Promise.all([
    prisma.taxRegistryEntry.findMany({ where: { entityType: "LICENSE", entityId: { in: licenses.map(row => row.id) }, category: "LICENSE_SIGNATURE", ...scope }, select: { entityId: true } }),
    prisma.digitalCertificate.findMany({ where: { status: "ACTIVE", validFrom: { lte: new Date() }, validTo: { gte: new Date() } }, select: { id: true, alias: true, ownerName: true, purposes: true } }),
  ]);
  const signingLicenses = licensePositions.map(row => { const license = licenses.find(item => item.id === row.id)!; return { id: row.id, label: `${row.type} · ${row.inscription} · ${row.taxpayer}`, updatedAt: row.updatedAt, authCode: row.authCode, signed: signatures.some(entry => entry.entityId === row.id), available: license.status === "Emitido" && license.validUntil !== null && license.validUntil >= new Date() }; });
  return <div className="h-full overflow-auto"><ConfiguredLicensesClient units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code}`}))} policies={configurations} registrations={registrations.map(row=>({id:row.id,label:`${row.municipalInsc} · ${row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayerId}`,updatedAt:row.updatedAt.toISOString(),budgetUnitId:String(taxScopeSnapshot(latestProfiles.get(row.id)?.data).budgetUnitId)}))} taxes={taxes} licenses={licensePositions}/><LicensePortalPolicyClient policies={configurations}/><LicenseSignaturesClient licenses={signingLicenses} certificates={certificates.filter(row => Array.isArray(row.purposes) && row.purposes.includes("GED")).map(row => ({ id: row.id, label: `${row.alias} · ${row.ownerName}` }))}/></div>;
}
