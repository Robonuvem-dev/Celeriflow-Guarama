import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { readPortalItbiChannel } from "@/lib/tributacao/itbi-process-channel";
import ItbiChannelClient from "@/app/app-domain/tributacao/itbi/comunicacao/ItbiChannelClient";
import PortalItbiContestationClient from "./PortalItbiContestationClient";

export const dynamic = "force-dynamic";
export default async function PortalItbiPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const account = await getCitizenAccount("/portal/tributario/itbi"); const params = await searchParams; const now = new Date();
  const grants = await prisma.processCitizenAccess.findMany({ where: { usuarioId: account.id, revokedAt: null, grantedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { processId: true } });
  const declarations = await prisma.itbiDeclaration.findMany({ where: { processId: { in: grants.map(row => row.processId) } }, select: { id: true, declarationNumber: true, protocolNumber: true, status: true }, orderBy: { createdAt: "desc" } });
  const selected = declarations.find(row => row.id === params.id);
  const channel = selected ? await readPortalItbiChannel(prisma, account.id, selected.id) : null;
  return <main className="mx-auto max-w-5xl space-y-4 p-6">
    <Link href="/portal/minha-area" className="text-sm text-emerald-700 underline">Minha área</Link>
    <h1 className="text-2xl font-bold">Processos ITBI · tabelionato e interessados</h1>
    <Link href="/portal/tributario/itbi/novo" className="inline-block rounded bg-emerald-700 p-3 text-sm text-white">Incluir ITBI on-line</Link>
    <form className="flex flex-wrap gap-3 rounded border bg-white p-3 text-sm"><label>Processos autorizados<select name="id" defaultValue={selected?.id ?? ""} className="ml-2 rounded border p-2"><option value="">Selecione</option>{declarations.map(row => <option key={row.id} value={row.id}>{row.declarationNumber} · {row.protocolNumber} · {row.status}</option>)}</select></label><button className="rounded border p-2">Abrir processo</button></form>
    {!declarations.length && <p>Nenhum processo ITBI possui autorização explícita vigente para sua conta.</p>}
    {channel && <><ItbiChannelClient {...channel} external/><PortalItbiContestationClient key={`${channel.declaration.id}:${channel.declaration.updatedAt}`} declarationId={channel.declaration.id} updatedAt={channel.declaration.updatedAt} declaredValue={channel.declaration.value} documents={channel.documents}/></>}
  </main>;
}
