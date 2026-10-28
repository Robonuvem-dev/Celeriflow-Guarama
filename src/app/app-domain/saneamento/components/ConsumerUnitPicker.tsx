"use client";

import { useEffect, useId, useState } from "react";
import { searchConsumerUnits } from "../unit-options";
import { Combobox } from "@base-ui/react/combobox";

export function ConsumerUnitPicker({ required = false, activeOnly = false }: { required?: boolean; activeOnly?: boolean }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [units, setUnits] = useState<{ id: string; code: string; address: string }[]>([]);
  const [selected, setSelected] = useState<{ id: string; code: string; address: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await searchConsumerUnits(search, activeOnly);
        if (!cancelled) { setUnits(result.units); setError(result.error ?? ""); }
      } catch {
        if (!cancelled) setError("Não foi possível buscar as unidades consumidoras.");
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, activeOnly]);

  const options = selected && !units.some((unit) => unit.id === selected.id) ? [selected, ...units] : units;
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium">Unidade consumidora{required ? "" : " (opcional)"}</label>
    <Combobox.Root items={options} filter={null} name="unitId" required={required} value={selected} onValueChange={setSelected}
      inputValue={search} onInputValueChange={(value, details) => { setSearch(value); if (details.reason === "input-change") setSelected(null); }}
      itemToStringLabel={(unit) => unit.code} itemToStringValue={(unit) => unit.id} isItemEqualToValue={(unit, value) => unit.id === value.id}>
      <Combobox.Input id={id} placeholder="Buscar identificador, titular ou rua..." className="w-full rounded-md border p-2 text-sm" />
      <Combobox.Portal>
        <Combobox.Positioner className="z-[70]" sideOffset={4}>
          <Combobox.Popup className="max-h-56 w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border bg-white p-1 text-xs shadow-lg dark:bg-gray-900">
            <Combobox.Empty className="p-2 text-gray-500">Nenhuma unidade encontrada.</Combobox.Empty>
            <Combobox.List>{(unit: { id: string; code: string; address: string }) => <Combobox.Item key={unit.id} value={unit} title={unit.address} className="cursor-pointer rounded p-2 outline-none data-highlighted:bg-sky-100 dark:data-highlighted:bg-sky-900">
              <strong>{unit.code}</strong><span className="block truncate text-gray-500">{unit.address}</span>
            </Combobox.Item>}</Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>;
}
