import Link from "next/link";
import { getProtocolContext } from "@/lib/protocols/access";
import ServiceCatalogEditor from "./ServiceCatalogEditor";
import { db } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";
import { portalServiceConfigurations, publicServices } from "@/db/schema/portal-services";
import { processSubjects, processTypes } from "@/db/schema/processes";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";

export const dynamic = "force-dynamic";
export default async function ServiceManagementPage({ searchParams }: { searchParams: Promise<{ view?: string; id?: string }> }) {
  const context = await getProtocolContext();
  const serviceRows = await db.select({ service: portalServiceConfigurations, publicService: publicServices }).from(portalServiceConfigurations).innerJoin(publicServices, eq(publicServices.id, portalServiceConfigurations.publicServiceId)).orderBy(asc(portalServiceConfigurations.slug));
  const services = serviceRows.map(row => ({ ...row.service, publicService: row.publicService }));
  const subjects = await db.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId, processType: { name: processTypes.name } }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.isActive, true), eq(processTypes.isActive, true))).orderBy(asc(processSubjects.name));
  const params = await searchParams;
  const editor = context.protocolAccess.isAdmin && context.protocolAccess.canUpdate ? <ServiceCatalogEditor key={`${params.view || "list"}:${params.id || "new"}`} services={services} subjects={subjects} /> : <p className="rounded border p-4 text-sm">A configuração do catálogo exige administração. Utilize a fila para tratar os pedidos do seu setor.</p>;
  if (["novo", "editar", "avisos"].includes(params.view || "")) return <main className="mx-auto max-w-6xl space-y-5 p-4">{editor}</main>;
  return <><OperationalHeaderActions><Link href="/protocolos/servicos/solicitacoes">Fila de solicitações</Link><Link href="/portal/servicos">Carta pública</Link><Link href="/rh/portal-funcional">Serviços funcionais</Link></OperationalHeaderActions>{editor}</>;
}
