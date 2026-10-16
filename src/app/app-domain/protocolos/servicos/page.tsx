import Link from "next/link";
import { getProtocolContext } from "@/lib/protocols/access";
import ServiceCatalogEditor from "./ServiceCatalogEditor";

export const dynamic = "force-dynamic";
export default async function ServiceManagementPage() {
  const context = await getProtocolContext();
  const services = await context.prisma.portalServiceConfiguration.findMany({ include: { publicService: true }, orderBy: { slug: "asc" } });
  const subjects = await context.prisma.subject.findMany({ where: { isActive: true, processType: { isActive: true } }, select: { id: true, name: true, processTypeId: true, processType: { select: { name: true } } }, orderBy: { name: "asc" } });
  return <main className="mx-auto max-w-6xl space-y-5 p-4"><h1 className="text-2xl font-semibold">Serviços e Autoatendimento</h1><div className="flex flex-wrap gap-4 text-sm font-semibold"><Link href="/protocolos/servicos/solicitacoes" className="text-emerald-800 underline">Fila de solicitações e programação</Link><Link href="/portal/servicos" className="text-emerald-800 underline">Carta pública</Link><Link href="/rh/portal-funcional" className="text-sky-800 underline">Configuração dos serviços funcionais</Link></div><p className="text-sm leading-6 text-slate-600">O catálogo utiliza PublicService. Cada solicitação preserva a versão e gera protocolo com destino configurado. Serviços funcionais mantêm suas rotinas no Portal do Servidor.</p>{context.protocolAccess.isAdmin && context.protocolAccess.canUpdate ? <ServiceCatalogEditor services={services} subjects={subjects} /> : <p className="rounded border p-4 text-sm">A configuração do catálogo exige administração. Utilize a fila para tratar os pedidos do seu setor.</p>}</main>;
}
