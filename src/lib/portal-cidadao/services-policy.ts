import { z } from "zod";

export const serviceProviders = ["ADMINISTRATIVO", "MANUTENCAO", "CADASTRO", "TRIBUTARIO", "RESERVA", "AGENDAMENTO", "INFORMATIVO", "ESPECIALIZADO"] as const;
const field = z.object({ code: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/), label: z.string().trim().min(1).max(160), type: z.enum(["TEXT", "TEXTAREA", "DATE", "NUMBER", "SELECT"]), required: z.boolean(), options: z.array(z.string().max(160)).max(100).default([]) }).strict();
export const digitalServiceSchema = z.object({
  executor: z.enum(["SOLICITACAO", "GUIA", "NFSE_AVULSA", "ITBI"]).default("SOLICITACAO"),
  instantCompletion: z.boolean().default(false),
  executorConfiguration: z.object({ budgetUnitId: z.string().default(""), serviceActivityId: z.string().default(""), transactionTypeId: z.string().default(""), paymentRequired: z.boolean().default(true), cadastralUpdateMode: z.enum(["MANUAL", "AUTO_ON_PAYMENT"]).default("MANUAL") }).strict().default({ budgetUnitId: "", serviceActivityId: "", transactionTypeId: "", paymentRequired: true, cadastralUpdateMode: "MANUAL" }),
  processTypeId: z.string().default(""), subjectId: z.string().default(""),
  fields: z.array(field).max(50).default([]),
  documents: z.array(z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), label: z.string().min(1).max(160), documentClassCode: z.string().min(1), required: z.boolean() }).strict()).max(20).default([]),
  acceptance: z.string().max(8000).default(""),
  targetPath: z.string().max(300).default(""),
  taxpayerScope: z.string().max(80).default(""),
  resourceKey: z.string().max(100).default(""),
  spaceId: z.string().default(""),
  slotMinutes: z.number().int().min(5).max(1440).default(30),
  availableSlots: z.array(z.iso.datetime()).max(1000).default([]),
  municipalBounds: z.object({ south: z.number().min(-90).max(90), north: z.number().min(-90).max(90), west: z.number().min(-180).max(180), east: z.number().min(-180).max(180) }).nullable().default(null),
  municipalPolygon: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(3).max(3000).nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.fields.map((item) => item.code)).size !== value.fields.length || new Set(value.documents.map((item) => item.code)).size !== value.documents.length) ctx.addIssue({ code: "custom", message: "Campos e documentos não podem ter códigos repetidos." });
  if (value.fields.some((item) => item.type === "SELECT" && !item.options.length)) ctx.addIssue({ code: "custom", message: "Informe opções para campos de seleção." });
  if (value.fields.some((item) => ["description", "accepted", "taxpayerId", "location", "latitude", "longitude", "startsAt", "requestKey"].includes(item.code))) ctx.addIssue({ code: "custom", message: "O formulário utiliza um código de campo reservado." });
  if (value.municipalBounds && (value.municipalBounds.south >= value.municipalBounds.north || value.municipalBounds.west >= value.municipalBounds.east)) ctx.addIssue({ code: "custom", message: "Limites municipais inválidos." });
  if (value.targetPath && !safeServiceDestination(value.targetPath)) ctx.addIssue({ code: "custom", message: "Destino especializado não permitido." });
});
export type DigitalService = z.infer<typeof digitalServiceSchema>;

export function safeServiceDestination(value: string) {
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value, "https://portal.invalid");
    return url.origin === "https://portal.invalid" && ["/portal/", "/portal-servidor", "/validar-"].some((prefix) => url.pathname.startsWith(prefix)) && !url.pathname.startsWith("/portal/entrar");
  } catch { return false; }
}

