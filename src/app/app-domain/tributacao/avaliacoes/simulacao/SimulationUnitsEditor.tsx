"use client";

import { useEffect, useRef, useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../../TaxOperationalTable";
import { taxDraftInput } from "../../TaxDraftControls";
import { invalidSimulationArea, simulationUnitEntries, type SimulationUnitDraft } from "./simulation-unit-draft";

export default function SimulationUnitsEditor({ units, initialSelected }: { units: SimulationUnitDraft[]; initialSelected: string[] }) {
  const [selected, setSelected] = useState(() => initialSelected.filter(id => units.some(unit => unit.id === id)));
  const [areas, setAreas] = useState<Record<string, string>>(() => Object.fromEntries(units.map(unit => [unit.id, unit.area])));
  const [invalidInputs, setInvalidInputs] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = host.current?.closest("form");
    if (!form) return;
    const validate = (event: Event) => {
      const invalid = invalidSimulationArea(units, areas) ?? units.find(unit => invalidInputs[unit.id]);
      if (invalid) { event.preventDefault(); setNotice(`Corrija a construção simulada de ${invalid.inscription}: informe área não negativa, com até seis casas decimais, ou deixe vazio para usar o cadastro.`); }
      else setNotice("");
    };
    form.addEventListener("submit", validate);
    return () => form.removeEventListener("submit", validate);
  }, [units, areas, invalidInputs]);
  return <div ref={host}>
    {simulationUnitEntries(units, selected, areas).map(([name, value], index) => <input key={`${name}:${index}`} type="hidden" name={name} value={value} />)}
    {notice && <p role="alert" className="text-sm text-red-700">{notice}</p>}
    <OperationalTablePanel title="Unidades para simulação em conjunto" triggerLabel={`Selecionar unidades (${selected.length} de ${units.length})`} description="Seleção e áreas de todas as unidades permanecem no formulário, mesmo ao paginar ou fechar. A submissão inclui o conjunto completo.">
      <TaxOperationalTable id="simulacao-unidades-rascunho"
        columns={[["selected", "Simular", 64, 80], ["inscription", "Inscrição", 100, 300, "identifier"], ["mode", "Modalidade", 80, 200], ["area", "Construção simulada (m²)", 120, 300, "text", "right"]]}
        rows={units.map(unit => ({ id: unit.id, label: unit.inscription, values: { selected: selected.includes(unit.id) ? "Sim" : "Não", inscription: unit.inscription, mode: unit.mode, area: areas[unit.id] || "Usar cadastro" }, cells: {
          selected: <input type="checkbox" aria-label={`Simular unidade ${unit.inscription}`} checked={selected.includes(unit.id)} onChange={event => setSelected(current => event.target.checked ? [...current, unit.id] : current.filter(id => id !== unit.id))} />,
          area: <input type="number" min="0" step="0.000001" aria-label={`Construção simulada de ${unit.inscription}, vazio usa cadastro`} value={areas[unit.id] ?? ""} onChange={event => { const value = event.target.value; const invalid = !event.target.validity.valid; setAreas(current => ({ ...current, [unit.id]: value })); setInvalidInputs(current => ({ ...current, [unit.id]: invalid })); }} className={taxDraftInput} />,
        } }))} />
    </OperationalTablePanel>
  </div>;
}
