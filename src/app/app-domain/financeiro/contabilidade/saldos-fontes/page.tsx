import Link from "next/link";
import { z } from "zod";
import { readAccountingMonthlySources } from "@/lib/financeiro/accounting-monthly-sources";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db, databaseConnection } from "@/db/client";
import { listAccountingReportUnits, listAccountingReportYears } from "@/db/repositories/finance/accounting-reports";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({ governmentEntityId: z.string().min(1).optional(), financialYearId: z.string().min(1).optional(), budgetUnitId: z.string().min(1).optional(), account: z.string().trim().max(150).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) });

export default async function MonthlySourceBalancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { database, user } = await getTenantContextForModule("FINANCEIRO");
  const executor = database ?? db;
  const raw = await searchParams;
  const parsed = filtersSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== "")));
  if (!parsed.success) return <p className="p-5">{parsed.error.issues[0]?.message}</p>;
  const filters = parsed.data;
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const units = await listAccountingReportUnits(executor, allowedBudgetUnitIds);
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity.name])).entries()];
  const governmentEntityId = filters.governmentEntityId ?? entities[0]?.[0];
  if (!governmentEntityId || !entities.some(([id]) => id === governmentEntityId)) return <p className="p-5">Selecione entidade autorizada.</p>;
  const entityUnits = units.filter(unit => unit.governmentEntityId === governmentEntityId);
  if (filters.budgetUnitId && !entityUnits.some(unit => unit.budgetUnitId === filters.budgetUnitId)) return <p className="p-5">UG fora do ente ou do acesso autorizado.</p>;
  const years = await listAccountingReportYears(executor, governmentEntityId);
  const financialYearId = filters.financialYearId ?? years.find(year => year.status === "Aberto")?.id ?? years[0]?.id;
  if (!financialYearId || !years.some(year => year.id === financialYearId)) return <p className="p-5">Exercício fora da entidade selecionada.</p>;
  let report: Awaited<ReturnType<typeof readAccountingMonthlySources>>;
  try { report = await readAccountingMonthlySources(databaseConnection, { allowedBudgetUnitIds }, { governmentEntityId, financialYearId, budgetUnitId: filters.budgetUnitId, account: filters.account }); }
  catch (error) { return <section className="space-y-3 p-5"><Link href="/financeiro/contabilidade" className="underline">Voltar à Contabilidade</Link><p>{error instanceof Error ? error.message : "Não foi possível conciliar a consulta de saldos."}</p></section>; }
  const unitLabels = new Map(entityUnits.map(unit => [unit.budgetUnitId, `${unit.budgetUnit.code} · ${unit.budgetUnit.name}`]));
  const visible = report.rows.slice((filters.page - 1) * 50, filters.page * 50);
  const href = (page: number) => {
    const query = new URLSearchParams({ governmentEntityId, financialYearId, page: String(page) });
    if (filters.budgetUnitId) query.set("budgetUnitId", filters.budgetUnitId);
    if (filters.account) query.set("account", filters.account);
    return `?${query}`;
  };
  const field = "block w-full rounded border p-2 text-sm";
  return <section className="space-y-4 p-5">
    <header><h1 className="text-xl font-semibold">Saldos mensais por conta e vínculo de recursos</h1><Link href="/financeiro/contabilidade" className="underline">Contabilidade e fechamento</Link></header>
    <form className="flex flex-wrap items-end gap-3 rounded border p-4"><label>Entidade<select name="governmentEntityId" defaultValue={governmentEntityId} className={field}>{entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button className="rounded border p-2 text-sm">Selecionar entidade</button></form>
    <form className="grid gap-3 rounded border p-4 sm:grid-cols-4">
      <input type="hidden" name="governmentEntityId" value={governmentEntityId} />
      <label>Exercício<select name="financialYearId" defaultValue={financialYearId} className={field}>{years.map(year => <option key={year.id} value={year.id}>{year.year} · {year.status}</option>)}</select></label>
      <label>UG<select name="budgetUnitId" defaultValue={filters.budgetUnitId ?? ""} className={field}><option value="">Todas as UGs autorizadas do ente</option>{entityUnits.map(unit => <option key={unit.budgetUnitId} value={unit.budgetUnitId}>{unitLabels.get(unit.budgetUnitId)}</option>)}</select></label>
      <label>Conta — código ou descrição<input name="account" maxLength={150} defaultValue={filters.account} className={field} /></label>
      <button className="self-end rounded bg-emerald-700 p-2 text-white">Consultar</button>
    </form>
    <p className="text-sm">Exercício {report.year} · {report.entryCount} linhas · {report.fullEntity ? "Todas as UGs do ente" : "Recorte das UGs autorizadas"}. Saldo: débitos menos créditos, acumulado até o fim de cada mês; negativo indica saldo credor. Lançamentos de abertura integram o mês de sua data.</p>
    {!!report.undocumentedEntries && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">{report.undocumentedEntries} linhas sem classificação/fonte publicada congelada. Seus valores permanecem visíveis em agrupamentos separados; a consulta não certifica a conciliação por vínculo dessas linhas.</p>}
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="border p-2 text-left">Conta / UG / fonte</th>{Array.from({ length: 12 }, (_, month) => <th key={month} className="border p-2">{new Date(Date.UTC(report.year, month, 1)).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={JSON.stringify([row.accountId, row.accountCode, row.budgetUnitId, row.sourceId, row.sourceCode])}>
      <td className="min-w-64 border p-2">{row.accountCode} — {row.accountName}<br />{unitLabels.get(row.budgetUnitId)}<br />Fonte: {row.sourceCode ?? "Classificação não documentada"} · {row.sourceId ?? "Vínculo não documentado"}{!!row.undocumentedEntries && <p>{row.undocumentedEntries} linhas a conciliar</p>}</td>
      {row.months.map((month, index) => <td key={index} className="min-w-32 whitespace-nowrap border p-2 text-right"><span className="font-semibold">Saldo {month.balance}</span><br />D {month.debit}<br />C {month.credit}</td>)}
    </tr>)}{!report.rows.length && <tr><td colSpan={13} className="border p-4 text-center">Sem lançamentos com os filtros informados.</td></tr>}</tbody></table></div>
    <nav className="flex gap-4">{filters.page > 1 && <Link href={href(filters.page - 1)}>Anterior</Link>}<span>Página {filters.page} · {report.rows.length} combinações</span>{filters.page * 50 < report.rows.length && <Link href={href(filters.page + 1)}>Próxima</Link>}</nav>
  </section>;
}
