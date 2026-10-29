"use client";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import FinanceTablePanel from "./FinanceTablePanel";
import { financeColumn } from "./operational-columns";
import { draftField } from "./draft-rows";

type Option = { id: string; label: string };
type Term = { label: string; operation: "ADD" | "SUBTRACT"; side: "DEBIT_NET" | "CREDIT_NET"; accountIds: string[]; budgetUnitIds?: string[]; sourceTypes?: string[]; functionCodes?: string[] };

function Choices({ label, values, options, onChange }: { label: string; values: string[]; options: Option[]; onChange: (values: string[]) => void }) {
  return <Select multiple value={values} onValueChange={onChange} items={options.map(option => ({ value: option.id, label: option.label }))}>
    <SelectTrigger aria-label={label} className="h-5! w-full min-w-0 rounded border px-1 py-0! text-[13px]"><span className="truncate">{values.length ? `${values.length} selecionado(s)` : "Selecionar"}</span></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export default function FiscalTermsDraft<T extends Term>({ title, rows, onChange, blank, accounts, units, sourceTypes, functions }: {
  title: string; rows: T[]; onChange: (rows: T[]) => void; blank: () => T;
  accounts: Option[]; units: Option[]; sourceTypes: string[]; functions?: Option[];
}) {
  const change = (at: number, row: T) => onChange(rows.map((item, index) => index === at ? row : item));
  const names = (ids: string[], options: Option[]) => ids.map(id => options.find(option => option.id === id)?.label ?? id).join("; ");
  return <FinanceTablePanel label={title} preferenceId={`financeiro-composicao-${functions ? "indices" : "pessoal"}`} searchable={false}
    description="Seleções vazias de UG/origem abrangem todo o ente. O envio usa todos os componentes de todas as páginas."
    actions={<button type="button" onClick={() => onChange([...rows, blank()])}>Adicionar componente</button>}
    columns={[financeColumn("label", "Componente", 130, 230), financeColumn("operation", "Inclusão/dedução", 90, 130), financeColumn("accounts", "Contas analíticas", 120, 200), financeColumn("units", "UGs", 100, 150), financeColumn("side", "Sinal líquido", 110, 170), financeColumn("sources", "Origens", 100, 150), ...(functions ? [financeColumn("functions", "Funções da dotação", 100, 150)] : []), financeColumn("actions", "Ações", 90, 90, "actions")]}
    rows={rows.map((row, index) => ({ id: String(index), label: row.label || `Componente ${index + 1}`, values: { label: row.label, operation: row.operation === "ADD" ? "Incluir" : "Deduzir", accounts: names(row.accountIds, accounts), units: row.budgetUnitIds?.length ? names(row.budgetUnitIds, units) : "Todas as UGs do ente", side: row.side === "DEBIT_NET" ? "Débitos menos créditos" : "Créditos menos débitos", sources: row.sourceTypes?.join("; ") || "Todas as origens", functions: names(row.functionCodes ?? [], functions ?? []) || "Todas as funções" }, cells: {
      label: <input aria-label={`Componente ${index + 1}`} className={draftField} value={row.label} onChange={event => change(index, { ...row, label: event.target.value })} />,
      operation: <select aria-label={`Inclusão/dedução ${index + 1}`} className={draftField} value={row.operation} onChange={event => change(index, { ...row, operation: event.target.value as T["operation"] })}><option value="ADD">Incluir</option><option value="SUBTRACT">Deduzir</option></select>,
      accounts: <Choices label={`Contas do componente ${index + 1}`} values={row.accountIds} options={accounts} onChange={accountIds => change(index, { ...row, accountIds })} />,
      units: <Choices label={`UGs do componente ${index + 1}`} values={row.budgetUnitIds ?? []} options={units} onChange={ids => { const next = { ...row }; delete next.budgetUnitIds; change(index, { ...next, ...(ids.length ? { budgetUnitIds: ids } : {}) }); }} />,
      side: <select aria-label={`Sinal líquido ${index + 1}`} className={draftField} value={row.side} onChange={event => change(index, { ...row, side: event.target.value as T["side"] })}><option value="DEBIT_NET">Débitos menos créditos</option><option value="CREDIT_NET">Créditos menos débitos</option></select>,
      sources: <Choices label={`Origens do componente ${index + 1}`} values={row.sourceTypes ?? []} options={sourceTypes.map(id => ({ id, label: id }))} onChange={ids => { const next = { ...row }; delete next.sourceTypes; change(index, { ...next, ...(ids.length ? { sourceTypes: ids } : {}) }); }} />,
      ...(functions ? { functions: <Choices label={`Funções do componente ${index + 1}`} values={row.functionCodes ?? []} options={functions} onChange={ids => { const next = { ...row }; delete next.functionCodes; change(index, { ...next, ...(ids.length ? { functionCodes: ids } : {}) }); }} /> } : {}),
    }, actions: <button type="button" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, at) => at !== index))}>Remover</button> }))} />;
}
