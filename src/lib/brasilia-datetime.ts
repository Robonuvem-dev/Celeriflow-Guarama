import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Formata data no padrão brasileiro (dd/MM/yyyy) considerando o fuso de Brasília.
 */
export function formatBrasiliaDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Formata data e hora no padrão brasileiro (dd/MM/yyyy HH:mm) no fuso de Brasília.
 */
export function formatBrasiliaDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Converte string 'YYYY-MM-DD' para objeto Date fixado no fuso de Brasília (-03:00).
 */
export function parseBrasiliaDate(dateStr: string, isEndOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const time = isEndOfDay ? "23:59:59.999" : "00:00:00.000";
  const d = new Date(`${dateStr}T${time}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
