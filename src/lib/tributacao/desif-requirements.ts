import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import type { TaxActor } from "./index";
import { readManagedDesifInfraction } from "./desif-infraction-management";
import { insertActionAudit } from "@/db/repositories/tax-actions/registry";

export const desifAdministrativeStatuses = ["Início", "Lançado", "Homologado", "Defesa", "Recurso", "Finalizado", "Cancelado"] as const;
export const desifMetadataFields = [
  ["autoNumber", "Número do auto", "text"], ["autoDate", "Data do auto", "date"], ["autoTime", "Hora do auto", "time"],
  ["calendarYear", "Ano-calendário", "number"], ["finePercent", "Percentual de multa", "number"], ["fineReductionPercent", "Redução da multa (%)", "number"],
  ["tiafNumber", "Número do TIAF", "text"], ["tiafDate", "Data do TIAF", "date"], ["processNumber", "Número do processo", "text"], ["processDate", "Data do processo", "date"],
  ["orderNumber", "Número da ordem de fiscalização", "text"], ["orderDate", "Data da ordem", "date"],
  ["normativeNumber", "Número da instrução normativa", "text"], ["normativeDate", "Data da instrução normativa", "date"],
  ["analyzedDocuments", "Documentação analisada", "text"], ["taxableMatter", "Matéria tributável", "text"], ["calculationBasis", "Descrição da base de cálculo", "text"],
  ["rateReferences", "Referências sobre alíquota", "text"], ["legalAdditions", "Referências sobre acréscimos legais", "text"],
  ["responsibleDepartment", "Setor responsável", "text"], ["responsibleName", "Nome do responsável", "text"], ["responsiblePosition", "Cargo do responsável", "text"], ["responsibleRegistration", "Matrícula do responsável", "text"],
] as const;
export type DesifMetadata = { status?: string; [key: string]: string | undefined };
export async function readDesifMetadata(database: DatabaseExecutor, caseId: string): Promise<DesifMetadata> {
  const result = await database.execute<{ payload: DesifMetadata }>(sql`SELECT payload FROM "DesifFiscalEvent" WHERE "fiscalCaseId"=${caseId} AND "eventType"='CF28_METADATA' ORDER BY "createdAt" DESC,id DESC LIMIT 1`);
  return result.rows[0]?.payload ?? {};
}
export async function saveDesifMetadata(connection: DatabaseConnection, actor: TaxActor, caseId: string, form: FormData) {
  const status = z.enum(desifAdministrativeStatuses).parse(form.get("status"));
  const reason = z.string().trim().min(10).max(2000).parse(form.get("reason"));
  const data: Record<string, string> = { status, updatedAt: new Date().toISOString() };
  for (const [name, , type] of desifMetadataFields) {
    const value = z.string().trim().max(4000).parse(String(form.get(name) ?? ""));
    if (value && type === "date") z.iso.date().parse(value);
    if (value && type === "time") z.string().regex(/^\d{2}:\d{2}$/).parse(value);
    if (value && type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || (name === "calendarYear" ? !Number.isInteger(number) || number < 1900 || number > 9999 : number > 100)) throw new Error("Ano ou percentual inválido.");
    }
    data[name] = value;
  }
  return withDatabaseTransaction(connection, async tx => {
    const row = await readManagedDesifInfraction(tx, actor, caseId, true);
    await tx.execute(sql`INSERT INTO "DesifFiscalEvent" (id,"fiscalCaseId","eventType",description,payload,"actorUsuarioId","createdAt") VALUES (gen_random_uuid()::text,${caseId},'CF28_METADATA',${reason},${JSON.stringify(data)}::jsonb,${actor.usuarioId},clock_timestamp())`);
    await insertActionAudit(tx, { action: "DESIF_METADATA_UPDATED", entityType: "Infraction", entityId: row.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId ?? null, payload: { caseId, status, budgetUnitId: row.scope.budgetUnitId, reason } });
  });
}
export type DesifReportFilter = { institution?: string; module?: string; start?: string; end?: string; status?: string; number?: string; year?: string };
export async function readDesifManagement(database: DatabaseExecutor, filter: DesifReportFilter) {
  const start = filter.start ? z.iso.date().parse(filter.start) : "";
  const end = filter.end ? z.iso.date().parse(filter.end) : "";
  const [institutions, batches, cases] = await Promise.all([
    database.execute<{ id: string; name: string }>(sql`SELECT id,name FROM "DesifFinancialInstitution" ORDER BY name`),
    database.execute<{ id: string; institution: string; competence: string; moduleType: string; receivedAt: string; processedAt: string | null; receipt: string | null; status: string; fileName: string; version: string }>(sql`SELECT b.id,i.name AS institution,b.competence,b."moduleType",b."receivedAt",b."processedAt",b."receiptNumber" AS receipt,b.status,b."fileName",b."abrasfVersion" AS version FROM "DesifImportBatch" b JOIN "DesifFinancialInstitution" i ON i.id=b."institutionId" WHERE (${filter.institution || ""}='' OR b."institutionId"=${filter.institution || ""}) AND (${filter.module || ""}='' OR b."moduleType"=${filter.module || ""}) AND (${start}='' OR b."receivedAt">=NULLIF(${start},'')::date) AND (${end}='' OR b."receivedAt"<NULLIF(${end},'')::date+INTERVAL '1 day') ORDER BY b."receivedAt" DESC LIMIT 500`),
    database.execute<{ id: string; institution: string; competence: string; autoId: string | null; amount: string | null; createdAt: string; metadata: DesifMetadata; nativeStatus: string | null }>(sql`SELECT c.id,n.name AS institution,c.competence,c."infractionId" AS "autoId",COALESCE(i."penaltyValueDecimal",i."penaltyValue"::numeric)::text AS amount,c."createdAt",i.status AS "nativeStatus",COALESCE(m.payload,'{}'::jsonb) AS metadata FROM "DesifFiscalCase" c JOIN "DesifFinancialInstitution" n ON n.id=c."institutionId" LEFT JOIN "Infraction" i ON i.id=c."infractionId" LEFT JOIN LATERAL (SELECT e.payload FROM "DesifFiscalEvent" e WHERE e."fiscalCaseId"=c.id AND e."eventType"='CF28_METADATA' ORDER BY e."createdAt" DESC,e.id DESC LIMIT 1) m ON true WHERE (${filter.institution || ""}='' OR c."institutionId"=${filter.institution || ""}) AND (${filter.status || ""}='' OR m.payload->>'status'=${filter.status || ""}) AND (${filter.number || ""}='' OR m.payload->>'autoNumber' ILIKE ${`%${filter.number || ""}%`} OR i.id=${filter.number || ""}) AND (${filter.year || ""}='' OR COALESCE(NULLIF(m.payload->>'calendarYear',''),left(c.competence,4))=${filter.year || ""}) AND (${start}='' OR COALESCE(NULLIF(m.payload->>'autoDate','')::date,c."createdAt"::date)>=NULLIF(${start},'')::date) AND (${end}='' OR COALESCE(NULLIF(m.payload->>'autoDate','')::date,c."createdAt"::date)<=NULLIF(${end},'')::date) ORDER BY c."createdAt" DESC LIMIT 500`),
  ]);
  return { institutions: institutions.rows, batches: batches.rows, cases: cases.rows };
}
