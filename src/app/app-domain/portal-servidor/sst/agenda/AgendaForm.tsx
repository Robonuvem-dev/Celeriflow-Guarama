"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { bookMyMedicalAppointment, cancelMyMedicalAppointment } from "./actions";

export function OwnAgendaForm({ windows }: { windows: { id: string; unitName: string; professionalName: string; slots: { startsAt: string; endsAt: string }[] }[] }) {
  const router = useRouter(); const [windowId, setWindowId] = useState(windows[0]?.id || ""), [pending, setPending] = useState(false), [error, setError] = useState("");
  const window = windows.find(item => item.id === windowId);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try {
      const result = await bookMyMedicalAppointment({ availabilityId: windowId, startsAt: String(data.get("startsAt")), purpose: String(data.get("purpose")) });
      if (result.error) setError(result.error); else router.refresh();
    } catch { setError("Não foi possível agendar. Confira se o horário continua disponível."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="grid gap-2 rounded border border-slate-300 bg-white p-4 text-xs"><label htmlFor="own-medical-window" className="font-semibold">Unidade e profissional</label><select id="own-medical-window" value={windowId} onChange={event => setWindowId(event.target.value)} disabled={pending} className="h-8 rounded border px-2">{windows.map(item => <option key={item.id} value={item.id}>{item.unitName} · {item.professionalName}</option>)}</select><label htmlFor="own-medical-slot">Data e horário disponíveis</label><select key={windowId} id="own-medical-slot" name="startsAt" required disabled={pending} className="h-8 rounded border px-2"><option value="">Selecione</option>{window?.slots.map(slot => <option key={slot.startsAt} value={slot.startsAt}>{new Date(slot.startsAt).toLocaleString("pt-BR")}</option>)}</select><label htmlFor="own-medical-purpose">Finalidade</label><select id="own-medical-purpose" name="purpose" disabled={pending} className="h-8 rounded border px-2"><option value="CONSULTA">Consulta</option><option value="EXAME">Exame</option><option value="PERICIA">Perícia</option></select>{error && <p role="alert" className="text-red-700">{error}</p>}<Button disabled={pending || !window?.slots.length} className="w-fit">{pending ? "Agendando…" : "Confirmar agendamento"}</Button></form>;
}

export function OwnAppointmentCancellation({ id }: { id: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try { const result = await cancelMyMedicalAppointment({ id, reason: String(data.get("reason") || "") }); if (result.error) setError(result.error); else router.refresh(); }
    catch { setError("Não foi possível cancelar o atendimento."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mt-2 flex flex-wrap gap-2"><input name="reason" aria-label="Motivo do cancelamento" required minLength={5} maxLength={500} disabled={pending} className="h-8 rounded border px-2 text-xs" placeholder="Motivo do cancelamento" /><Button disabled={pending} variant="outline" size="sm">Cancelar</Button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</form>;
}
