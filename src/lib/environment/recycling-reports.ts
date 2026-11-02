import { z } from "zod";
import { Decimal } from "@/db/decimal";
import { recyclingEntrySchema } from "./recycling-catalog";
import { recyclingToday } from "./recycling-stock";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export class RecyclingReportError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
export const recyclingReportViews = { general: "Estoque geral", depots: "Analítico por depósito", sales: "Vendas por tipo de material", monthly: "Histórico mensal de vendas" } as const;
const optionalCode = z.union([z.literal(""), recyclingEntrySchema.shape.code]).default("");
const schema = z.object({
  view: z.enum(["general", "depots", "sales", "monthly"]).default("general"),
  from: z.string().default(""), to: z.string().default(""),
  typeCode: optionalCode, materialCode: optionalCode, depotCode: optionalCode,
  order: z.enum(["code", "description"]).default("code"),
});
export type RecyclingReportFilters = z.infer<typeof schema>;
export function parseRecyclingReportFilters(raw: Record<string, string | undefined>, now = new Date()): RecyclingReportFilters {
  const filters = schema.parse(raw);
  filters.to ||= recyclingToday(now);
  filters.from ||= `${filters.to.slice(0, 4)}-01-01`;
  for (const value of [filters.from, filters.to]) {
    const date = new Date(`${value}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === "0000" || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new RecyclingReportError("Informe datas válidas para o relatório.");
  }
  if (filters.from > filters.to) throw new RecyclingReportError("O período inicial deve ser anterior ou igual ao final.");
  return filters;
}
export function recyclingReportPage(value: string | undefined, total: number) {
  const page = value && /^\d{1,6}$/.test(value) ? Number(value) : 1;
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
}
export function recyclingReportMonthCount(filters: RecyclingReportFilters) {
  return (Number(filters.to.slice(0, 4)) - Number(filters.from.slice(0, 4))) * 12 + Number(filters.to.slice(5, 7)) - Number(filters.from.slice(5, 7)) + 1;
}
export type RecyclingReportRow = { id: string; code: string; name: string; type: string; unit: string; depot: string; depotCode: string; opening: string; incoming: string; outgoing: string; balance: string; revenue: string; movements: string };
export type RecyclingReportData = { filters: RecyclingReportFilters; rows: RecyclingReportRow[]; page: number; total: number; revenue: string; maximum: string };
export const reportDecimal = (value: string) => value.replace(".", ",");
const GeometryDecimal = Decimal.clone({ precision: 80 });
/** Conversion is only to a bounded drawing percentage; financial values stay strings. */
export function recyclingChartPercent(value: string, maximum: string) {
  const max = new GeometryDecimal(maximum);
  return max.isFinite() && max.gt(0) ? new GeometryDecimal(value).div(max).mul(100).clamp(0, 100).toFixed(4) : "0";
}
