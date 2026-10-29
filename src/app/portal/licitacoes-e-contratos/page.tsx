import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { getPublicBiddings, getPublicContracts } from "@/lib/transparencia/portal-public";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";
import { PublicOperationalList } from "../PublicOperationalList";
import { PublicTableViews } from "../PublicTableViews";

export const metadata: Metadata = {
  title: `Licitações e Contratos | ${MUNICIPALITY_INSTITUTION_NAME}`,
  description: `Licitações e contratos publicados por ${MUNICIPALITY_INSTITUTION_NAME}.`,
};

export const dynamic = "force-dynamic";

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value) : "-";
}

export default async function LicitacoesContratosPage() {
  const [biddings, contracts] = await Promise.all([getPublicBiddings(db), getPublicContracts(db)]);

  return (
    <main className="mx-auto max-w-6xl space-y-2 px-4 py-3 sm:px-6">
      <PortalBreadcrumb current="Licitações e Contratos" />
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Licitações e Contratos</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Publicações oficiais de licitações e contratos. Dados ao vivo do <Link href="/portal-transparencia" className="font-bold text-[#0e4c7e] hover:underline">Portal da Transparência</Link>, com exportação em CSV.
      </p>

      <PublicTableViews views={[
        { id: "licitacoes", title: "Licitações publicadas", content: <PublicOperationalList id="licitacoes" caption="Licitações publicadas" actions={<a href="/api/transparencia/licitacoes?format=csv" className="text-sm underline">Exportar CSV</a>} columns={[["number", "Licitação", 130, 90, "identifier"], ["modality", "Modalidade", 140, 100], ["status", "Situação", 130, 90, "status"], ["process", "Processo", 150, 100], ["object", "Objeto", 280, 130], ["session", "Sessão", 110, 90]]} rows={biddings.map((bidding) => ({ id: bidding.number, label: bidding.number, values: { number: bidding.number, modality: bidding.modality, status: bidding.status, process: bidding.processNumber, object: bidding.object, session: formatDate(bidding.sessionDate) } }))} /> },
        { id: "contratos", title: "Contratos", content: <PublicOperationalList id="contratos" caption="Contratos publicados" actions={<a href="/api/transparencia/contratos?format=csv" className="text-sm underline">Exportar CSV</a>} columns={[["number", "Contrato", 120, 90, "identifier"], ["status", "Situação", 120, 90, "status"], ["supplier", "Fornecedor", 220, 110], ["document", "Documento", 160, 120], ["start", "Início", 110, 90], ["end", "Fim", 110, 90], ["value", "Valor atualizado", 160, 120, "text", "right"]]} rows={contracts.map((contract) => ({ id: contract.number, label: contract.number, values: { number: contract.number, status: contract.status, supplier: contract.supplier.name, document: contract.supplier.documentMasked, start: formatDate(contract.startDate), end: formatDate(contract.endDate), value: formatMoney(contract.updatedValue) } }))} /> },
      ]} />
    </main>
  );
}
