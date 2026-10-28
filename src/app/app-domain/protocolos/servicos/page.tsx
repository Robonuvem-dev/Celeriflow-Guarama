import Link from "next/link";
import { getProtocolContext } from "@/lib/protocols/access";
import ServiceCatalogEditor from "./ServiceCatalogEditor";
import { db } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";
import { portalServiceConfigurations, publicServices } from "@/db/schema/portal-services";
import { processSubjects, processTypes } from "@/db/schema/processes";

export const dynamic = "force-dynamic";
export default async function ServiceManagementPage() {
  const context = await getProtocolContext();
  const serviceRows = await db.select({ service: portalServiceConfigurations, publicService: publicServices }).from(portalServiceConfigurations).innerJoin(publicServices, eq(publicServices.id, portalServiceConfigurations.publicServiceId)).orderBy(asc(portalServiceConfigurations.slug));
  const services = serviceRows.map(row => ({ ...row.service, publicService: row.publicService }));
  const subjects = await db.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId, processType: { name: processTypes.name } }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.isActive, true), eq(processTypes.isActive, true))).orderBy(asc(processSubjects.name));
  return <main className="mx-auto max-w-6xl space-y-5 p-4"><h1 className="text-2xl font-semibold">Serviços e Autoatendimento</h1><div className="flex flex-wrap gap-4 text-sm font-semibold"><Link href="/protocolos/servicos/solicitacoes" className="text-emerald-800 underline">Fila de solicitações e programação</Link><Link href="/portal/servicos" className="text-emerald-800 underline">Carta pública</Link><Link href="/rh/portal-funcional" className="text-sky-800 underline">Configuração dos serviços funcionais</Link></div><p className="text-sm leading-6 text-slate-600">O catálogo utiliza PublicService. Cada solicitação preserva a versão e gera protocolo com destino configurado. Serviços funcionais mantêm suas rotinas no Portal do Servidor.</p>{context.protocolAccess.isAdmin && context.protocolAccess.canUpdate ? <ServiceCatalogEditor services={services} subjects={subjects} /> : <p className="rounded border p-4 text-sm">A configuração do catálogo exige administração. Utilize a fila para tratar os pedidos do seu setor.</p>}</main>;
}
