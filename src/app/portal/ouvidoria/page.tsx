import type { Metadata } from "next";
import Link from "next/link";
import { Headset } from "lucide-react";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";
import { CitizenRequestForm } from "@/components/transparencia/CitizenRequestForm";
import {CitizenServiceInformation} from "@/components/transparencia/CitizenServiceInformation";

export const metadata: Metadata = {
  title: `Ouvidoria | ${MUNICIPALITY_INSTITUTION_NAME}`,
  description: `Ouvidoria municipal de ${MUNICIPALITY_INSTITUTION_NAME} — canais de manifestação do cidadão.`,
};

const CHANNELS = [
   { title: "Denúncias", description: "Comunicação de irregularidades ou atos ilícitos.", href: "#manifestacao" },
   { title: "Reclamações", description: "Insatisfação com serviços ou atendimento.", href: "#manifestacao" },
   { title: "Sugestões", description: "Propostas de melhoria dos serviços públicos.", href: "#manifestacao" },
  { title: "Solicitações e informações", description: "Pedidos de informação pública via e-SIC.", href: "/portal/acesso-informacao" },
];

export const dynamic="force-dynamic";
export default async function OuvidoriaPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-9 sm:px-6">
      <PortalBreadcrumb current="Ouvidoria" />
      <p className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#0e4c7e]"><Headset className="size-4" aria-hidden="true" /> Participação e controle social</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Ouvidoria municipal</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        A Ouvidoria é o canal oficial de escuta do cidadão de {MUNICIPALITY_INSTITUTION_NAME}.
         Registre sua manifestação abaixo e acompanhe a resposta com protocolo e chave privada.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {CHANNELS.map((channel) => (
          <article key={channel.title} className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">{channel.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{channel.description}</p>
            <Link href={channel.href} className="mt-3 inline-block text-sm font-bold text-[#0e4c7e] hover:underline">Acessar canal</Link>
          </article>
        ))}
      </div>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
        <h2 className="font-bold text-slate-900">Como acompanhar</h2>
         <p className="mt-2">Guarde o protocolo e a chave de acompanhamento. A equipe responde no canal privado de consulta abaixo. Consulte também as <Link href="/portal/noticias" className="font-bold text-[#0e4c7e] hover:underline">notícias oficiais</Link> e o <Link href="/portal/portaldatransparencia" className="font-bold text-[#0e4c7e] hover:underline">Portal da Transparência</Link>.</p>
       </div>
       <div id="manifestacao" className="mt-6"><CitizenRequestForm type="RECLAMACAO" /></div>
       <div className="mt-6"><CitizenServiceInformation/></div>
    </main>
  );
}
