import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canPerformModuleOperation, canViewModule, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { getPlanningContext, assertPlanningOperation } from "@/lib/planejamento/access";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { readPlanningDocument } from "@/lib/planejamento/documents";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { assertConstructionGedSignature } from "@/lib/obras/construction-documents-service";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
import { gedFileType } from "./ged-policy";
import { gedHash, readGedBytes } from "./ged-storage";
import type { GedSourceAdapter, GedSourceSnapshot } from "./ged-source-ingress";

export const gedSourceModuleSchema = z.enum(["PROCESSOS", "PLANEJAMENTO", "FINANCEIRO", "OBRAS", "RH"]);
type SourceRow = { id: string; title: string; fileUrl: string; versionId: string; hash: string | null; filename?: string };
// A generic import must never turn a clinical/personal record into sector-wide GED access.
const ordinaryDocument = sql`d."personId" IS NULL AND d."companyId" IS NULL
  AND NOT EXISTS(SELECT 1 FROM "HealthClinicalDocument" h WHERE h."documentId"=d.id)
  AND NOT EXISTS(SELECT 1 FROM "SstCertificateDocument" h WHERE h."documentId"=d.id)
  AND NOT EXISTS(SELECT 1 FROM "HealthLabReport" h WHERE h."documentId"=d.id)
  AND NOT EXISTS(SELECT 1 FROM "HealthStandardDocument" h WHERE h."documentId"=d.id)
  AND d."documentType" NOT LIKE 'SST:%' AND d."documentType" NOT LIKE 'SAUDE:%'`;
const latest = sql`LEFT JOIN LATERAL(SELECT * FROM "DocumentVersion" v0 WHERE v0."documentId"=d.id AND v0.status IN ('FINAL','SIGNED') ORDER BY v0."versionNumber" DESC LIMIT 1) v ON true`;

async function snapshot(row: SourceRow, bytes?: Buffer): Promise<GedSourceSnapshot> {
  const content = bytes ?? await readGedBytes(row.fileUrl, row.hash ?? undefined);
  if (row.hash && gedHash(content) !== row.hash) throw new Error("A integridade do documento de origem diverge da versão registrada.");
  let filename = row.filename ?? decodeURIComponent(new URL(row.fileUrl).pathname.split("/").pop() || "");
  try { gedFileType(filename); } catch {
    if (content.subarray(0, 5).toString() !== "%PDF-") throw new Error("A origem não informa um nome de arquivo suportado.");
    filename = "documento-origem.pdf";
  }
  return { title: row.title, filename, bytes: content, sourceVersionId: row.versionId, sha256: gedHash(content) };
}

/** List and read share the same source-level predicate. Source identity is checked
 * again on POST; the browser never supplies URLs, bytes, hash or authorization. */
