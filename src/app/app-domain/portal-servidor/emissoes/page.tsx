import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listOwnPublishedDocuments } from "@/lib/portal-servidor/document-publication";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export const dynamic = "force-dynamic";
export default async function MyIssuedDocuments({ searchParams }: { searchParams: Promise<{ kind?: string; year?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams, documents = await listOwnPublishedDocuments(access.context);
  const rows = documents.filter(document => (!params.kind || document.payload.kind === params.kind) && (!params.year || String(document.payload.year) === params.year));
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col"><ErpPageTitle title="Minhas emissões funcionais" description="Documentos de origem RH/Folha/SST liberados para seus vínculos." action={<Link href="/portal-servidor/servicos">Solicitar documento</Link>} />
    <PortalOperationalList id="emissoes" label="Emissões funcionais" page={page} total={rows.length} values={{ kind: params.kind, year: params.year }} toolbar={<form className="flex gap-2 text-xs"><select name="kind" aria-label="Tipo documental" defaultValue={params.kind || ""} className="h-7 rounded border px-2"><option value="">Todos os tipos</option>{[...new Set(documents.map(document => document.payload.kind))].map(kind => <option key={kind}>{kind}</option>)}</select><input name="year" aria-label="Ano" defaultValue={params.year} placeholder="Ano" pattern="[0-9]{4}" className="h-7 w-24 rounded border px-2" /><button>Filtrar</button></form>} columns={[portalColumn("title", "Documento", 300, 130), portalColumn("kind", "Tipo", 180, 100), portalColumn("year", "Ano", 80, 60), portalColumn("release", "Liberação", 120, 92), portalColumn("actions", "Arquivo", 150, 140, "actions", "right", 180)]} rows={rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(document => ({ id: document.id, label: document.payload.title, values: { title: document.payload.title, kind: document.payload.kind, year: String(document.payload.year || "—"), release: new Date(document.payload.releaseAt).toLocaleDateString("pt-BR") }, actions: <a href={`/api/portal-servidor/emissoes/${document.id}`}>Emitir versão integral</a> }))} />
  </div>;
}
