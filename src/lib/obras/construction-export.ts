import { createHash } from "node:crypto";
import { z } from "zod";
import { validateCpf, validateCnpj } from "../identifiers/brazilian-identifiers";

export const exportRequestSchema = z.object({ requestKey: z.uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), caseIds: z.array(z.string().min(1)).min(1).max(200).refine((ids) => new Set(ids).size === ids.length, "Não repita processos."), rectifiesId: z.string().optional(), reason: z.string().trim().max(2000).optional() }).refine((value) => !value.rectifiesId || (value.reason?.length || 0) >= 10, "Descreva o motivo da retificação.");
export type ExportRecord = { caseId: string; protocol: string; permitId: string | null; permitNumber: string | null; permitIssuedAt: string | null; permitStatus: string | null; permitDocumentVersionId?: string | null; permitHashSha256?: string | null; permitValidUntil?: string | null; ownerDocument: string | null; properties: { registration: string | null; address: string | null }[]; area: string; startedAt: string | null };

type ExportPermit = { id: string; caseId: string; kind: string; status: string; publishedAt: Date | null; validUntil: Date | null; documentId: string; documentVersionId: string; hashSha256: string };
type ExportSignedVersion = { id: string; documentId: string; status: string; hashSha256: string; signatures: { isRequired: boolean; status: string; documentHash: string; documentId: string; documentVersionId: string }[] };

/** F5 publication and current GED signature evidence, never approval/issuance alone. */
export function selectConstructionExportPermit<T extends ExportPermit>(caseId: string, permits: T[], versions: ExportSignedVersion[], now = new Date()): T | null {
  const eligible = permits.filter((permit) => {
    if (permit.caseId !== caseId || permit.kind !== "PERMIT" || permit.status !== "PUBLISHED" || !permit.publishedAt || permit.publishedAt > now || (permit.validUntil && permit.validUntil < now)) return false;
    const version = versions.find((candidate) => candidate.id === permit.documentVersionId && candidate.documentId === permit.documentId);
    if (!version || version.status !== "SIGNED" || version.hashSha256 !== permit.hashSha256) return false;
    const required = version.signatures.filter((signature) => signature.isRequired);
    return required.length > 0 && required.every((signature) => signature.status === "SIGNED" && signature.documentHash === permit.hashSha256 && signature.documentId === permit.documentId && signature.documentVersionId === permit.documentVersionId);
  });
  return eligible.sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())[0] || null;
}

export function validateExportRecords(records: ExportRecord[], period: string) {
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(period);
  const issues: { caseId: string; code: string; message: string }[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const add = (code: string, message: string) => issues.push({ caseId: record.caseId, code, message });
    if (seen.has(record.caseId)) add("DUPLICATE", "Processo repetido no lote.");
    seen.add(record.caseId);
    if (!record.permitId || !record.permitNumber || !record.permitIssuedAt || record.permitStatus !== "PUBLISHED") add("NO_ISSUED_PERMIT", "Não há alvará publicado, assinado e vigente; aprovação ou emissão pendente não é publicação.");
    if (!validateCpf(record.ownerDocument).valid && !validateCnpj(record.ownerDocument).valid) add("OWNER_DOCUMENT", "CPF/CNPJ do requerente ausente ou inconsistente (dígitos verificadores).");
    if (!record.properties.length || record.properties.some((property) => !property.registration || !property.address)) add("PROPERTY", "Inscrição ou endereço do imóvel incompleto.");
    if (!/^\d+(?:\.\d{1,4})?$/.test(record.area) || Number(record.area) <= 0) add("AREA", "Área inválida ou não positiva.");
    if (record.startedAt && record.permitIssuedAt && record.startedAt < record.permitIssuedAt.slice(0, 10)) add("START_BEFORE_PERMIT", "Início anterior à emissão do alvará.");
    if (record.permitIssuedAt?.slice(0, 7) !== period && record.startedAt?.slice(0, 7) !== period) add("OUTSIDE_PERIOD", "Emissão e início fora da competência selecionada.");
  }
  return { valid: records.length > 0 && issues.length === 0, issues, count: records.length };
}

export function createExportSnapshot(records: ExportRecord[], input: { period: string; version: number; rectifiesId?: string; reason?: string; createdAt: string }) {
  const validation = validateExportRecords(records, input.period);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.caseId}: ${issue.message}`).join(" ") || "Lote vazio.");
  const payload = JSON.stringify({ layout: "MUNICIPAL_DEMO_JSON_V1", demonstration: true, disclaimer: "Intercâmbio municipal demonstrativo. Leiaute federal não homologado; download não comprova transmissão nem aceite oficial.", ...input, records: [...records].sort((a, b) => a.caseId.localeCompare(b.caseId)) }, null, 2) + "\n";
  return { payload, hashSha256: createHash("sha256").update(payload, "utf8").digest("hex"), validation };
}

export function verifyExportHash(payload: string, hash: string) {
  return createHash("sha256").update(payload, "utf8").digest("hex") === hash;
}
