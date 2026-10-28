import { z } from "zod";

const date = z.union([z.literal(""), z.iso.date()]).default("");
export const cemeteryQuerySchema = z.object({
  cemeteryId: z.string().max(100).optional(),
  q: z.string().trim().max(120).default(""), cemetery: z.string().max(100).default(""), funeralHome: z.string().max(100).default(""), cause: z.string().max(100).default(""), deceased: z.string().max(100).default(""),
  status: z.enum(["", "AGENDADO", "EM_REALIZACAO", "SEPULTADO", "CREMADO", "DESAPROPRIADO", "EXUMADO", "TRANSFERIDO", "CANCELADO", "ENCERRADO"]).default(""),
  type: z.enum(["", "SEPULTAMENTO", "VELORIO", "CREMACAO"]).default(""),
  deathStart: date, deathEnd: date, start: date, end: date,
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).superRefine((v, ctx) => {
  for (const [start, end] of [[v.start, v.end], [v.deathStart, v.deathEnd]]) if (start && end && start > end) ctx.addIssue({ code: "custom", message: "Data inicial posterior à final." });
}).transform(({ cemeteryId, ...query }) => ({ ...query, cemetery: query.cemetery || cemeteryId || "" }));
export type CemeteryQuery = z.infer<typeof cemeteryQuerySchema>;
export type CemeterySearchParams = Record<string, string | string[] | undefined>;

export function cemeteryEventDayStart(day: string) {
  let instant = new Date(`${day}T00:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const offset = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" }).formatToParts(instant).find(p => p.type === "timeZoneName")!.value.replace("GMT", "") || "+00:00";
    instant = new Date(`${day}T00:00:00${offset}`);
  }
  return instant;
}
export function cemeteryQueryHref(pathname: string, query: CemeteryQuery, page: number) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key !== "page" && value) values.set(key, String(value));
  values.set("page", String(page));
  return `${pathname}?${values}`;
}
