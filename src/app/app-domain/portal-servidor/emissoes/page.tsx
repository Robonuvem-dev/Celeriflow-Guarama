import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listOwnPublishedDocuments } from "@/lib/portal-servidor/document-publication";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function MyIssuedDocuments({ searchParams }: { searchParams: Promise<{ kind?: string; year?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams, documents = await listOwnPublishedDocuments(access.context);
  const rows = documents.filter(document => (!params.kind || document.payload.kind === params.kind) && (!params.year || String(document.payload.year) === params.year));
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(rows.length / 20)));
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), kind: params.kind || "", year: params.year || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 p-3"><ErpPageTitle title="Minhas emissões funcionais" description="Documentos de origem RH/Folha/SST liberados para seus vínculos." action={<Link href="/portal-servidor/servicos">Solicitar documento</Link>} />
    <ErpListFrame toolbar={<form className="flex gap-2 text-xs"><select name="kind" aria-label="Tipo documental" defaultValue={params.kind || ""} className="h-8 rounded border px-2"><option value="">Todos os tipos</option>{[...new Set(documents.map(document => document.payload.kind))].map(kind => <option key={kind}>{kind}</option>)}</select><input name="year" aria-label="Ano" defaultValue={params.year} placeholder="Ano" pattern="[0-9]{4}" className="h-8 w-24 rounded border px-2" /><button className="rounded border px-3">Filtrar</button></form>} summary={<p className="text-xs">{rows.length} documentos</p>} pagination={<ErpPagination page={page} total={rows.length} pageSize={20} label="documentos" previousHref={href(page - 1)} nextHref={href(page + 1)} />}><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Documento</th><th>Tipo / ano</th><th>Liberação</th><th>Arquivo</th></tr></thead><tbody>{rows.slice((page - 1) * 20, page * 20).map(document => <tr key={document.id} className="border-t"><td className="p-2">{document.payload.title}</td><td>{document.payload.kind} · {document.payload.year || "—"}</td><td>{new Date(document.payload.releaseAt).toLocaleDateString("pt-BR")}</td><td><a href={`/api/portal-servidor/emissoes/${document.id}`} className="font-semibold text-emerald-800 underline">Emitir versão integral</a></td></tr>)}</tbody></table>{!rows.length && <p className="p-4 text-sm">Nenhum documento liberado neste filtro.</p>}</ErpListFrame>
  </div>;
}