export const saveDigitalServiceSchema = z.object({
  id: z.string().optional(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(8000), group: z.string().trim().min(1).max(120),
  audience: z.enum(["CIDADAO", "CONTRIBUINTE", "SERVIDOR", "FORNECEDOR", "ESTABELECIMENTO"]), provider: z.enum(serviceProviders),
  requirements: z.string().max(8000).default(""), steps: z.string().max(8000).default(""), deadline: z.string().max(500).default(""), cost: z.string().max(500).default(""),
  published: z.boolean(), featured: z.boolean().default(false), requiresLogin: z.boolean().default(true), sortOrder: z.number().int().min(0).max(10000).default(0),
  configuration: digitalServiceSchema,
}).strict();

export const openingSchema = z.object({
  serviceId: z.string().min(1), version: z.number().int().positive(), requestKey: z.uuid(),
  description: z.string().trim().min(10).max(12000), values: z.record(z.string(), z.string().max(4000)),
  uploadIds: z.array(z.string().min(1)).max(20), accepted: z.boolean(), taxpayerId: z.string().default(""),
  location: z.string().trim().max(1000).default(""), latitude: z.number().min(-90).max(90).nullable().default(null), longitude: z.number().min(-180).max(180).nullable().default(null),
  startsAt: z.iso.datetime().optional(),
}).strict();

export function validateServiceValues(configuration: DigitalService, values: Record<string, string>) {
  if (Object.keys(values).some((key) => !configuration.fields.some((item) => item.code === key))) throw new Error("Campo não previsto na versão do serviço.");
  for (const item of configuration.fields) {
    const value = (values[item.code] || "").trim();
    if (item.required && !value) throw new Error(`Preencha ${item.label}.`);
    if (value && item.type === "SELECT" && !item.options.includes(value)) throw new Error(`Opção inválida: ${item.label}.`);
    if (value && item.type === "DATE" && !z.iso.date().safeParse(value).success) throw new Error(`Data inválida: ${item.label}.`);
    if (value && item.type === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Número inválido: ${item.label}.`);
  }
}

export function validateMunicipalLocation(configuration: DigitalService, latitude: number | null, longitude: number | null) {
  const bounds = configuration.municipalBounds;
  if (!bounds && !configuration.municipalPolygon) return;
  if (latitude === null || longitude === null || (bounds && (latitude < bounds.south || latitude > bounds.north || longitude < bounds.west || longitude > bounds.east))) throw new Error("Selecione um local dentro dos limites municipais configurados.");
  if (configuration.municipalPolygon && !pointInMunicipalPolygon(longitude, latitude, configuration.municipalPolygon)) throw new Error("O ponto está fora do perímetro municipal configurado.");
}

export function pointInMunicipalPolygon(longitude: number, latitude: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1, y1] = polygon[j], [x2, y2] = polygon[i];
    const cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1);
    if (Math.abs(cross) < 1e-10 && longitude >= Math.min(x1, x2) && longitude <= Math.max(x1, x2) && latitude >= Math.min(y1, y2) && latitude <= Math.max(y1, y2)) return true;
    if ((y1 > latitude) !== (y2 > latitude) && longitude < (x2 - x1) * (latitude - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

export const requestOperationSchema = z.object({ requestId: z.string().min(1), requestKey: z.uuid(), revision: z.number().int().positive(), operation: z.enum(["COMPLEMENTAR", "CANCELAR", "EXIGENCIA", "RESPONDER", "CONCLUIR", "REABRIR", "NOTA"]), text: z.string().trim().min(5).max(12000), uploadIds: z.array(z.string()).max(20).default([]), requiredCodes: z.array(z.string()).max(20).default([]), documentVersionId: z.string().default("") }).strict();
export const ratingSchema = z.object({ serviceScore: z.number().int().min(1).max(5), qualityScore: z.number().int().min(1).max(5), deadlineScore: z.number().int().min(1).max(5), comment: z.string().trim().max(2000) }).strict();
export const scheduleSchema = z.object({ requestIds: z.array(z.string().min(1)).min(1).max(100), resourceKey: z.string().trim().min(1).max(100), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), type: z.enum(["VISTORIA", "EXECUCAO", "FISCALIZACAO", "RESERVA", "AGENDAMENTO"]), reason: z.string().trim().min(5).max(1000), employeeId: z.string().default(""), teamId: z.string().default(""), assetId: z.string().default(""), laborQuantity: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"), laborUnitCost: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0") }).strict().refine((value) => new Date(value.endsAt) > new Date(value.startsAt), "O término deve ser posterior ao início.");
