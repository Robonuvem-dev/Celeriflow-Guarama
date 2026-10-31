import type { GedCapability, GedQuery } from "@/lib/documents/ged-policy";

export type GedDocumentItem = {
  id: string; title: string; documentType: string; status: string; editorialStatus: string;
  filename: string; mimeType: string; byteLength: number; origin: string; legacyReference: string;
  folderId: string | null; folderName: string | null; versionId: string; versionNumber: number;
  hashSha256: string; versionStatus: string; checkoutOwnerId: string | null; createdAt: string;
  page: number | null; snippet: string | null;
};
export type GedListRow = { id: string; title: string; kind: string; status: string; detail: string; date: string };
export type GedSection = "acervo" | "pesquisa" | "pastas-inteligentes" | "importacoes" | "processamento" | "tarefas" | "fluxos" | "modelos" | "thesaurus" | "classes";
export type GedBootstrap = {
  userId: string; departmentId: string | null; documentPrefix: string;
  capabilities: Record<GedCapability, boolean>;
  classes: { code: string; label: string }[];
  users: { id: string; name: string }[];
};
export type GedListResponse = { documents: GedDocumentItem[]; rows: GedListRow[]; total: number; page: number; query: GedQuery };
export type GedDetail = {
  versionPage: number; versionTotal: number;
  centralSignatures: { code: string; method: string; signedAt: string }[];
  document: GedDocumentItem;
  versions: { id: string; number: number; status: string; hash: string; createdAt: string; code: string | null }[];
  pages: { page: number; text: string; method: string; zones: unknown }[];
  review: { id: string; stage: number; status: string; dueAt: string; assignments: Record<string, string[]> } | null;
  decisions: { stage: number; userId: string; decision: string; comment: string; createdAt: string }[];
};
