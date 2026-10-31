import { z } from "zod";

export const displayMetrics = {
  employees: "Servidores ativos", secretariats: "Secretarias ativas", departments: "Departamentos ativos", units: "Unidades ativas",
  demands: "Demandas no período", openDemands: "Demandas abertas", resolvedDemands: "Demandas resolvidas", cancelledDemands: "Demandas canceladas", overdueDemands: "Demandas vencidas",
} as const;
export type DisplayMetric = keyof typeof displayMetrics;
export const metricKeys = Object.keys(displayMetrics) as DisplayMetric[];
const text = (max: number) => z.string().trim().max(max);
const timestamp = z.union([z.literal(""), z.iso.datetime()]);

export const displaySlideSchema = z.object({
  id: z.string().uuid(), title: text(90).min(1), subtitle: text(160),
  kind: z.enum(["dashboard", "indicators", "image", "mixed"]), duration: z.number().int().min(10).max(120),
  metrics: z.array(z.enum(metricKeys as [DisplayMetric, ...DisplayMetric[]])).max(6),
  chart: z.enum(["none", "demands", "employees", "timeline"]),
  period: z.enum(["year", "month", "all"]), secretariatId: text(100),
  imageId: text(100), imageFit: z.enum(["contain", "cover"]),
  caption: text(240), source: text(120), startsAt: timestamp, endsAt: timestamp,
}).strict().superRefine((value, ctx) => {
  if (value.kind === "image" || value.kind === "mixed") {
    if (!value.imageId) ctx.addIssue({ code: "custom", message: "Selecione uma imagem para esta página.", path: ["imageId"] });
  }
  if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) ctx.addIssue({ code: "custom", message: "O fim da vigência deve ser posterior ao início.", path: ["endsAt"] });
  if (new Set(value.metrics).size !== value.metrics.length) ctx.addIssue({ code: "custom", message: "Não repita indicadores na página.", path: ["metrics"] });
  if (value.kind !== "image" && !value.metrics.length && value.chart === "none") ctx.addIssue({ code: "custom", message: "Selecione indicadores ou um gráfico.", path: ["metrics"] });
});
export const displayConfigSchema = z.object({
  schemaVersion: z.literal(1), title: text(90).min(1), municipalityLabel: text(100), footer: text(200),
  refreshSeconds: z.number().int().min(60).max(3600),
  slides: z.array(displaySlideSchema).min(1).max(40),
}).strict().superRefine((config, ctx) => {
  if (new Set(config.slides.map(slide => slide.id)).size !== config.slides.length) ctx.addIssue({ code: "custom", message: "As páginas devem ter identificadores diferentes.", path: ["slides"] });
});
export type DisplaySlide = z.infer<typeof displaySlideSchema>;
export type DisplayConfig = z.infer<typeof displayConfigSchema>;
export type DisplayDataset = {
  metrics: Partial<Record<DisplayMetric, number>>;
  chart: { name: string; value: number }[];
  chartMax?: number;
  periodLabel: string;
};
export type PublicDisplaySlide = Pick<DisplaySlide, "id" | "title" | "subtitle" | "kind" | "duration" | "caption" | "source" | "imageFit" | "startsAt" | "endsAt" | "chart"> & {
  imageUrl: string | null; metricOrder: DisplayMetric[]; dataset: DisplayDataset | null; capturedAt: string | null;
};
export type PublicDisplay = {
  status: "published" | "empty"; version: string | null; title: string;
  municipality: { name: string; logoUrl: string | null }; footer: string;
  refreshSeconds: number; validatedAt: string; validUntil: string; slides: PublicDisplaySlide[];
};
export type DisplayEditorState = {
  revision: number; config: DisplayConfig; publishedVersionId: string | null;
  versions: { id: string; number: number; createdAt: string; title: string }[];
  secretariats: { id: string; name: string }[];
  assets: { id: string; url: string; name: string }[];
};

export function newDisplaySlide(id: string): DisplaySlide {
  return { id, title: "Visão geral", subtitle: "", kind: "dashboard", duration: 20, metrics: ["employees", "secretariats", "openDemands", "resolvedDemands"], chart: "demands", period: "year", secretariatId: "", imageId: "", imageFit: "contain", caption: "", source: "Sistema municipal · Administração", startsAt: "", endsAt: "" };
}
export function defaultDisplayConfig(id: string): DisplayConfig {
  return { schemaVersion: 1, title: "Gestão municipal em números", municipalityLabel: "", footer: "Informações da administração municipal", refreshSeconds: 300, slides: [newDisplaySlide(id)] };
}
export function displaySlideIsActive(slide: Pick<DisplaySlide, "startsAt" | "endsAt">, now: number) {
  return (!slide.startsAt || Date.parse(slide.startsAt) <= now) && (!slide.endsAt || now < Date.parse(slide.endsAt));
}
export function displayPeriod(period: DisplaySlide["period"], now: Date) {
  // Calendar boundaries use the municipal Brazilian time zone, independent of the server's TZ.
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(local.find(item => item.type === "year")!.value);
  const month = Number(local.find(item => item.type === "month")!.value);
  const start = period === "all" ? null : `${year}-${period === "year" ? "01" : String(month).padStart(2, "0")}-01`;
  return { start, label: period === "all" ? "Todo o histórico até a captura" : period === "year" ? `Ano ${year} até a captura` : `${String(month).padStart(2, "0")}/${year} até a captura` };
}
