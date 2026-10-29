"use client";

import type { FiscalPaymentOption } from "@/lib/tributacao/fiscal-payment-option-schema";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../TaxOperationalTable";
import { TaxDraftText, taxDraftInput } from "../TaxDraftControls";

function DebtTaxesEditor({ value, onChange, taxes, label }: { value: string[]; onChange: (value: string[]) => void; taxes: { id: string; name: string }[]; label: string }) {
  return <OperationalTablePanel title={`Tributos verificados — ${label}`} triggerLabel={`Tributos (${value.length})`} description="A seleção é mantida na opção de pagamento, independentemente da página. Sem seleção, são verificados todos os tributos do ente.">
    <TaxOperationalTable id="opcao-pagamento-tributos"
      columns={[["selected", "Verificar", 64, 80], ["name", "Tributo", 140, 700]]}
      rows={taxes.map(tax => ({ id: tax.id, label: tax.name, values: { selected: value.includes(tax.id) ? "Sim" : "Não", name: tax.name }, cells: { selected: <input type="checkbox" aria-label={`Verificar débitos de ${tax.name}`} checked={value.includes(tax.id)} onChange={event => onChange(event.target.checked ? [...value, tax.id] : value.filter(id => id !== tax.id))} /> } }))} />
  </OperationalTablePanel>;
}

export default function PaymentOptionsEditor({ value, onChange, taxes }: { value: FiscalPaymentOption[]; onChange: (value: FiscalPaymentOption[]) => void; taxes: { id: string; name: string }[] }) {
  const change = (index: number, patch: Partial<FiscalPaymentOption>) => onChange(value.map((row, at) => at === index ? { ...row, ...patch } : row));
  const add = () => onChange([...value, { code: "", name: "", dueDate: "", discountPercent: "0", debtCheck: "NONE", debtTaxIds: [], legalBasis: "" }]);
  return <fieldset className="space-y-2 rounded border p-2 sm:col-span-4"><legend className="text-xs font-semibold">Opções anuais de cota única e desconto condicionado</legend><p className="text-xs">Cada opção preserva seu prazo e fundamento. O desconto só reduz o crédito quando houver pagamento integral no prazo, após nova conferência dos débitos. Sem tributos selecionados, a conferência abrange todos os tributos do ente.</p>
    <OperationalTablePanel title="Opções anuais de pagamento" triggerLabel={`Editar opções (${value.length})`} description="O rascunho completo fica no Motor Fiscal. A publicação valida todos os códigos, vencimentos, descontos, tributos e fundamentos.">
      <TaxOperationalTable id="opcoes-pagamento-rascunho"
        actions={<button type="button" disabled={value.length >= 20} onClick={add} className="h-7 rounded border px-2 text-[13px]">Adicionar opção</button>}
        columns={[["code", "Código", 64, 100, "identifier"], ["name", "Nome", 100, 190], ["due", "Vencimento", 100, 130], ["discount", "Desconto (%)", 80, 120, "text", "right"], ["condition", "Ausência de débitos", 100, 160], ["taxes", "Tributos verificados", 120, 170], ["basis", "Fundamento legal", 100, 230], ["actions", "Remover", 72, 72, "actions"]]}
        rows={value.map((row, index) => ({ id: String(index), label: row.name || `Opção ${index + 1}`, values: { code: row.code, name: row.name, due: row.dueDate, discount: row.discountPercent, condition: row.debtCheck, taxes: row.debtTaxIds.map(id => taxes.find(tax => tax.id === id)?.name ?? id).join("; ") || "Todos os tributos do ente", basis: row.legalBasis }, cells: {
          code: <input aria-label={`Código da opção ${index + 1}`} maxLength={60} value={row.code} onChange={event => change(index, { code: event.target.value })} className={taxDraftInput} />,
          name: <TaxDraftText label={`Nome da opção ${index + 1}`} maxLength={160} value={row.name} onChange={text => change(index, { name: text })} />,
          due: <input aria-label={`Vencimento da opção ${index + 1}`} type="date" value={row.dueDate} onChange={event => change(index, { dueDate: event.target.value })} className={taxDraftInput} />,
          discount: <input aria-label={`Desconto da opção ${index + 1}`} type="number" min="0" max="99.999999" step="0.000001" value={row.discountPercent} onChange={event => change(index, { discountPercent: event.target.value })} className={taxDraftInput} />,
          condition: <select aria-label={`Condição de débitos da opção ${index + 1}`} value={row.debtCheck} onChange={event => change(index, { debtCheck: event.target.value as FiscalPaymentOption["debtCheck"] })} className={taxDraftInput}><option value="NONE">Sem condição de débitos</option><option value="CURRENT">Do exercício</option><option value="ACTIVE">Dívida ativa</option><option value="INSTALLMENT">Parcelamentos</option><option value="ALL">Todos</option></select>,
          taxes: <span className="[&>button]:h-6! [&>button]:max-w-full [&>button]:px-1"><DebtTaxesEditor value={row.debtTaxIds} onChange={ids => change(index, { debtTaxIds: ids })} taxes={taxes} label={row.name || `Opção ${index + 1}`} /></span>,
          basis: <TaxDraftText label={`Fundamento da opção ${index + 1}`} maxLength={4000} value={row.legalBasis} onChange={text => change(index, { legalBasis: text })} />,
        }, actions: <button type="button" aria-label={`Remover opção ${index + 1}`} onClick={() => onChange(value.filter((_, at) => at !== index))} className="h-6 rounded border px-1 text-[13px]">Remover</button> }))} />
    </OperationalTablePanel>
    <button type="button" disabled={value.length >= 20} onClick={add} className="rounded border p-2 text-xs">Adicionar opção de pagamento</button>
  </fieldset>;
}
