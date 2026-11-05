import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Headset, Info } from "lucide-react";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";
import { CitizenRequestForm } from "@/components/transparencia/CitizenRequestForm";
import { CitizenServiceInformation } from "@/components/transparencia/CitizenServiceInformation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { ombudsmanReferenceCatalog as catalog } from "@/db/schema/ombudsman-reference-catalog";

export const metadata: Metadata = {
  title: `Ouvidoria | ${MUNICIPALITY_INSTITUTION_NAME}`,
  description: `Ouvidoria municipal de ${MUNICIPALITY_INSTITUTION_NAME} — canais de manifestação do cidadão.`,
};

export const dynamic = "force-dynamic";

export default async function OuvidoriaPage() {
  const publicCatalog = await db
    .select()
    .from(catalog)
    .where(
      and(
        eq(catalog.isActive, true),
        eq(catalog.isOnline, true),
        inArray(catalog.kind, ["SUBJECT", "SUBSUBJECT"]),
      ),
    );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PortalBreadcrumb current="Ouvidoria" />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#0e4c7e]">
            <Headset className="size-4" aria-hidden="true" />
            Participação e Controle Social
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">
            Ouvidoria Municipal
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Canal oficial de escuta do cidadão de {MUNICIPALITY_INSTITUTION_NAME}. Crie um novo manifesto (Rua e Bairro, Lixo e Limpeza, Reclamação, Denúncia, Sugestão ou Elogio) ou acompanhe sua solicitação abaixo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/portal/cadastrar"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-bold text-[#0e4c7e] shadow-2xs hover:bg-slate-50"
          >
            Criar meu cadastro
          </Link>
          <Link
            href="/portal/acesso-informacao"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
          >
            Pedido de Informação (e-SIC)
          </Link>
        </div>
      </div>

      {/* Formulário Multietapas Principal (Criar Manifesto / Consultar Protocolo) */}
      <div id="manifestacao" className="mt-6">
        <CitizenRequestForm type="SOLICITACAO" publicCatalog={publicCatalog} />
      </div>

      {/* Informações complementares e normativas recolhidas em acordeão para manter a tela limpa */}
      <details className="group mt-6 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-bold text-slate-800">
          <span className="inline-flex items-center gap-2">
            <Info className="h-4 w-4 text-[#0e4c7e]" />
            Prazos legais, canais presenciais e informações institucionais da Ouvidoria
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-5">
          <CitizenServiceInformation />
        </div>
      </details>
    </main>
  );
}
