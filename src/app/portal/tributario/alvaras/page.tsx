import Link from "next/link";
import { db } from "@/db/client";
import { portalTaxpayerGrants, portalLicenseOptions } from "@/db/repositories/portal-content/taxpayer";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { licensePolicySchema } from "@/lib/tributacao/license-policy";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import PortalLicensesClient from "./PortalLicensesClient";

export const dynamic="force-dynamic";
export default async function PortalLicensesPage() {
  const account=await getCitizenAccount("/portal/tributario/alvaras");
  const grants=await portalTaxpayerGrants(db,account.id,new Date());
  const taxpayerIds=grants.filter(grant=>Array.isArray(grant.scopes) && grant.scopes.includes("ALVARAS")).map(grant=>grant.taxpayerId);
  const {registrations,entries,profiles,licenses}=await portalLicenseOptions(db,taxpayerIds);
  const latest=new Map<string,typeof entries[number]>();for(const entry of entries) if(!latest.has(entry.entityId)) latest.set(entry.entityId,entry);
  const latestProfiles=new Map<string,typeof profiles[number]>();for(const profile of profiles) if(!latestProfiles.has(profile.entityId)) latestProfiles.set(profile.entityId,profile);
  const policies=[...latest.values()].map(entry=>({id:entry.entityId,version:entry.version,data:licensePolicySchema.parse(entry.data)})).filter(policy=>policy.data.active && policy.data.allowPortalIssue && policy.data.year===new Date().getUTCFullYear());
  return <main className="mx-auto max-w-4xl space-y-4 p-6"><Link href="/portal/tributario" className="text-sm text-emerald-700 underline">Área do contribuinte</Link><h1 className="text-2xl font-bold">Alvarás da empresa</h1><PortalLicensesClient registrations={registrations.filter(row=>latestProfiles.has(row.id)).map(row=>({id:row.id,label:row.municipalInsc,updatedAt:row.updatedAt.toISOString(),budgetUnitId:String(taxScopeSnapshot(latestProfiles.get(row.id)?.data).budgetUnitId)}))} policies={policies.map(policy=>({id:policy.id,version:policy.version,name:policy.data.name,budgetUnitId:policy.data.budgetUnitId}))}/><section className="space-y-2"><h2 className="font-semibold">Emissões</h2>{licenses.map(license=><p key={license.id} className="rounded border p-3 text-sm">{license.licenseType} · {license.status} · validade {license.validUntil?.toLocaleDateString("pt-BR",{timeZone:"UTC"})}{license.qrCode && <Link href={`/validar-alvara/${license.qrCode}`} className="ml-2 text-emerald-700 underline">Documento e autenticidade</Link>}</p>)}</section></main>;
}
