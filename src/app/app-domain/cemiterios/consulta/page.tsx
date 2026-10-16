import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { cemeteryQueryHref, cemeteryQuerySchema, type CemeterySearchParams } from "@/lib/cemeteries/query-policy";
import { listCemeteryProcesses } from "@/lib/cemeteries/queries";
import { CemeteryQueryFilters } from "@/components/cemeteries/CemeteryQueryFilters";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

const time = (date: Date | null) => date ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
export default async function CemeteryUnifiedQuery({ searchParams }: { searchParams: Promise<CemeterySearchParams> }) {
  const context = await getTenantContextForModule("CEMITERIOS");
  const parsed = cemeteryQuerySchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert" className="p-6">Filtros inválidos: {parsed.error.issues[0].message}</p>;
  const query = parsed.data;
  const { items, total, page } = await listCemeteryProcesses(context.prisma, query);
  return <main className="space-y-4 p-6"><header><h1 className="text-2xl font-bold">Consulta unificada de processos funerários</h1><p className="text-sm">Sepultamentos, velórios e cremações · {total} registros</p></header><CemeteryQueryFilters query={query} />
    <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead><tr>{["Comprovante", "Falecido / óbito", "Tipo / situação", "Cemitério", "Funerária / causa", "Agendamento", "Realização", ""].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{items.map(p => <tr key={p.id} className="border-t"><td className="p-3">{p.receiptCode}</td><td className="p-3">{p.deceased.fullName}<br />{p.deceased.deathDate.toISOString().slice(0, 10)}</td><td className="p-3">{p.processType}<br />{p.status}</td><td className="p-3">{p.cemetery?.name}</td><td className="p-3">{p.funeralHome?.name ?? "—"}<br />{p.deceased.cause?.description ?? p.deceased.causeText ?? "—"}</td><td className="p-3">{time(p.scheduledAt)}</td><td className="p-3">{time(p.performedAt)}</td><td className="p-3"><Link className="underline" href={`/cemiterios/processos/${p.id}`}>Abrir</Link></td></tr>)}</tbody></table>{!items.length && <p className="p-4">Nenhum processo encontrado.</p>}</div>
    <ErpPagination page={page} total={total} pageSize={20} previousHref={cemeteryQueryHref("/cemiterios/consulta", query, page - 1)} nextHref={cemeteryQueryHref("/cemiterios/consulta", query, page + 1)} jumpTo={{ pathname: "/cemiterios/consulta", values: Object.fromEntries(Object.entries(query).filter(([k]) => k !== "page").map(([k,v]) => [k, String(v)])) }} />
    <Link className="underline" href={cemeteryQueryHref("/cemiterios/relatorio", query, 1)}>Relatório completo de sepultados</Link>
  </main>;
}
