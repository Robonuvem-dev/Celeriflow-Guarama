import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import EconomicDocumentsClient from "./EconomicDocumentsClient";

export const dynamic = "force-dynamic";
export default async function PortalEconomicDocumentsPage() {
  const account = await getCitizenAccount("/portal/tributario/empresas");
  const grants = await prisma.taxpayerPortalAccess.findMany({ where: { usuarioId: account.id, accessType: "TITULAR", status: "ATIVO", revokedAt: null, grantedAt: { lte: new Date() } } });
  const allowed = grants.filter(row => Array.isArray(row.scopes) && (row.scopes.includes("EMPRESA") || row.scopes.includes("CERTIDOES")));
  const rows = await prisma.economicRegistration.findMany({ where: { taxpayerId: { in: allowed.map(row => row.taxpayerId) } }, include: { taxpayer: { include: { person: true, company: true } } }, orderBy: { municipalInsc: "asc" } });
  return <main className="mx-auto max-w-4xl space-y-4 p-6"><Link href="/portal/tributario" className="text-sm text-emerald-700 underline">Área do contribuinte</Link><h1 className="text-2xl font-bold">Documentos cadastrais da empresa</h1><EconomicDocumentsClient registrations={rows.map(row => { const grant = allowed.find(item => item.taxpayerId === row.taxpayerId); const scopes = Array.isArray(grant?.scopes) ? grant.scopes : []; return { id: row.id, label: `${row.municipalInsc} · ${row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayerId}`, status: row.status, updatedAt: row.updatedAt.toISOString(), canRegister: scopes.includes("EMPRESA"), canCease: scopes.includes("CERTIDOES") }; })}/></main>;
}
