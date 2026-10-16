import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { PublicCollection, PublicDataset, PublicRecord, TransparencyQuery } from "./query-contract";
import { transparencyCatalog } from "./consultation-catalog";
export function publicPublicationValues(value: unknown): PublicRecord["values"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set([...transparencyCatalog.flatMap(collection => [...collection.columns.map(column => column.key), ...collection.filters.map(filter => filter.key)]), "origin", "sourceDocumentId", "sourceMunicipality", "sourceReference", "sizeBytes", "sha256", "version", "competence", "originalYear"]);
  return Object.fromEntries(Object.entries(value).filter(([key, cell]) => allowed.has(key) && (cell === null || ["string", "number", "boolean"].includes(typeof cell))));
}
export const receivedTransparencyReferences = [
  { code: "ND-127", title: "Relatório Anual de Monitoramento da Transparência 2025", group: "Controle e transparência", year: 2025, reference: "2025", filename: "Relatório Anual de Monitoramento do Portal Transparência 2025.pdf" },
  { code: "ND-040", title: "Demonstrativo simplificado do Relatório de Gestão Fiscal", group: "Contas públicas / RGF", year: 2026, reference: "2º quadrimestre/2026", filename: "DEMONSTRATIVO SIMPLIFICADO DO RELATORIO DE GESTÃO FISCAL.pdf" },
  { code: "ND-041", title: "Demonstrativo simplificado do RREO", group: "Contas públicas / RREO", year: 2026, reference: "Janeiro–junho/2026", filename: "DEMONSTRATIVO SIMPLIFICADO DO RELATÓRIO RESUMIDO DA EXECUCAO ORCAMENTARIA.pdf" },
  { code: "ND-107", title: "Plano Municipal de Saúde 2026–2029", group: "Saúde / planos", year: 2026, through: 2029, reference: "2026–2029", filename: "PLANO MUNICIPAL DE SAÚDE 2026-2029.pdf" },
  { code: "ND-106", title: "Plano Municipal de Assistência Social 2026–2029", group: "Assistência Social / planos", year: 2026, through: 2029, reference: "2026–2029", filename: "PLANO MUNICIPAL DE ASSISTÊNCIA SOCIAL 2026-2029.pdf" },
  { code: "ND-112", title: "Relatório Anual de Gestão de Saúde 2025", group: "Saúde / gestão", year: 2025, reference: "2025", filename: "RAG MUNICIPAL 2025 saude.pdf" },
  { code: "ND-079", title: "LDO 2026 — Lei 664/2025", group: "Planejamento / LDO", year: 2026, reference: "Exercício 2026", filename: "Lei Nº 664-2025 LDO 2026.pdf" },
  { code: "ND-083", title: "LOA 2026 — Lei 702/2025", group: "Planejamento / LOA", year: 2026, reference: "Exercício 2026", filename: "LEI Nº 702-2025 LOA 2026.pdf" },
  { code: "ND-085", title: "LDO 2027 — Lei 724/2026", group: "Planejamento / LDO", year: 2027, reference: "Exercício 2027", filename: "Lei Nº 724-2026 LDO 2027.pdf" },
  { code: "ND-023", title: "Termos de colaboração 2022–2026", group: "Parcerias / termos", year: 2026, reference: "2022–2026", filename: "Dados Essenciais Termos de Colaboração 2022-2026.pdf" },
] as const;

export async function documentTransparencyDataset(db: PrismaClient, collection: PublicCollection, query: TransparencyQuery): Promise<PublicDataset> {
  const records: PublicRecord[] = [];
   const native = await db.transparencyPublication.findMany({ where: { ...(collection.slug !== "publicacoes" ? { collectionSlug: collection.slug } : {}), year: query.year, status: "PUBLISHED", ...(query.entity !== "consolidado" ? { entity: query.entity } : {}) }, orderBy: [{ publishedAt: "desc" }, { order: "asc" }, { publicKey: "asc" }] });
   for (const entry of native) records.push({ key: entry.publicKey, entity: entry.entity as "prefeitura" | "camara", year: entry.year, values: { ...publicPublicationValues(entry.values), name: entry.title, group: entry.group, date: entry.publishedAt?.toISOString().slice(0, 10) || null, format: ({"application/pdf":"PDF","application/zip":"ZIP","text/csv":"CSV","text/plain":"TXT","image/png":"PNG","image/jpeg":"JPEG"} as Record<string,string>)[entry.contentType||""]||entry.contentType||"Link", reference: entry.referencePeriod, status: "Publicado",documentKind:entry.documentKind,legalStage:entry.legalStage, version: entry.version, sha256: entry.sha256,collectionSlug:entry.collectionSlug }, links: entry.fileUrl ? [{ title: "Baixar documento", url: `/api/transparencia/publicacoes/${entry.publicKey}` }] : entry.linkUrl ? [{ title: "Publicação de origem", url: entry.linkUrl }] : [] });
   return { records, source: "DOCUMENTOS", status: "AVAILABLE", updatedAt: native[0]?.updatedAt.toISOString() || null, provenance: "Documentos municipais enviados e publicados pela gestão do Portal da Transparência. O acervo do portal anterior fica disponível após upload e publicação de cada arquivo.", complete: true };
}
