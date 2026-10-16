"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { calendarEventTypes } from "@/lib/administration/calendar-event";
import { createCalendarEvent } from "../actions";

export default function NovoEventoForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputClass = "w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-sm";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const result = await createCalendarEvent(formData);
      if (result.error) setError(result.error);
      else router.push("/administracao/calendario");
    } catch {
      setError("Não foi possível confirmar o salvamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return <PageFrame className="max-w-3xl space-y-2">
    <PageHeader title="Novo evento institucional" action={<Link href="/administracao/calendario" className="text-xs font-semibold text-blue-700">Voltar</Link>} />
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-300 bg-white p-3">
      <p className="text-xs text-slate-600">Registre feriados, pontos facultativos e alterações de expediente. Os feriados também são consultados pela agenda da Saúde.</p>
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <label className="grid gap-1 text-xs font-semibold">Título *<input name="title" required className={inputClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">Data *<input name="date" type="date" required className={inputClass} /></label>
        <label className="grid gap-1 text-xs font-semibold">Tipo *<select name="type" defaultValue="Feriado Municipal" className={inputClass}>{calendarEventTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
      </div>
      <label className="grid gap-1 text-xs font-semibold">Descrição<textarea name="description" rows={3} className={inputClass} /></label>
      <label className="flex items-center gap-2 text-sm"><input name="isHoliday" type="checkbox" />É feriado (considerado pela agenda da Saúde)</label>
      <div className="flex justify-end"><button disabled={loading} className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{loading ? "Salvando..." : "Salvar evento"}</button></div>
    </form>
  </PageFrame>;
}
