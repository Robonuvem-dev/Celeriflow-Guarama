import { and, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { ombudsmans, tickets } from "../../schema/attendance-portals";
import { processes } from "../../schema/processes";
import { ombudsmanScopeCondition, ticketScopeCondition, type AttendanceScopeContext } from "../attendance-portals/scope";
import { protocolScopeCondition, type ProtocolScopeContext } from "@/lib/protocols/access";
import type { ConstructionAccess } from "@/lib/contracts/construction";

export type DownloadDocument = {
  id: string;
  sstCertificateDocument: { certificate: { budgetUnitId: string } } | null;
  ticketLinks: { ticketId: string }[];
  ombudsmanLinks: { ombudsmanId: string }[];
  processDocuments: { processId: string }[];
  healthStandardDocument: { id: string } | null;
};

export async function findDownloadDocument(db: DatabaseExecutor, url: string): Promise<DownloadDocument | null> {
  const result = await db.execute<DownloadDocument>(sql`
    SELECT d.id,
      (SELECT jsonb_build_object('certificate', jsonb_build_object('budgetUnitId', c."budgetUnitId"))
         FROM "SstCertificateDocument" l JOIN "SstMedicalCertificate" c ON c.id=l."certificateId"
         WHERE l."documentId"=d.id LIMIT 1) AS "sstCertificateDocument",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('ticketId', l."ticketId")) FROM "TicketDocument" l WHERE l."documentId"=d.id), '[]'::jsonb) AS "ticketLinks",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('ombudsmanId', l."ombudsmanId")) FROM "OmbudsmanDocument" l WHERE l."documentId"=d.id), '[]'::jsonb) AS "ombudsmanLinks",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('processId', l."processId")) FROM "ProcessDocument" l WHERE l."documentId"=d.id), '[]'::jsonb) AS "processDocuments",
      (SELECT jsonb_build_object('id', h.id) FROM "HealthStandardDocument" h WHERE h."documentId"=d.id LIMIT 1) AS "healthStandardDocument"
    FROM "Document" d WHERE d."fileUrl"=${url} LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function findDownloadConstructionArtifact(db: DatabaseExecutor, url: string): Promise<{ id: string; caseId: string; status: string; documentVersionId: string; hashSha256: string; number: string } | null> {
  const result = await db.execute<{ id: string; caseId: string; status: string; documentVersionId: string; hashSha256: string; number: string }>(sql`SELECT id,"caseId",status,"documentVersionId","hashSha256",number FROM "ConstructionIssuedDocument" WHERE "fileUrl"=${url} LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function findDownloadOccupationalOwner(db: DatabaseExecutor, url: string): Promise<{ budgetUnitId: string } | null> {
  const result = await db.execute<{ budgetUnitId: string }>(sql`SELECT c."budgetUnitId" FROM "SstCertificateDocument" l JOIN "SstMedicalCertificate" c ON c.id=l."certificateId" JOIN "Document" d ON d.id=l."documentId" WHERE d."fileUrl"=${url} LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function listDownloadPlanningOwners(db: DatabaseExecutor, url: string): Promise<{ id: string; jurisdiction: "EXECUTIVE" | "LEGISLATIVE" | null }[]> {
  const ready = await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('"PlanningDocumentLink"') IS NOT NULL AS ready`);
  if (!ready.rows[0]?.ready) return [];
  const result = await db.execute<{ id: string; jurisdiction: "EXECUTIVE" | "LEGISLATIVE" | null }>(sql`SELECT l.id, s.jurisdiction FROM "PlanningDocumentLink" l JOIN "DocumentVersion" v ON v.id=l."documentVersionId" JOIN "PlanningInstrument" i ON i.id=l."instrumentId" LEFT JOIN "PlanningEntityScope" s ON s."governmentEntityId"=i."governmentEntityId" WHERE v."fileUrl"=${url}`);
  return result.rows;
}

export async function listDownloadConstructionCaseIds(db: DatabaseExecutor, processIds: string[]): Promise<string[]> {
  if (!processIds.length) return [];
  const result = await db.execute<{ id: string }>(sql`SELECT id FROM "ConstructionCase" WHERE "processId" IN (${sql.join(processIds.map(id => sql`${id}`), sql`, `)})`);
  return result.rows.map(row => row.id);
}

export async function canDownloadConstructionCase(db: DatabaseExecutor, ids: string[], access: ConstructionAccess): Promise<boolean> {
  if (!ids.length || (!access.administrator && (!access.departmentId || !access.roles.length))) return false;
  const scope = access.administrator ? sql`TRUE` : sql`EXISTS(SELECT 1 FROM "Process" p WHERE p.id=c."processId" AND p."currentDepartmentId"=${access.departmentId})`;
  const result = await db.execute<{ id: string }>(sql`SELECT c.id FROM "ConstructionCase" c WHERE c.id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)}) AND ${scope} LIMIT 1`);
  return result.rows.length > 0;
}

export async function canDownloadLinkedOmbudsman(db: DatabaseExecutor, ids: string[], context: AttendanceScopeContext): Promise<boolean> {
  if (!ids.length) return false;
  return (await db.select({ id: ombudsmans.id }).from(ombudsmans).where(and(inArray(ombudsmans.id, ids), ombudsmanScopeCondition(context))).limit(1)).length > 0;
}

export async function canDownloadLinkedTicket(db: DatabaseExecutor, ids: string[], context: AttendanceScopeContext): Promise<boolean> {
  if (!ids.length) return false;
  return (await db.select({ id: tickets.id }).from(tickets).where(and(inArray(tickets.id, ids), ticketScopeCondition(context))).limit(1)).length > 0;
}

export async function canDownloadLinkedProcess(db: DatabaseExecutor, ids: string[], context: ProtocolScopeContext): Promise<boolean> {
  if (!ids.length) return false;
  return (await db.select({ id: processes.id }).from(processes).where(and(inArray(processes.id, ids), protocolScopeCondition(context))).limit(1)).length > 0;
}

export async function findDownloadEnvironmentDocument(db: DatabaseExecutor, url: string): Promise<{ id: string } | null> {
  const result = await db.execute<{ id: string }>(sql`SELECT id FROM "EnvDocument" WHERE "fileUrl"=${url} LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function findDownloadConstructionVersion(db: DatabaseExecutor, documentId: string, url: string): Promise<{ hashSha256: string } | null> {
  const result = await db.execute<{ hashSha256: string }>(sql`SELECT "hashSha256" FROM "DocumentVersion" WHERE "documentId"=${documentId} AND "fileUrl"=${url} AND status IN ('FINAL','SIGNED') ORDER BY "versionNumber" DESC LIMIT 1`);
  return result.rows[0] ?? null;
}
