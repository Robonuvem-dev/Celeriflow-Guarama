import { db } from "@/db/client";
import { listFinancePageSources } from "@/db/repositories/finance-pages/catalog";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
export const dynamic = "force-dynamic";
export default async function ResourceSourceReport({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
  const query = await searchParams;
  const rows = (await listFinancePageSources(context.database ?? db)).filter(source => `${source.code} ${source.name}`.toLocaleLowerCase("pt-BR").includes((query.q ?? "").toLocaleLowerCase("pt-BR")));
  const escape = (v: string) => `"${(/^[=+\-@]/.test(v) ? "'" + v : v).replaceAll('"', '""')}"`;
  const csv = [["Código", "Fonte de recurso"], ...rows.map(row => [row.code, row.name])].map(row => row.map(escape).join(",")).join("\r\n");
  return <main className="space-y-4 p-5"><h1 className="text-xl font-semibold">Listagem de fontes de recurso</h1><form><input aria-label="Buscar fonte" name="q" defaultValue={query.q} className="rounded border p-2" /><button className="p-2">Buscar</button></form><p>{rows.length} fontes · Emitido por {context.user.name}</p><a className="underline" download="fontes-recursos.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + csv)}`}>Emitir CSV da listagem</a><table><thead><tr><th>Código</th><th>Fonte</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td></tr>)}</tbody></table>{!rows.length && <p>Nenhuma fonte no filtro.</p>}</main>;
}
