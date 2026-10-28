import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readTaxAccountingMovements, taxAccountingFilters } from "@/lib/tributacao/accounting-movements";
import PrintMovements from "./PrintMovements";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalTaxLabels, listFiscalYears } from "@/db/repositories/taxation-pages/lookups";

export const dynamic = "force-dynamic";

export default async function TaxAccountingMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const params = await searchParams;
  const raw = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value !== ""));
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const units = await listFiscalPlanningUnits(database, allowedBudgetUnitIds, "entity-unit");
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity.name])).entries()];
  const governmentEntityId = typeof raw.governmentEntityId === "string" ? raw.governmentEntityId : entities[0]?.[0];
  if (!governmentEntityId || !entities.some(([id]) => id === governmentEntityId)) return <p className="p-5">Selecione ente com UG autorizada na Tributação.</p>;
  const entityUnits = units.filter(unit => unit.governmentEntityId === governmentEntityId);
  const years = await listFiscalYears(database, governmentEntityId);
  const financialYearId = typeof raw.financialYearId === "string" ? raw.financialYearId : years.find(year => year.status === "Aberto")?.id ?? years[0]?.id;
  if (!financialYearId || !years.some(year => year.id === financialYearId)) return <p className="p-5">Exercício fora do ente selecionado.</p>;
  const parsed = taxAccountingFilters.safeParse({ ...raw, governmentEntityId, financialYearId });
  if (!parsed.success) return <p className="p-5">{parsed.error.issues[0]?.message}</p>;
  const filters = parsed.data;
  if (filters.budgetUnitId && !entityUnits.some(unit => unit.budgetUnitId === filters.budgetUnitId)) return <p className="p-5">UG fora do acesso autorizado.</p>;
  let result: Awaited<ReturnType<typeof readTaxAccountingMovements>>;
  try { result = await readTaxAccountingMovements(database, { allowedBudgetUnitIds }, filters); }
  catch (error) { return <section className="p-5"><Link href="/tributacao">Tributação</Link><p>{error instanceof Error ? error.message : "Não foi possível consultar as partidas tributárias."}</p></section>; }
  const taxes = await listFiscalTaxLabels(database, "name-id");
  const href = (page: number) => {
    const query = new URLSearchParams({ governmentEntityId, financialYearId, page: String(page) });
    for (const key of ["budgetUnitId", "from", "through", "taxId", "eventType", "account", "minimum", "maximum"] as const) if (filters[key]) query.set(key, filters[key]);
    return `?${query}`;
  };
  const field = "block w-full rounded border p-2 text-sm";
  return <section className="space-y-4 p-5">
    <header><h1 className="text-xl font-semibold">Movimentações tributárias e partidas contábeis</h1><Link className="underline print:hidden" href="/tributacao">Painel tributário</Link></header>
    <form className="flex flex-wrap items-end gap-3 rounded border p-4 print:hidden"><label>Entidade<select name="governmentEntityId" defaultValue={governmentEntityId} className={field}>{entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button className="rounded border p-2">Selecionar entidade</button></form>
    <form className="grid gap-3 rounded border p-4 sm:grid-cols-3 print:hidden"><input type="hidden" name="governmentEntityId" value={governmentEntityId} />
      <label>Exercício<select name="financialYearId" defaultValue={financialYearId} className={field}>{years.map(year => <option key={year.id} value={year.id}>{year.year} · {year.status}</option>)}</select></label>
      <label>UG<select name="budgetUnitId" defaultValue={filters.budgetUnitId ?? ""} className={field}><option value="">Todas as UGs autorizadas do ente</option>{entityUnits.map(unit => <option key={unit.budgetUnitId} value={unit.budgetUnitId}>{unit.budgetUnit.code} · {unit.budgetUnit.name}</option>)}</select></label>
      <label>Tributo<select name="taxId" defaultValue={filters.taxId ?? ""} className={field}><option value="">Todos</option>{taxes.map(tax => <option key={tax.id} value={tax.id}>{tax.name}</option>)}</select></label>
      <label>Data inicial<input type="date" name="from" defaultValue={filters.from} className={field} /></label><label>Data final<input type="date" name="through" defaultValue={filters.through} className={field} /></label>
      <label>Tipo de movimentação / evento<input name="eventType" maxLength={150} defaultValue={filters.eventType} className={field} /></label>
      <label>Conta contábil<input name="account" maxLength={150} defaultValue={filters.account} className={field} /></label><label>Valor contábil mínimo<input name="minimum" inputMode="decimal" placeholder="0.00" defaultValue={filters.minimum} className={field} /></label><label>Valor contábil máximo<input name="maximum" inputMode="decimal" placeholder="0.00" defaultValue={filters.maximum} className={field} /></label>
      <button className="self-end rounded bg-emerald-700 p-2 text-white">Consultar partidas</button>
    </form>
    <p className="text-sm">{entities.find(([id]) => id === governmentEntityId)?.[1]} · exercício {result.year} · {result.total} transações · página {result.page}. {filters.from ?? "Início do exercício"} a {filters.through ?? "Fim do exercício"}. Tributo: {taxes.find(tax => tax.id === filters.taxId)?.name ?? "Todos"}.</p>
    <p className="text-sm">Vínculos fiscais são consultados por identificadores de origem. Valores exibidos por linha, em débito/crédito; filtros de conta e valor recortam as linhas da partida. Ausência de partida não comprova contabilização de um fato tributário.</p>
    <PrintMovements />
    <section className="space-y-2"><h2 className="font-semibold">Referências disponíveis aguardando partida — {result.availableTotal}</h2><p className="text-sm">Referências de arrecadação pendentes, vinculadas ao retorno, guia e escopo fiscal. Conta contábil não é atribuída pelo cadastro atual; filtros de conta não incluem referências sem partida.</p>{result.available.map(reference => <article key={reference.id} className="break-inside-avoid rounded border border-amber-300 p-3 text-sm"><p>{reference.date.slice(0, 10)} · {reference.eventType} · {reference.taxName} · R$ {reference.amount}</p><p className="break-all text-xs">UG {reference.budgetUnitId} · guia {reference.guideId} · lançamento {reference.assessmentId} · retorno {reference.originEventId} · referência {reference.id}</p><p>Conta/partida ainda não conciliadas.</p></article>)}</section>
    <div className="space-y-3">{result.transactions.map(transaction => <article key={transaction.id} className="break-inside-avoid space-y-2 rounded border p-3">
      <h2 className="font-semibold">{transaction.date.slice(0, 10)} · {transaction.eventType} · {transaction.status}</h2><p className="text-sm">{transaction.history}</p><p className="text-xs">UG {transaction.budgetUnit?.code} · {transaction.budgetUnit?.name} · usuário {transaction.authorUsuario.nome}</p>
      <p className="break-all text-xs">{transaction.sourceModule}/{transaction.sourceType} · origem {transaction.sourceId ?? "Não documentada"} · partida {transaction.id}{transaction.reversalOfId ? ` · estorno de ${transaction.reversalOfId}` : ""}</p>
      <table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Conta congelada / cadastro</th><th className="p-2 text-left">Natureza</th><th className="p-2 text-right">Valor contábil (R$)</th></tr></thead><tbody>{transaction.entries.map(entry => <tr key={entry.id}><td className="border-t p-2">{entry.frozenAccountCode ?? "Classificação histórica não documentada"} · {entry.account.code} — {entry.account.name}</td><td className="border-t p-2">{entry.type}</td><td className="border-t p-2 text-right">{entry.amount ?? "Decimal não conciliado"}</td></tr>)}</tbody></table>
    </article>)}{!result.transactions.length && <p>Sem partidas tributárias com os filtros informados.</p>}</div>
    <nav className="flex gap-4 print:hidden">{result.page > 1 && <Link href={href(result.page - 1)}>Anterior</Link>}{result.page * 50 < Math.max(result.total, result.availableTotal) && <Link href={href(result.page + 1)}>Próxima</Link>}</nav>
  </section>;
}
