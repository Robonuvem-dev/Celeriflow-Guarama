"use client";

import { useState } from "react";
import { SstSelectionTable } from "../_components/SstSelectionTable";
import { sstColumn } from "../_components/operational-columns";

export function MeetingPresence({ participants }: { participants: { employeeId: string; name: string }[] }) {
  const [present, setPresent] = useState<string[]>([]);
  return <section>{participants.map(item => <input key={item.employeeId} type="hidden" name="participant" value={item.employeeId} />)}{present.map(id => <input key={id} type="hidden" name={`present.${id}`} value="on" />)}
    <SstSelectionTable title="Presenças da reunião" preferenceId="sst-reuniao-presencas-edicao" selected={present} onSelectionAction={setPresent} columns={[sstColumn("name", "Participante", 400, 180), sstColumn("id", "ID servidor", 240, 120, "identifier")]} items={participants.map(item => ({ id: item.employeeId, label: item.name, values: { name: item.name, id: item.employeeId } }))} />
  </section>;
}
