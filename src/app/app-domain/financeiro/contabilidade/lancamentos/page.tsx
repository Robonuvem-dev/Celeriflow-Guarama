import Link from "next/link";
import type { JsonObject, JsonValue } from "@/db/json";
import { db, databaseConnection } from "@/db/client";
import { listFinancePageUnits, listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import { readFinanceAccountingEntries } from "@/db/repositories/finance-pages/accounting";
import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { EntryCheckbox, EntrySelection } from "./EntrySelection";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  governmentEntityId: z.string().min(1).optional(),
  financialYearId: z.string().min(1).optional(),
  budgetUnitId: z.string().min(1).optional(),
  from: z.iso.date().optional(),
  through: z.iso.date().optional(),
  sourceModule: z.string().trim().max(50).optional(),
  account: z.string().trim().max(150).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine(value => !value.from || !value.through || value.from <= value.through, "A data inicial deve preceder a data final.");

function object(value: JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function label(value: JsonValue | undefined): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "Não documentado";
}

function FrozenDimensions({ snapshot }: { snapshot: JsonValue }) {
  const classification = object(snapshot), dimensions = object(classification.dimensions);
  const budget = object(dimensions.budgetDimensions), source = object(dimensions.sourceClassification);
  const revenue = object(budget.revenueClassification), expense = object(budget.expenseClassification);
  const program = object(budget.program), action = object(budget.action);
  const msc = object(dimensions.msc);
  const mscInformation = object(msc.information);
  return <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
    <div><dt className="font-semibold">Classificação contábil congelada</dt><dd>{label(classification.externalCode)} · edição {label(classification.entryId)}</dd></div>
    <div><dt className="font-semibold">Fonte da linha</dt><dd>{label(source.externalCode)} · {label(dimensions.resourceSourceId)} · {label(dimensions.sourceRole)}</dd></div>
    <div><dt className="font-semibold">Natureza da receita/despesa</dt><dd>{label(revenue.externalCode)} / {label(expense.externalCode)}</dd></div>
    <div><dt className="font-semibold">Programa / ação</dt><dd>{label(program.code)} / {label(action.code)}</dd></div>
    <div><dt className="font-semibold">Função / subfunção</dt><dd>{label(budget.functionCode)} / {label(budget.subfunctionCode)}</dd></div>
    <div><dt className="font-semibold">Conta corrente MSC</dt><dd>{Object.keys(mscInformation).length ? `Conta ${label(msc.accountCode)} · ${Object.entries(mscInformation).map(([key, value]) => `${key}: ${label(value)}`).join(" · ")}` : "Composição MSC não documentada nesta linha"} · {label(dimensions.mscReadiness)}</dd></div>
    <div><dt className="font-semibold">Referência estadual / origem</dt><dd>Catálogo {label(classification.versionId)} · hash {label(classification.sourceHash)}</dd></div>
    <div><dt className="font-semibold">Contraparte de estorno</dt><dd>{label(classification.originalEntryId)} · transação {label(dimensions.originalTransactionId)}</dd></div>
  </dl>;
}

export default async function AccountingEntriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { database, user } = await getTenantContextForModule("FINANCEIRO");
  const executor = database ?? db;
  const raw = await searchParams;
  const parsed = filtersSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== "")));
  if (!parsed.success) return <p className="p-5">{parsed.error.issues[0]?.message}</p>;
  const filters = parsed.data;
  const units = await listFinancePageUnits(executor, { allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds });
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity.name])).entries()];
  const governmentEntityId = filters.governmentEntityId ?? entities[0]?.[0];
  if (!governmentEntityId || !entities.some(([id]) => id === governmentEntityId)) return <p className="p-5">Selecione uma entidade com UG autorizada no Financeiro.</p>;
  const entityUnits = units.filter(unit => unit.governmentEntityId === governmentEntityId);
  if (filters.budgetUnitId && !entityUnits.some(unit => unit.budgetUnitId === filters.budgetUnitId)) return <p className="p-5">UG fora da entidade ou do acesso autorizado.</p>;
  const years = await listFinancePageYears(executor, {}, [governmentEntityId]);
  const financialYearId = filters.financialYearId ?? years.find(year => year.status === "Aberto")?.id ?? years[0]?.id;
  if (!financialYearId || !years.some(year => year.id === financialYearId)) return <p className="p-5">Exercício fora da entidade selecionada.</p>;
  const { count, transactions } = await readFinanceAccountingEntries(databaseConnection, {
    governmentEntityId, financialYearId,
    budgetUnitIds: filters.budgetUnitId ? [filters.budgetUnitId] : entityUnits.map(unit => unit.budgetUnitId),
    sourceModule: filters.sourceModule, account: filters.account, q: filters.q, page: filters.page,
    from: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined,
    through: filters.through ? new Date(`${filters.through}T23:59:59.999Z`) : undefined,
  });
  const href = (page: number) => {
    const query = new URLSearchParams({ governmentEntityId, financialYearId, page: String(page) });
    for (const key of ["budgetUnitId", "from", "through", "sourceModule", "account", "q"] as const) if (filters[key]) query.set(key, filters[key]);
    return `?${query}`;
  };
  const field = "block w-full rounded border p-2 text-sm";
  return <section className="space-y-4 p-5">
    <header><h1 className="text-xl font-semibold">Consulta unificada de lançamentos contábeis</h1><Link href="/financeiro/contabilidade" className="underline">Contabilidade e fechamento</Link></header>
    <form className="flex flex-wrap items-end gap-3 rounded border p-4">
      <label>Entidade<select name="governmentEntityId" defaultValue={governmentEntityId} className={field}>{entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <button className="rounded border p-2 text-sm">Selecionar entidade</button>
    </form>
    <form className="grid gap-3 rounded border p-4 sm:grid-cols-3">
      <input type="hidden" name="governmentEntityId" value={governmentEntityId} />
      <label>Exercício<select name="financialYearId" defaultValue={financialYearId} className={field}><option value="">Exercício ativo da entidade</option>{years.map(year => <option key={year.id} value={year.id}>{year.year} · {year.status}</option>)}</select></label>
      <label>UG<select name="budgetUnitId" defaultValue={filters.budgetUnitId ?? ""} className={field}><option value="">Todas as UGs autorizadas da entidade</option>{entityUnits.map(unit => <option key={unit.budgetUnitId} value={unit.budgetUnitId}>{unit.budgetUnit.code} · {unit.budgetUnit.name}</option>)}</select></label>
      <label>Desde<input type="date" name="from" defaultValue={filters.from} className={field} /></label>
      <label>Até<input type="date" name="through" defaultValue={filters.through} className={field} /></label>
      <label>Módulo produtor<input name="sourceModule" maxLength={50} defaultValue={filters.sourceModule} placeholder="FINANCEIRO, TRIBUTACAO, RH…" className={field} /></label>
      <label>Conta — código ou descrição<input name="account" maxLength={150} defaultValue={filters.account} className={field} /></label>
      <label>Histórico, evento ou origem<input name="q" maxLength={200} defaultValue={filters.q} className={field} /></label>
      <button className="self-end rounded bg-emerald-700 p-2 text-white">Consultar</button>
    </form>
    <p className="text-sm">{count} transações encontradas. Dimensões exibidas a partir da memória congelada de cada linha; ausência de memória não é substituída pelo cadastro atual.</p>
    <EntrySelection key={href(filters.page)} entries={transactions.flatMap(transaction => transaction.entries.map(entry => ({ id: entry.id, type: entry.type, value: entry.valueDecimal?.toFixed(2) ?? null })))}>
    <div className="space-y-3">{transactions.map(transaction => <article key={transaction.id} className="space-y-3 rounded border bg-white p-4">
      <h2 className="font-semibold">{transaction.history}</h2>
      <p className="text-sm">{transaction.date.toISOString().slice(0, 10)} · {transaction.status} · UG {transaction.budgetUnit?.code} — {transaction.budgetUnit?.name}</p>
      <p className="break-all text-sm">Evento: {transaction.eventType} · Produtor: {transaction.sourceModule}/{transaction.sourceType} · Origem: {transaction.sourceId ?? "Sem vínculo setorial"} · Usuário: {transaction.authorUsuario.nome}</p>
      <p className="break-all text-xs">Transação {transaction.id}{transaction.reversalOfId ? ` · Estorno de ${transaction.reversalOfId}` : ""}</p>
      {transaction.entries.map(entry => <div key={entry.id} className="space-y-2 border-t pt-3">
        <EntryCheckbox entry={{ id: entry.id, type: entry.type, value: entry.valueDecimal?.toFixed(2) ?? null }} />
        <p className="font-medium">{entry.type}: {entry.account.code} — {entry.account.name} · R$ {entry.valueDecimal?.toFixed(2) ?? "Valor Decimal não conciliado"}</p>
        <p className="text-xs">Autor funcional: {entry.author.name} · Linha {entry.id}</p>
        <FrozenDimensions snapshot={entry.classificationSnapshot} />
      </div>)}
    </article>)}{!transactions.length && <p>Nenhum lançamento encontrado com os filtros informados.</p>}</div>
    </EntrySelection>
    <nav className="flex gap-4">{filters.page > 1 && <Link href={href(filters.page - 1)}>Anterior</Link>}<span>Página {filters.page}</span>{filters.page * 50 < count && <Link href={href(filters.page + 1)}>Próxima</Link>}</nav>
  </section>;
}
