"use client";

import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../TaxOperationalTable";
import { TaxDraftText, taxDraftInput } from "../TaxDraftControls";

type Rule = { cnae: string; treatment: "PERMITIDA" | "PERMISSIVEL" | "PROIBIDA"; condition: string };
export default function ZoningActivitiesInput({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const update = (index: number, patch: Partial<Rule>) => onChange(rules.map((row, position) => position === index ? { ...row, ...patch } : row));
  const add = () => onChange([...rules, { cnae: "", treatment: "PERMITIDA", condition: "" }]);
  return <fieldset className="space-y-2 rounded border p-2"><legend className="text-xs font-semibold">Atividades do zoneamento</legend><p className="text-xs">Para catálogos do tipo ZONEAMENTO. Informe CNAEs ativos no cadastro de atividades da mesma origem. A publicação conserva a referência e versão da atividade.</p>
    <OperationalTablePanel title="Atividades do zoneamento" triggerLabel={`Editar atividades (${rules.length})`} description="O catálogo conserva todas as regras e valida CNAEs e tratamentos do conjunto completo ao publicar.">
      <TaxOperationalTable id="zoneamento-atividades-rascunho"
        actions={<button type="button" disabled={rules.length >= 200} onClick={add} className="h-7 rounded border px-2 text-[13px]">Adicionar atividade</button>}
        columns={[["cnae", "CNAE", 90, 160, "identifier"], ["treatment", "Tratamento urbanístico", 100, 230], ["condition", "Condição / observação", 120, 550], ["actions", "Remover", 72, 72, "actions"]]}
        rows={rules.map((row, index) => ({ id: String(index), label: row.cnae || `Atividade ${index + 1}`, values: { cnae: row.cnae, treatment: row.treatment, condition: row.condition }, cells: {
          cnae: <input aria-label={`CNAE da atividade ${index + 1}`} value={row.cnae} pattern="[0-9]{7}" maxLength={7} onChange={event => update(index, { cnae: event.target.value })} className={taxDraftInput} />,
          treatment: <select aria-label={`Tratamento da atividade ${index + 1}`} value={row.treatment} onChange={event => update(index, { treatment: event.target.value as Rule["treatment"] })} className={taxDraftInput}><option value="PERMITIDA">Permitida</option><option value="PERMISSIVEL">Permissível</option><option value="PROIBIDA">Proibida</option></select>,
          condition: <TaxDraftText label={`Condição da atividade ${index + 1}`} value={row.condition} maxLength={2000} onChange={value => update(index, { condition: value })} />,
        }, actions: <button type="button" onClick={() => onChange(rules.filter((_, position) => position !== index))} aria-label={`Remover atividade ${index + 1}`} className="h-6 rounded border px-1 text-[13px]">Remover</button> }))} />
    </OperationalTablePanel>
    <button type="button" disabled={rules.length >= 200} onClick={add} className="rounded border p-2 text-xs">Adicionar atividade</button>
  </fieldset>;
}
