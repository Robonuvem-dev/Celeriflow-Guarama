import { z } from "zod";

export const GED_MAX_BYTES = 20 * 1024 * 1024;
export const gedStages = ["DRAFT", "CONSENSUS", "APPROVAL", "HOMOLOGATION"] as const;
export type GedStage = (typeof gedStages)[number];
export const gedStageLabels: Record<GedStage, string> = {
  DRAFT: "Elaboração",
  CONSENSUS: "Consenso",
  APPROVAL: "Aprovação",
  HOMOLOGATION: "Homologação",
};
export const gedReviewDecisions = ["APPROVE", "RETURN"] as const;
export type GedReviewDecision = (typeof gedReviewDecisions)[number];

export const gedEditorialStatuses = ["DRAFT", "IN_REVIEW", "HOMOLOGADO", "CANCELLED"] as const;
export type GedEditorialStatus = (typeof gedEditorialStatuses)[number];

export const gedClassificationSchemes = ["SYSTEM", "CONARQ", "CUSTOM"] as const;
export type GedClassificationScheme = (typeof gedClassificationSchemes)[number];

export const gedQuerySchema = z.object({
  folderId: z.string().trim().max(100).optional(),
  classCode: z.string().trim().max(100).optional(),
  text: z.string().trim().max(200).optional(),
  status: z.string().trim().max(50).optional(),
  tag: z.string().trim().max(100).optional(),
  mode: z.enum(["exact", "fragment", "prefix"]).default("fragment"),
});
export type GedQuery = z.infer<typeof gedQuerySchema>;

export const gedZoneSchema = z.object({
  page: z.number().int().min(1).max(200), label: z.string().trim().min(1).max(100),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
}).refine(v => v.x + v.width <= 1.000001 && v.y + v.height <= 1.000001, "A região deve caber na página.");
export type GedZone = z.infer<typeof gedZoneSchema>;
export const gedMimeTypes = {
  pdf: "application/pdf", txt: "text/plain", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  odf: "application/vnd.oasis.opendocument.formula", odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  doc: "application/msword", rtf: "application/rtf", xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", pps: "application/vnd.ms-powerpoint",
  html: "text/html", htm: "text/html", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", gif: "image/gif",
} as const;
export const gedAcceptedExtensions = Object.keys(gedMimeTypes).map(extension => `.${extension}`).join(",");
export function gedFileType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  const mime = extension && Object.hasOwn(gedMimeTypes, extension) ? gedMimeTypes[extension as keyof typeof gedMimeTypes] : undefined;
  if (!mime) throw new Error("Formato documental não suportado.");
  return mime;
}
export function normalizeGedText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
export function gedTokens(value: string) {
  return normalizeGedText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}
export function templateMarkers(content: string) {
  return [...new Set([...content.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g)].map(m => m[1]))];
}

export type GedManifestItem = {
  filename: string;
  title: string;
  folderPath: string;
  classCode: string;
  legacyReference?: string;
};

export function parseGedManifest(csv: string): GedManifestItem[] {
  const lines = csv.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const [header, ...data] = lines;
  const columns = header.split(",").map(c => c.trim().toLowerCase());
  const required = ["filename", "title", "folderpath", "classcode"];
  for (const col of required) {
    if (!columns.includes(col)) throw new Error(`Coluna obrigatória ausente no manifesto: ${col}`);
  }
  return data.map((line, index) => {
    const values = line.split(",").map(v => v.trim());
    const row = Object.fromEntries(columns.map((col, i) => [col, values[i] ?? ""]));
    if (!row.filename || !row.title || !row.classcode) throw new Error(`Linha ${index + 2} incompleta no manifesto.`);
    return {
      filename: row.filename,
      title: row.title,
      folderPath: row.folderpath || "Geral",
      classCode: row.classcode,
      legacyReference: row.legacyreference || undefined,
    };
  });
}
