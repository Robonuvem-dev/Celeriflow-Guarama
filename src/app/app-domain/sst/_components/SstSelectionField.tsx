"use client";

import { useState } from "react";
import { SstSelectionTable } from "./SstSelectionTable";
import { sstColumn } from "./operational-columns";

/** Complete repeated-name form payload; checkboxes may unmount with the panel. */
export function SstSelectionField({ title, name, options, initialSelected = [], preferenceId }: { title: string; name: string; options: { id: string; name: string; code?: string }[]; initialSelected?: string[]; preferenceId: string }) {
  const [selected, setSelected] = useState(initialSelected);
  return <SstSelectionTable title={title} preferenceId={preferenceId} selected={selected} onSelectionAction={setSelected} name={name}
    columns={[sstColumn("code", "Código / ID", 200, 100, "identifier"), sstColumn("name", "Nome", 400, 180)]}
    items={options.map(option => ({ id: option.id, label: option.name, values: { code: option.code || option.id, name: option.name } }))} />;
}
