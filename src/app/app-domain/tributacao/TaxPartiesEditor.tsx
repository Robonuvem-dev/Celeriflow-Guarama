"use client";

import type { ReactNode } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "./TaxOperationalTable";
import { taxDraftInput } from "./TaxDraftControls";

type Party = { taxpayerId: string; sharePercent: string; role?: string; validateDebt?: boolean };
export function TaxPartiesEditor({ id, title, rows, taxpayers, onChange, actions, roles = false }: {
  id: string; title: string; rows: Party[]; taxpayers: { id: string; label: string }[];
  onChange: (index: number, patch: Partial<Party>) => void; actions: ReactNode; roles?: boolean;
}) {
  return <OperationalTablePanel title={title} triggerLabel={`Editar ${title.toLocaleLowerCase("pt-BR")} (${rows.length})`} description="O formulário conserva a composição e as participações completas em estado. A operação valida e envia todas as linhas, inclusive fora da página aberta.">
    <TaxOperationalTable id={id} actions={actions}
      columns={[["name", "Pessoa / contribuinte", 140, 450], ...(roles ? [["role", "Tipo / função", 90, 220] as const] : []), ["share", "Participação (%)", 100, 180, "text", "right"], ...(roles ? [["debt", "Tipo sujeito à validação de débitos", 80, 180] as const] : [])]}
      rows={rows.map((row, index) => ({ id: String(index), label: taxpayers.find(item => item.id === row.taxpayerId)?.label || `Pessoa ${index + 1}`, values: { name: taxpayers.find(item => item.id === row.taxpayerId)?.label ?? row.taxpayerId, role: row.role ?? "", share: row.sharePercent, debt: row.validateDebt ? "Sim" : "Não" }, cells: {
        name: <select aria-label={`Pessoa ${index + 1} — ${title}`} value={row.taxpayerId} onChange={event => onChange(index, { taxpayerId: event.target.value })} className={taxDraftInput}><option value="">Selecione</option>{taxpayers.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>,
        role: <input aria-label={`Tipo / função da pessoa ${index + 1}`} value={row.role ?? ""} onChange={event => onChange(index, { role: event.target.value })} className={taxDraftInput} />,
        share: <input aria-label={`Participação da pessoa ${index + 1}`} type="number" min="0.000001" max="100" step="0.000001" value={row.sharePercent} onChange={event => onChange(index, { sharePercent: event.target.value })} className={taxDraftInput} />,
        debt: <input aria-label={`Validar débitos do tipo da pessoa ${index + 1}`} type="checkbox" checked={row.validateDebt ?? false} onChange={event => onChange(index, { validateDebt: event.target.checked })} />,
      } }))} />
  </OperationalTablePanel>;
}
