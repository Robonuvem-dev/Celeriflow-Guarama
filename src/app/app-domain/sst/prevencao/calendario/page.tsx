import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { cipaCalendar } from "@/lib/sst/prevention-service";
export const dynamic = "force-dynamic";
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("SST"), search = await searchParams;
  const units = await listSstUnits(sstDatabase(context), context);
  const budgetUnitId = typeof search.budgetUnitId === "string" ? search.budgetUnitId : units[0]?.id;
  const year = Number(search.year || new Date().getFullYear());
  const rows = budgetUnitId ? await cipaCalendar(context, budgetUnitId, year) : [];
  return <main className="space-y-4 p-4"><Link className="underline" href="/sst/prevencao">CIPA e prevenção</Link><h1 className="text-xl font-semibold">Calendário anual de reuniões CIPA</h1><form className="flex flex-wrap gap-3"><label>UG<select name="budgetUnitId" className="ml-2 rounded border p-2" defaultValue={budgetUnitId}>{units.map(u => <option value={u.id} key={u.id}>{u.code} — {u.name}</option>)}</select></label><label>Ano<input className="ml-2 w-24 rounded border p-2" type="number" name="year" min={1900} max={2200} defaultValue={year}/></label><button className="rounded border px-3">Consultar</button></form><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 12 }, (_, month) => <section key={month} className="rounded border p-3"><h2 className="font-semibold">{new Date(year, month, 1).toLocaleString("pt-BR", { month: "long" })}</h2>{rows.filter(r => Number(new Date(r.at).toLocaleString("en-US", { month: "numeric", timeZone: "America/Sao_Paulo" })) - 1 === month).map(r => <p key={r.id} className="mt-2"><Link className="underline" href={`/sst/prevencao/${r.id}`}>{new Date(r.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — {r.title}</Link>{r.at !== r.originalAt && <span className="block text-xs">Adiada; data original {new Date(r.originalAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}</p>)}</section>)}</div></main>;
}