export async function resolveGedSource(context: AppContext, rawModule: unknown, jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const sourceModule = gedSourceModuleSchema.parse(rawModule), database = context.database ?? db;
  if (!canViewModule(context.user, sourceModule) || !canPerformModuleOperation(context.user, sourceModule, "update")) throw new Error("A origem exige consulta e edição para exportar uma cópia documental.");
  let from: SQL, scope: SQL, columns: SQL;
  let planning: Awaited<ReturnType<typeof getPlanningContext>> | undefined;
  if (sourceModule === "PROCESSOS") {
    const protocol = await getProtocolContext("edit");
    if (protocol.user.id !== context.user.id) throw new Error("Identidade de origem divergente.");
    from = sql`FROM "ProcessDocument" s JOIN "Process" ON "Process".id=s."processId" JOIN "Document" d ON d.id=s."documentId" ${latest}`;
    scope = sql`${protocolScopeCondition(protocol)} AND s."employeeId" IS NULL AND ${ordinaryDocument}
      AND NOT EXISTS(SELECT 1 FROM "ConstructionCase" c WHERE c."processId"="Process".id)
      AND NOT EXISTS(SELECT 1 FROM "PlanningDocumentLink" l WHERE l."documentId"=d.id)`;
    columns = sql`s.id,coalesce(s.title,d.title) title,coalesce(v."fileUrl",d."fileUrl") AS "fileUrl",coalesce(v.id,d.id) AS "versionId",v."hashSha256" AS hash`;
  } else if (sourceModule === "PLANEJAMENTO") {
    planning = await getPlanningContext(jurisdiction); assertPlanningOperation(planning, "update");
    if (planning.user.id !== context.user.id) throw new Error("Identidade de origem divergente.");
    from = sql`FROM "PlanningDocumentLink" s JOIN "Document" d ON d.id=s."documentId" JOIN "DocumentVersion" v ON v.id=s."documentVersionId"`;
    scope = sql`${planningInstrumentScope(planning, sql`s."instrumentId"`)} AND ${ordinaryDocument} AND v.status IN ('FINAL','SIGNED')
      AND (${isSystemAdministrator(context.user)} OR NOT EXISTS(SELECT 1 FROM "PlanningInstrument" i JOIN "PlanningEntityUnit" u ON u."governmentEntityId"=i."governmentEntityId" WHERE i.id=s."instrumentId" AND NOT(u."budgetUnitId"=ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]))))`;
    columns = sql`s.id,d.title,v."fileUrl",v.id AS "versionId",v."hashSha256" AS hash`;
  } else if (sourceModule === "FINANCEIRO") {
    from = sql`FROM "Settlement" s JOIN "Commitment" c ON c.id=s."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" JOIN "Document" d ON d.id=s."documentId" ${latest}`;
    scope = sql`${ordinaryDocument} AND (${isSystemAdministrator(context.user)} OR a."budgetUnitId"=ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]))`;
    columns = sql`s.id,d.title,coalesce(v."fileUrl",d."fileUrl") AS "fileUrl",coalesce(v.id,d.id) AS "versionId",v."hashSha256" AS hash`;
  } else if (sourceModule === "OBRAS") {
    const access = await resolveConstructionAccess(context);
    from = sql`FROM "ConstructionIssuedDocument" s JOIN "ConstructionCase" c ON c.id=s."caseId" JOIN "Process" p ON p.id=c."processId" JOIN "Document" d ON d.id=s."documentId" JOIN "DocumentVersion" v ON v.id=s."documentVersionId"`;
    scope = sql`s.status='PUBLISHED' AND (${access.administrator} OR (${access.roles.includes("MANAGER")} AND p."currentDepartmentId"=${access.departmentId})) AND ${ordinaryDocument}`;
    columns = sql`s.id,d.title,s."fileUrl",s."documentVersionId" AS "versionId",s."hashSha256" AS hash`;
  } else {
    from = sql`FROM "HrEmployeeDocument" s JOIN "Employee" e ON e.id=s."employeeId"`;
    scope = sql`(${isSystemAdministrator(context.user)} OR e."departmentId"=${context.user.departmentId})`;
    columns = sql`s.id,s.title,'' AS "fileUrl",s.id AS "versionId",NULL::text AS hash`;
  }
  const adapter: GedSourceAdapter = { module: sourceModule, readAuthorizedSnapshot: async (actor, id) => {
    if (actor.user.id !== context.user.id) throw new Error("Identidade de origem divergente.");
    const row = (await database.execute<SourceRow>(sql`SELECT ${columns} ${from} WHERE s.id=${id} AND ${scope} LIMIT 1`)).rows[0];
    if (!row) throw new Error("Documento não encontrado ou fora do acesso da origem.");
    if (sourceModule === "PLANEJAMENTO") await readPlanningDocument(planning!, id);
    if (sourceModule === "OBRAS") {
      const issued = (await database.execute<{ caseId: string }>(sql`SELECT "caseId" FROM "ConstructionIssuedDocument" WHERE id=${id}`)).rows[0];
      if (!await findConstructionCaseForAccess(database, issued.caseId, await resolveConstructionAccess(context))) throw new Error("Solicitação fora do acesso de Obras.");
      await assertConstructionGedSignature(database, row.versionId);
      return snapshot({ ...row, filename: "documento-urbanistico.pdf" }, Buffer.from(await readConstructionPdf(row.fileUrl, row.hash!)));
    }
    if (sourceModule === "RH") {
      const source = (await database.execute<{ body: string; templateId: string; templateUpdatedAt: Date }>(sql`SELECT body,"templateId","templateUpdatedAt" FROM "HrEmployeeDocument" WHERE id=${id}`)).rows[0];
      const bytes = Buffer.from(source.body, "utf8");
      return { title: row.title, filename: "ato-pessoal.txt", bytes, sourceVersionId: row.versionId, sha256: gedHash(bytes) };
    }
    return snapshot(row);
  } };
  return { adapter, list: async (text: string, page: number) => {
    const filter = sql`${scope} AND strpos(lower(${sourceModule === "PROCESSOS" ? sql`coalesce(s.title,d.title)` : sourceModule === "RH" ? sql`s.title` : sql`d.title`}),lower(${text.slice(0, 200)}))>0`;
    const count = await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total ${from} WHERE ${filter}`);
    const total = count.rows[0].total; const current = Math.max(1, Math.min(page, Math.max(1, Math.ceil(total / 20))));
    const rows = await database.execute<Pick<SourceRow, "id" | "title" | "versionId">>(sql`SELECT source.id,source.title,source."versionId" FROM (SELECT ${columns} ${from} WHERE ${filter}) source ORDER BY source.title,source.id LIMIT 20 OFFSET ${(current - 1) * 20}`);
    return { rows: rows.rows, total, page: current };
  } };
}
