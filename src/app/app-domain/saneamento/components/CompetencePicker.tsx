"use client";

import { useId, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { consumerUnitPeriod } from "@/lib/saneamento/unit-identifier";

export function CompetencePicker() {
  const id = useId();
  const period = consumerUnitPeriod(new Date());
  const currentYear = Number(period.slice(0, 4));
  const [selected, setSelected] = useState<string | null>(`${period.slice(4)}/${currentYear}`);
  const competences = Array.from({ length: (currentYear + 10 - 2024 + 1) * 12 }, (_, index) => `${String(index % 12 + 1).padStart(2, "0")}/${2024 + Math.floor(index / 12)}`);

  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium">Competência (mês/ano)</label>
    <Combobox.Root items={competences} name="competence" required value={selected} onValueChange={setSelected}
      onInputValueChange={(_, details) => { if (details.reason === "input-change") setSelected(null); }}>
      <Combobox.Input id={id} placeholder="Buscar mês/ano (MM/AAAA)" className="w-full rounded-md border p-2 text-sm" />
      <Combobox.Portal>
        <Combobox.Positioner className="z-[70]" sideOffset={4}>
          <Combobox.Popup className="max-h-56 w-[var(--anchor-width)] overflow-y-auto rounded-md border bg-white p-1 text-sm shadow-lg dark:bg-gray-900">
            <Combobox.Empty className="p-2 text-xs text-gray-500">Nenhuma competência encontrada.</Combobox.Empty>
            <Combobox.List>{(competence: string) => <Combobox.Item key={competence} value={competence} className="cursor-pointer rounded p-2 outline-none data-highlighted:bg-sky-100 dark:data-highlighted:bg-sky-900">{competence}</Combobox.Item>}</Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  </div>;
}
