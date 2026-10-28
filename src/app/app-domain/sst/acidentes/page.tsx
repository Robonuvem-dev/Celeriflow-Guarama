import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listAccidents } from "@/lib/sst/accident-service";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { SstForm } from "../SstForm";
import { AccidentFields } from "./AccidentFields";
import { saveAccident } from "./actions";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { searchSstAccidentEmployees } from "@/db/repositories/sst-pages/accidents";
export const dynamic = "force-dynamic";
export default async function AccidentsPage({ searchParams }: { searchParams: Promise<{ page?: string; kind?: string; employee?: string }> }) {
  const context = await getTenantContextForModule("SST"), params = await searchParams;
  const { rows, page, total } = await listAccidents(context, Number(params.page || 1), params.kind || "");
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const employees = (params.employee || "").trim().length >= 3 ? await searchSstAccidentEmployees(database,units.map(u=>u.secretariatId),params.employee!) : [];
  const href = (p: number) => `/sst/acidentes?page=${p}&kind=${encodeURIComponent(params.kind || "")}`;
  return <main className="space-y-5 p-4"><h1 className="text-xl font-semibold">Acidentes, CAT e incidentes</h1>
    <form className="flex gap-2"><select name="kind" defaultValue={params.kind || ""}><option value="">Todos</option><option value="INCIDENT">Incidentes</option><option value="TYPICAL">Típicos</option><option value="COMMUTE">Trajeto</option><option value="DISEASE">Doença</option></select><button>Filtrar</button></form>
    <table className="w-full table-fixed text-sm"><thead><tr><th className="text-left">Servidor</th><th>Ocorrência</th><th>Tipo</th><th>Ações</th></tr></thead><tbody>{rows.map(r => <tr className="border-b" key={r.id}><td className="break-words p-2">{r.snapshot.employeeName}</td><td className="text-center">{r.occurredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="text-center">{r.kind}</td><td className="text-center"><Link href={`/sst/acidentes/${r.id}`}>Abrir ficha</Link></td></tr>)}</tbody></table>
    {!rows.length && <p>Nenhuma ocorrência no escopo selecionado.</p>}
    <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: "/sst/acidentes", values: { kind: params.kind } }} />
    <section className="space-y-3"><h2 className="font-semibold">Comunicar ocorrência</h2><form className="flex gap-2"><input name="employee" placeholder="Buscar servidor (mínimo 3 letras)" defaultValue={params.employee || ""} minLength={3} required className="rounded border p-2" /><button>Buscar</button></form><p>Busca canônica limitada a 20 correspondências. Refine o nome quando necessário.</p><SstForm action={saveAccident} redirectBase="/sst/acidentes"><AccidentFields units={units} employees={employees} /></SstForm></section>
  </main>;
}
