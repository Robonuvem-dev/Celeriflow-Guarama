import { z } from "zod";
import Decimal from "decimal.js";

export const transparencySources = ["API_IBEMA", "NATIVO", "EXEMPLO", "DOCUMENTOS"] as const;
export const transparencyEntities = ["prefeitura", "camara", "consolidado"] as const;
export type PublicCell = string | number | boolean | null;
export type PublicRecord = { key: string; entity: "prefeitura" | "camara"; year: number; values: Record<string, PublicCell>; excludedFromTotals?:string[]; periodIndependent?:boolean; events?: { stage: string; number: string; date: string; value: string; status: string }[]; items?: { description: string; quantity: string; unitPrice: string; total: string }[]; links?: { title: string; url: string }[] };
export type PublicColumn = { key: string; label: string; kind?: "money" | "date" | "number" };
export type PublicFilter = { key: string; label: string; kind: "text" | "date" | "number" | "select"; options?: string[] };
export type PublicCollection = { slug: string; title: string; group: string; description: string; columns: PublicColumn[]; filters: PublicFilter[]; amountFields: string[]; apiPath?: string; periodField?: string };
export type PublicDataset = { records: PublicRecord[]; source: typeof transparencySources[number]; status: "AVAILABLE" | "UNAVAILABLE" | "NOT_ADOPTED"; updatedAt: string | null; provenance: string; message?: string; declarationLinks?:{title:string;url:string}[]; complete: boolean };

export const transparencyQuerySchema = z.object({ entity: z.enum(transparencyEntities).default("prefeitura"), source: z.enum(transparencySources).default("API_IBEMA"), year: z.coerce.number().int().min(1900).max(2200).default(2026), search: z.string().trim().max(200).default(""), from: z.iso.date().optional(), until: z.iso.date().optional(), page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), sort: z.string().max(80).default(""), direction: z.enum(["asc", "desc"]).default("asc"), filters: z.record(z.string(), z.string().max(250)).default({}) }).strict().refine(value => !value.from || !value.until || value.until >= value.from, "Período fora de ordem.");
export type TransparencyQuery = z.infer<typeof transparencyQuerySchema>;
export function parseTransparencyQuery(params: URLSearchParams): TransparencyQuery {
  const value: Record<string, unknown> = {};
  for (const key of ["entity", "source", "year", "search", "from", "until", "page", "pageSize", "sort", "direction"]) { const item = params.get(key); if (item) value[key] = item; }
  value.filters = Object.fromEntries([...params].filter(([key, item]) => key.startsWith("f.") && item !== "").map(([key, item]) => [key.slice(2), item]));
  return transparencyQuerySchema.parse(value);
}
const numeric = (value: PublicCell | undefined) => new Decimal(value === null || value === undefined || value === "" ? "0" : String(value));
const text = (value: PublicCell | undefined) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function filterPublicDataset(collection: PublicCollection, dataset: PublicDataset, query: TransparencyQuery) {
  const permitted = new Set(collection.filters.map(filter => filter.key));
  if (Object.keys(query.filters).some(key => !permitted.has(key))) throw new Error("Filtro não reconhecido nesta consulta.");
  if (query.sort && !collection.columns.some(column => column.key === query.sort)) throw new Error("Ordenação não reconhecida nesta consulta.");
  const rows = dataset.records.filter(record => {
    if (record.year !== query.year || query.entity !== "consolidado" && record.entity !== query.entity) return false;
    const recordDate = String(record.values[collection.periodField || "date"] ?? "").slice(0, 10);
    if (!record.periodIndependent&&((query.from || query.until) && !recordDate)) return false;
    if (!record.periodIndependent&&(query.from && recordDate < query.from || query.until && recordDate > query.until)) return false;
    if (query.search && !Object.values(record.values).some(value => text(value).includes(text(query.search)))) return false;
    return Object.entries(query.filters).every(([key, expected]) => {
      if (key === "minimum" || key === "maximum") { const value = record.values.value ?? record.values.committed; if (value === null || value === undefined) return false; const normalized=expected.includes(",")?expected.replace(/\./g,"").replace(",","."):expected; if(!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor numérico válido."); const limit = numeric(normalized); return key === "minimum" ? numeric(value).gte(limit) : numeric(value).lte(limit); }
      const definition = collection.filters.find(filter => filter.key === key)!;
      return definition.kind === "select" ? text(record.values[key]) === text(expected) : text(record.values[key]).includes(text(expected));
    });
  });
  const column = collection.columns.find(column => column.key === query.sort) || collection.columns[0];
  rows.sort((a, b) => { const left = a.values[column.key], right = b.values[column.key]; const order = column.kind === "money" || column.kind === "number" ? numeric(left).comparedTo(numeric(right)) : String(left ?? "").localeCompare(String(right ?? ""), "pt-BR", { numeric: true }); return (query.direction === "desc" ? -order : order) || a.key.localeCompare(b.key); });
   const totals = Object.fromEntries(collection.amountFields.map(field => {const eligible=rows.filter(row=>!row.excludedFromTotals?.includes(field));return [field,dataset.status!=="AVAILABLE"||rows.length>0&&eligible.length===0||eligible.some(row=>row.values[field]===null||row.values[field]===undefined||row.values[field]==="")?null:eligible.reduce((sum,row)=>sum.add(numeric(row.values[field])),new Decimal(0)).toFixed(2)];}));
  const total = rows.length, page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
  return { ...dataset, rows, records: rows.slice((page - 1) * query.pageSize, page * query.pageSize), totals, total, page, pageSize: query.pageSize };
}
export function publicQueryHref(query: TransparencyQuery, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams({ entity: query.entity, source: query.source, year: String(query.year), pageSize: String(query.pageSize), sort: query.sort, direction: query.direction });
  if (query.search) params.set("search", query.search); if (query.from) params.set("from", query.from); if (query.until) params.set("until", query.until);
  Object.entries(query.filters).forEach(([key, value]) => { if (value) params.set(`f.${key}`, value); });
  Object.entries(extra).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
  return params.toString();
}
