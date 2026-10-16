import { z } from "zod";

export const calendarEventTypes = ["Feriado Nacional", "Feriado Estadual", "Feriado Municipal", "Ponto Facultativo", "Expediente Especial", "Outro"] as const;

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1, "Informe o título do evento."),
  description: z.string().trim(),
  date: z.date(),
  type: z.enum(calendarEventTypes, { error: "Selecione um tipo de evento válido." }),
  isHoliday: z.boolean(),
});

export function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Informe uma data válida.");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Informe uma data válida.");
  return date;
}
