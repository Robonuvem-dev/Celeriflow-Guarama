import type { Metadata } from "next";
import Link from "next/link";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_LABEL, MUNICIPALITY_NAME } from "@/lib/municipality-identity";
import { getInstitutionalContact } from "@/lib/portal-institucional/public-content";

export const metadata: Metadata = {
  title: `História | Prefeitura de ${MUNICIPALITY_NAME}`,
  description: `Conheça a história, as tradições e a sede do município de ${MUNICIPALITY_LABEL}.`,
};

export const dynamic = "force-dynamic";

export default async function HistoriaPage() {
  const institution = await getInstitutionalContact();
  const location = [institution.address, MUNICIPALITY_LABEL].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-4xl px-4 py-9 sm:px-6">
      <PortalBreadcrumb current="História" />
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.15em] text-[#0e4c7e]">O município</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">História de {MUNICIPALITY_NAME}</h1>
      <div className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-700 sm:p-8">
        <p>
          Entre paisagens de veredas e caminhos do interior de Minas Gerais, {MUNICIPALITY_NAME} tem sua história ligada
          à vida no campo, ao encontro das famílias e ao trabalho de sua comunidade. O povoado cresceu em torno das
          atividades rurais e do comércio local, formando uma cidade acolhedora, onde a colaboração entre vizinhos
          faz parte da identidade do município.
        </p>
        <p>
          As tradições culturais, o artesanato e as festas comunitárias preservam a memória de quem ajudou a construir
          a cidade. A convivência entre a sede urbana e as comunidades rurais mantém vivo o vínculo com a terra,
          com a natureza e com os saberes transmitidos de geração em geração.
        </p>
        <p>
          Hoje, {MUNICIPALITY_NAME} olha para o futuro com o compromisso de valorizar suas raízes e melhorar a qualidade
          de vida da população. A Prefeitura atua na organização dos serviços públicos, no cuidado com os espaços
          da cidade e na aproximação entre a administração e o cidadão.
        </p>
        <section id="sede" aria-labelledby="sede-titulo" className="rounded-lg bg-slate-50 p-5">
          <h2 id="sede-titulo" className="font-bold text-slate-900">Sede do município</h2>
          <p className="mt-2">
            A sede da {institution.name} está localizada no Centro e reúne o atendimento administrativo ao cidadão.
          </p>
          <address className="mt-3 not-italic font-semibold text-[#0e4c7e]">{location}</address>
          <Link href="/portal/contato" className="mt-4 inline-flex font-bold text-[#00843d] hover:underline">Consultar canais de atendimento</Link>
        </section>
      </div>
    </main>
  );
}
