import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listFunctionalServices } from "@/lib/portal-servidor/service-catalog";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { FunctionalRequestForm } from "./FunctionalRequestForm";

export const dynamic = "force-dynamic";
export default async function FunctionalServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; service?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams;
  const services = await listFunctionalServices(access.context.prisma, access.employee.id);
  const selected = services.find(service => service.id === params.service);
  const q = (params.q || "").slice(0, 200).trim().toLocaleLowerCase("pt-BR");
  const filtered = services.filter(service => `${service.name} ${service.description} ${service.configuration.group}`.toLocaleLowerCase("pt-BR").includes(q));
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
    <ErpPageTitle title="Serviços funcionais" description="Requisitos, documentos e requerimentos para os seus vínculos." action={<Link href="/portal-servidor/protocolos">Meus protocolos</Link>} />
    {selected ? <section className="mt-3 space-y-3"><Link href="/portal-servidor/servicos" className="text-xs underline">Voltar ao catálogo</Link><h2 className="text-lg font-semibold">{selected.name}</h2><p className="whitespace-pre-wrap text-sm">{selected.description}</p><dl className="grid gap-2 rounded border border-slate-300 bg-white p-3 text-xs"><dt className="font-bold">Requisitos</dt><dd className="whitespace-pre-wrap">{selected.requirements || "Conforme formulário e documentos abaixo."}</dd><dt className="font-bold">Etapas</dt><dd className="whitespace-pre-wrap">{selected.steps || "Abertura e análise pelo setor responsável."}</dd><dt className="font-bold">Prazo</dt><dd>{selected.deadline || "Conforme roteiro do processo."}</dd></dl><FunctionalRequestForm key={`${selected.id}:${selected.configuration.version}`} serviceId={selected.id} configuration={{ version: selected.configuration.version, fields: selected.configuration.fields, requiredDocuments: selected.configuration.requiredDocuments, acceptance: selected.configuration.acceptance }} requestKey={randomUUID()} /></section> : <>
      <form className="my-3 flex gap-2 text-xs"><label htmlFor="functional-search" className="sr-only">Pesquisar serviços</label><input id="functional-search" name="q" defaultValue={params.q} maxLength={200} className="h-8 flex-1 rounded border border-slate-300 px-2" placeholder="Pesquisar serviço ou grupo" /><button className="rounded border border-slate-300 bg-white px-3">Pesquisar</button></form>
      <p className="mb-2 text-xs text-slate-500">{filtered.length} serviços no filtro</p><div className="grid gap-3 md:grid-cols-2">{filtered.map(service => <Link key={service.id} href={`?service=${encodeURIComponent(service.id)}`} className="rounded border border-slate-300 bg-white p-4 hover:border-emerald-600"><p className="text-[10px] font-bold uppercase text-slate-500">{service.configuration.group}</p><h2 className="mt-1 font-semibold">{service.name}</h2><p className="mt-2 text-xs text-slate-600">{service.description}</p></Link>)}</div>{!filtered.length && <p className="rounded border border-slate-300 bg-white p-4 text-sm">Nenhum serviço publicado para seu cadastro neste filtro.</p>}
    </>}
  </div>;
}
