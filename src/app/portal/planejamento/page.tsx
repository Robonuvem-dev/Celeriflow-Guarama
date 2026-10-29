import Link from "next/link";
import { db } from "@/db/client";
import { listPlanningPublications } from "@/lib/transparencia/planning-publications";
import { PublicOperationalList } from "../PublicOperationalList";
export const dynamic = "force-dynamic";

export default async function PlanningPublicPortal({ searchParams }: { searchParams: Promise<{ year?: string; entity?: string; page?: string }> }) {
  const raw = await searchParams;
  const data = await listPlanningPublications(db, Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== "" && value !== undefined)));
  return <main className="mx-auto max-w-6xl space-y-2 p-3">
    <Link className="underline" href="/portal-transparencia">← Portal da Transparência</Link><h1 className="text-xl font-bold">Documentos de Planejamento e Orçamento</h1>
    <p className="text-sm">Arquivos publicados com versão e SHA-256 preservados. Documentos para conferência conservam a indicação de leiaute não homologado.</p>
    <PublicOperationalList id="planejamento" caption="Documentos de Planejamento e Orçamento" serverPagination={{ page: data.page, total: data.total, pathname: "/portal/planejamento", values: { year: raw.year, entity: raw.entity } }}
      toolbar={<form className="flex w-full min-w-0 gap-2"><label className="flex items-center gap-1">Exercício<input className="h-7 w-24 rounded border px-2" name="year" type="number" min={1900} max={2200} defaultValue={raw.year} /></label><label className="flex min-w-0 flex-1 items-center gap-1">Entidade<input className="h-7 min-w-0 flex-1 rounded border px-2" name="entity" defaultValue={raw.entity} /></label><button className="h-7 rounded border px-2">Consultar</button></form>}
      columns={[["entity", "Entidade", 140, 100], ["year", "Exercício", 100, 80], ["title", "Documento", 230, 120, "identifier"], ["completeness", "Completude", 160, 100], ["hash", "SHA-256", 230, 120], ["date", "Publicação", 120, 90], ["actions", "Arquivo", 80, 80, "actions"]]}
      rows={data.records.map((record) => ({ id: record.url, label: record.title, values: { entity: record.entity, year: String(record.year), title: record.title, completeness: record.completeness, hash: record.hash ?? "—", date: record.publishedAt?.slice(0, 10) || "—" }, actions: <a className="underline" href={record.url}>{record.format}</a> }))} />
  </main>;
}
