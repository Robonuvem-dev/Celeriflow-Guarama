import { sql } from "drizzle-orm";
import { processes, processTypes, processSubjects } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { processCitizenAccesses } from "@/db/schema/citizen-access";

export function citizenReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/portal/minha-area";
  try {
    const url = new URL(value, "https://portal.invalid");
    const allowed = ["/portal/minha-area", "/portal/minha-area/servicos", "/portal/minha-area/processos", "/portal/minha-area/solicitacoes", "/portal/tributario", "/portal/nfse"];
    if (url.origin !== "https://portal.invalid" || !value.startsWith("/") || value.includes("\\")) return "/portal/minha-area";
    if (!allowed.includes(url.pathname) && !/^\/portal\/minha-area\/(?:processos|solicitacoes|servicos)\/[^/]+$/.test(url.pathname)) return "/portal/minha-area";
    return url.pathname + url.search;
  } catch {
    return "/portal/minha-area";
  }
}

export function hasCitizenProcessScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.includes("PROCESSOS");
}

export function citizenProcessWhere(usuarioId: string, taxpayerIds: string[], now = new Date()) {
  // Confidential attendance and functional/medical requests keep their specialized policies.
  const taxpayerList = taxpayerIds.length ? sql.join(taxpayerIds.map(id => sql`${id}`), sql`,`) : sql`NULL`;
  return sql`NOT EXISTS(SELECT 1 FROM "Ombudsman" protected WHERE protected."processId"=${processes.id})
    AND NOT EXISTS(SELECT 1 FROM "HrPortalRequestBinding" protected WHERE protected."processId"=${processes.id})
    AND NOT EXISTS(SELECT 1 FROM "SstMedicalCertificate" protected WHERE protected."processId"=${processes.id})
    AND NOT EXISTS(SELECT 1 FROM "TransparencyCitizenRequest" protected WHERE protected."processId"=${processes.id})
    AND NOT EXISTS(SELECT 1 FROM "CitizenAccessApplication" protected WHERE protected."processId"=${processes.id})
    AND (EXISTS(SELECT 1 FROM ${processCitizenAccesses} WHERE ${processCitizenAccesses.processId}=${processes.id} AND ${processCitizenAccesses.usuarioId}=${usuarioId} AND ${processCitizenAccesses.revokedAt} IS NULL AND ${processCitizenAccesses.grantedAt}<=${now} AND (${processCitizenAccesses.expiresAt} IS NULL OR ${processCitizenAccesses.expiresAt}>${now}))
      OR EXISTS(SELECT 1 FROM "TaxServiceRequest" fiscal WHERE fiscal."processId"=${processes.id} AND fiscal."taxpayerId" IN (${taxpayerList}))
      OR EXISTS(SELECT 1 FROM "TaxCaseLink" fiscal WHERE fiscal."processId"=${processes.id} AND fiscal."taxpayerId" IN (${taxpayerList})))`;
}

export const citizenProcessSelect = {
  id: processes.id, protocolNumber: processes.protocolNumber, status: processes.status, createdAt: processes.createdAt, updatedAt: processes.updatedAt,
  expectedCompletionAt: processes.expectedCompletionAt, completedAt: processes.completedAt, archivedAt: processes.archivedAt,
  processType: { name: processTypes.name }, subject: { name: processSubjects.name }, currentDepartment: { name: departments.name },
};
