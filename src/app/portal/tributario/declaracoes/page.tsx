import Link from "next/link";
import { db } from "@/db/client";
import { readCitizenDeclarations } from "@/db/repositories/portal-content/declarations";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { citizenDeclarationQuery } from "@/lib/portal-cidadao/declaration-query";

export const dynamic = "force-dynamic";

export default async function CitizenDeclarationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await getCitizenAccount("/portal/tributario");
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string"));
  const parsed = citizenDeclarationQuery.safeParse(input);
  if (!parsed.success) return <main className="mx-auto max-w-4xl space-y-4 p-6"><h1 className="text-2xl font-bold">Filtros inválidos</h1><p>Use uma competência válida no formato MM/AAAA e respeite os limites dos campos.</p><Link href="/portal/tributario/declaracoes" className="underline">Limpar filtros</Link></main>;
  const result = await readCitizenDeclarations(db, account.id, parsed.data);
  const href = (page: number) => `?${new URLSearchParams({ ...result.query, page: String(page) })}`;
  return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <Link href="/portal/tributario" className="underline">Área do contribuinte</Link>
    <h1 className="text-2xl font-bold">Minhas declarações fiscais</h1>
    <p>Consulta de serviços e bancos com vínculo fiscal ativo e permissão específica.</p>
    <form className="flex flex-wrap gap-3">
      <label>Declaração<select name="kind" defaultValue={result.query.kind} className="block rounded border p-2"><option value="DMS">Serviços (NFS-e)</option><option value="BANCOS">Bancos (DESIF)</option><option value="DIVERSOS">Diversos</option><option value="CARTORIO">Cartórios</option></select></label>
      <label>Competência<input className="block rounded border p-2" name="competence" defaultValue={result.query.competence} placeholder="MM/AAAA" pattern="(0[1-9]|1[0-2])/\d{4}" /></label>
      <label>Protocolo<input className="block rounded border p-2" name="protocol" defaultValue={result.query.protocol} maxLength={120} /></label>
      <label>Situação<input className="block rounded border p-2" name="status" defaultValue={result.query.status} maxLength={60} /></label>
      <label>Serviços<select className="block rounded border p-2" name="direction" defaultValue={result.query.direction}><option value="">Todos</option><option value="PRESTADOS">Prestados</option><option value="TOMADOS">Tomados</option></select></label>
      <button className="self-end rounded bg-emerald-800 p-2 text-white">Consultar</button>
    </form>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Protocolo", "Competência", "Serviços / módulo", "Situação", "Canal", "Movimento", "Valor", "ISS próprio", "ISS retido"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{result.rows.map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.protocol}</td><td>{row.competence}</td><td>{row.direction}</td><td>{row.status}</td><td>{row.channel}</td><td>{row.noMovement === null ? "—" : row.noMovement ? "Sem movimento" : "Com movimento"}</td><td>{row.serviceValue?.toFixed(2) ?? "—"}</td><td>{row.ownIss?.toFixed(2) ?? "—"}</td><td>{row.retainedIss?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table></div>
    {!result.rows.length && <p>Nenhuma declaração encontrada para os filtros e vínculos autorizados.</p>}
    <ErpPagination page={result.page} total={result.total} pageSize={20} previousHref={href(result.page - 1)} nextHref={href(result.page + 1)} label="declarações" />
  </main>;
}
