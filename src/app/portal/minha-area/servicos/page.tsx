import Link from "next/link";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { DigitalServiceCatalog } from "@/components/portal-institucional/DigitalServiceCatalog";

export const dynamic = "force-dynamic";

const services = [
  { title: "Acesso à Informação (e-SIC)", text: "Solicite informações públicas e acompanhe o atendimento com o protocolo e a chave fornecidos pelo canal.", href: "/portal/acesso-informacao" },
  { title: "Ouvidoria", text: "Envie sugestões, reclamações, elogios ou denúncias pelo canal de Ouvidoria. O acompanhamento permanece no canal próprio.", href: "/portal/ouvidoria" },
  { title: "Construção Civil", text: "Abertura e acompanhamento de solicitações para profissionais com habilitação e autorização vigentes.", href: "/portal/construcao-civil" },
];

export default async function CitizenServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; audience?: string; group?: string; favorites?: string }> }) {
  const account = await getCitizenAccount("/portal/minha-area/servicos");
  const query = await searchParams;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
    <Link href="/portal/minha-area" className="text-sm font-semibold text-emerald-800 hover:underline">← Minha área</Link>
    <div><h1 className="text-3xl font-bold text-slate-950">Solicitar serviço</h1><p className="mt-2 text-sm leading-6 text-slate-600">Escolha um canal disponível. Cada serviço informa seus requisitos de acesso e a forma de acompanhamento.</p></div>
    <DigitalServiceCatalog accountId={account.id} query={{ q: typeof query.q === "string" ? query.q.slice(0, 100) : "", audience: typeof query.audience === "string" ? query.audience : "", group: typeof query.group === "string" ? query.group : "", favorites: query.favorites }} />
    <div className="grid gap-4 sm:grid-cols-2">{services.map((service) => <section key={service.href} className="flex flex-col rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-900">{service.title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{service.text}</p><Link href={service.href} className="mt-5 w-fit rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Acessar serviço</Link></section>)}</div>
    <Link href="/portal/minha-area/processos" className="inline-flex text-sm font-semibold text-emerald-800 hover:underline">Acompanhar meus processos →</Link>
    <Link href="/portal/minha-area/solicitacoes" className="ml-4 inline-flex text-sm font-semibold text-emerald-800 hover:underline">Meus pedidos e respostas →</Link>
  </main>;
}
