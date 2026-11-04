import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";

const endpoint = z.string().trim().max(2000).default("").refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return !url.username && !url.password && !url.search && !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))); } catch { return false; }
}, "Use HTTPS ou HTTP local, sem credenciais ou parâmetros na URL.");
export const gedProvidersSchema = z.object({ ocrEndpoint: endpoint, semanticEndpoint: endpoint, conversionEndpoint: endpoint, pdfaEndpoint: endpoint, libreOfficePath: z.string().trim().max(1000).default(""), veraPdfPath: z.string().trim().max(1000).default("") });
export type GedProviders = z.infer<typeof gedProvidersSchema>;
export async function readGedProviderConfig(): Promise<GedProviders> {
  const row = await db.execute<{ value: unknown }>(sql`SELECT value FROM "GedSetting" WHERE key='providers'`);
  const configured = gedProvidersSchema.parse(row.rows[0]?.value ?? {});
  return {
    ocrEndpoint: configured.ocrEndpoint || process.env.GED_OCR_ENDPOINT || "",
    semanticEndpoint: configured.semanticEndpoint || process.env.GED_SEMANTIC_ENDPOINT || "",
    conversionEndpoint: configured.conversionEndpoint || process.env.GED_CONVERSION_ENDPOINT || "",
    pdfaEndpoint: configured.pdfaEndpoint || process.env.GED_PDFA_ENDPOINT || "",
    libreOfficePath: configured.libreOfficePath || process.env.GED_LIBREOFFICE_PATH || "",
    veraPdfPath: configured.veraPdfPath || process.env.GED_VERAPDF_PATH || "",
  };
}
