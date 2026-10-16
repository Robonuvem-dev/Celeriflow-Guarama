"use client";

type Rule = { cnae: string; treatment: "PERMITIDA" | "PERMISSIVEL" | "PROIBIDA"; condition: string };
export default function ZoningActivitiesInput({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const field = "mt-1 w-full rounded border p-2 text-xs";
  const update = (index: number, patch: Partial<Rule>) => onChange(rules.map((row, position) => position === index ? { ...row, ...patch } : row));
  return <fieldset className="space-y-2 rounded border p-2"><legend className="text-xs font-semibold">Atividades do zoneamento</legend><p className="text-xs">Para catálogos do tipo ZONEAMENTO. Informe CNAEs ativos no cadastro de atividades da mesma origem. A publicação conserva a referência e versão da atividade.</p>
    {rules.map((row, index) => <div key={index} className="grid gap-2 rounded border p-2 sm:grid-cols-2">
      <label className="text-xs">CNAE<input value={row.cnae} required pattern="[0-9]{7}" maxLength={7} onChange={event => update(index, { cnae: event.target.value })} className={field}/></label>
      <label className="text-xs">Tratamento urbanístico<select value={row.treatment} onChange={event => update(index, { treatment: event.target.value as Rule["treatment"] })} className={field}><option value="PERMITIDA">Permitida</option><option value="PERMISSIVEL">Permissível</option><option value="PROIBIDA">Proibida</option></select></label>
      <label className="text-xs sm:col-span-2">Condição / observação<textarea value={row.condition} maxLength={2000} onChange={event => update(index, { condition: event.target.value })} className={field}/></label>
      <button type="button" onClick={() => onChange(rules.filter((_, position) => position !== index))} className="text-left text-xs text-red-700">Remover atividade</button>
    </div>)}<button type="button" disabled={rules.length >= 200} onClick={() => onChange([...rules, { cnae: "", treatment: "PERMITIDA", condition: "" }])} className="rounded border p-2 text-xs">Adicionar atividade</button>
  </fieldset>;
}
