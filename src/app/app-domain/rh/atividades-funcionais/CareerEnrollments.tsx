"use client";

import { useState } from "react";
import { CourseCompletionForm } from "./ActivityForms";
import { RhTablePanel } from "../_components/RhTablePanel";
import { rhColumn } from "../_components/operational-columns";

const columns = [rhColumn("employee", "Servidor", 280, 140), rhColumn("course", "Curso", 280, 140), rhColumn("endsAt", "Encerramento", 150, 100), rhColumn("actions", "Conclusão", 110, 100, "actions")];

export function CareerEnrollments({ items, initialPage }: { items: { id: string; employee: string; course: string; endsAt: string }[]; initialPage: number }) {
  const [selected, setSelected] = useState(items[0]?.id || "");
  return <section className="space-y-3">
    <RhTablePanel title="Inscrições aguardando reconhecimento de conclusão" triggerLabel="Consultar inscrições em tela cheia" description="Selecione a inscrição e feche a consulta para reconhecer a conclusão. Os formulários permanecem montados e preservam os campos preenchidos." columns={columns} preferenceId="rh-inscricoes" initialPage={initialPage}
      rows={items.map(item => ({ id: item.id, label: item.employee, values: { employee: item.employee, course: item.course, endsAt: item.endsAt }, actions: <button type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>Selecionar</button> }))} emptyMessage="Nenhuma inscrição aguardando reconhecimento no seu escopo." />
    {items.map(item => <section key={item.id} hidden={selected !== item.id} className="rounded border bg-white p-3"><h3 className="font-semibold">{item.employee} · {item.course}</h3><p>Encerramento: {item.endsAt}</p><CourseCompletionForm requestId={item.id} /></section>)}
    {!items.length && <p>Nenhuma inscrição aguardando reconhecimento no seu escopo.</p>}
  </section>;
}
