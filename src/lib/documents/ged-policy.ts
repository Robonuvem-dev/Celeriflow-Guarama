import { z } from "zod";

export const gedCapabilities = ["read", "import", "edit", "review", "models", "configure"] as const;
export type GedCapability = typeof gedCapabilities[number];
export const gedCapabilityLabels: Record<GedCapability, string> = {
  read: "Consultar acervo", import: "Importar documentos", edit: "Editar e reservar versões",
  review: "Revisar e homologar", models: "Gerenciar modelos", configure: "Configurar GED",
};
export const gedQuerySchema = z.object({
  text: z.string().trim().max(300).default(""),
  mode: z.enum(["words", "phrase", "fragment", "proximity"]).default("words"),
  distance: z.coerce.number().int().min(0).max(50).default(5),
  thesaurus: z.boolean().default(false), status: z.string().max(50).default(""),
  folderId: z.string().max(100).default(""),
});
export type GedQuery = z.infer<typeof gedQuerySchema>;
export const gedStages = ["ELABORACAO", "CONSENSO", "APROVACAO", "HOMOLOGACAO"] as const;
export const gedStageLabels = { ELABORACAO: "Elaboração", CONSENSO: "Consenso", APROVACAO: "Aprovação", HOMOLOGACAO: "Homologação" };
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
} as const;
export function gedFileType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  const mime = gedMimeTypes[extension as keyof typeof gedMimeTypes];
  if (!mime) throw new Error("Envie PDF, TXT, DOCX, PNG ou JPEG.");
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
export function fillGedTemplate(content: string, values: Record<string, string>) {
  const markers = templateMarkers(content);
  for (const key of markers) if (!(key in values) || typeof values[key] !== "string" || values[key].length > 5000) throw new Error(`Preencha o marcador ${key}.`);
  return content.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g, (_, key: string) => values[key]);
}

export type GedManifestItem = { filename: string; title: string; folderPath: string[]; classCode: string; legacyReference: string };
export function parseGedManifest(input: string): GedManifestItem[] {
  if (input.length > 1_000_000) throw new Error("Manifesto superior a 1 MB.");
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (character === delimiter || character === "\n")) {
      row.push(field.replace(/\r$/, "").trim()); field = "";
      if (character === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else field += character;
  }
  if (quoted) throw new Error("Aspas não fechadas no manifesto.");
  row.push(field.replace(/\r$/, "").trim()); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift() ?? [];
  if (!header.includes("filename")) throw new Error("O CSV precisa da coluna filename; opcionais: title, folderPath, classCode, legacyReference.");
  if (rows.length > 1000) throw new Error("Divida manifestos com mais de 1000 arquivos.");
  const seen = new Set<string>();
  return rows.map(values => {
    const value = (key: string) => values[header.indexOf(key)] || "";
    const filename = value("filename");
    if (!filename || filename.length > 250 || seen.has(filename)) throw new Error("Nomes ausentes ou repetidos no manifesto.");
    seen.add(filename);
    const folderPath = value("folderPath").split(/[\\/]/).filter(Boolean);
    if (folderPath.length > 20 || folderPath.some(part => part === "." || part === ".." || part.length > 150)) throw new Error("Caminho de pasta inválido no manifesto.");
    return { filename, title: value("title") || filename.replace(/\.[^.]+$/, ""), folderPath, classCode: value("classCode"), legacyReference: value("legacyReference") };
  });
}
