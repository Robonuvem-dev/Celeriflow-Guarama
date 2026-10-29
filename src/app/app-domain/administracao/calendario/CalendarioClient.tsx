"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { updateCalendarEvent, deleteCalendarEvent } from "../actions";
import { RegistryList, registryColumns } from "../../cadastros/operational-registry";

type CalendarEvent = { id: string; title: string; description: string | null; date: Date; isHoliday: boolean; type: string };
const columns = registryColumns([["date", "Data", 210, 100], ["title", "Evento", 230, 110, "identifier"], ["description", "Descrição", 230, 100], ["type", "Tipo", 170, 70], ["holiday", "Feriado", 85, 70, "status"], ["actions", "Ações", 64, 64, "actions"]]);

export default function CalendarioClient({ events }: { events: CalendarEvent[] }) {
  return <RegistryList records={events} columns={columns} preferenceId="administracao-calendario" label={record => record.title}
    searchValues={record => [record.title, record.description, record.type]}
    values={record => ({ date: format(new Date(record.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }), title: record.title, description: record.description || "—", type: record.type, holiday: record.isHoliday ? "Sim" : "Não" })}
    editValues={record => ({ title: record.title, description: record.description || "", date: new Date(record.date).toISOString().split("T")[0], type: record.type, isHoliday: record.isHoliday })}
    fields={[{ key: "title", label: "Título" }, { key: "description", label: "Descrição" }, { key: "date", label: "Data", type: "date" }, { key: "type", label: "Tipo", type: "select", options: ["Feriado Nacional", "Feriado Estadual", "Feriado Municipal", "Ponto Facultativo", "Expediente Especial", "Outro"].map(value => ({ value, label: value })) }, { key: "isHoliday", label: "Feriado", type: "checkbox" }]}
    onSave={(record, values) => updateCalendarEvent(record.id, { title: String(values.title), description: String(values.description), date: new Date(`${values.date}T12:00:00Z`), type: String(values.type), isHoliday: !!values.isHoliday })}
    statusAction={record => ({ label: "Excluir", confirm: "Tem certeza que deseja excluir este evento permanentemente?", run: () => deleteCalendarEvent(record.id) })} />;
}
