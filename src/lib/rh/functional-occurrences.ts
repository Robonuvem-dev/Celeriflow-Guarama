import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { personnelActs } from "@/db/schema/personnel-records";
import { documents as documentTable } from "@/db/schema/registry";
import { findHrIntegrationEvent, lockPersonnel } from "@/db/repositories/personnel/integration";
import { requireEmploymentHolderHistory, requireEmploymentHistory, requireEmploymentRegime } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";

export const functionalOccurrenceInputSchema = z.object({ sourceKey: z.string().trim().min(1).max(140), contractId: z.string().min(1), type: z.enum(["ADVERTENCIA", "ELOGIO", "MULTA", "OUTRA"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(3).max(4000), notes: z.string().trim().max(4000).default(""), personnelActId: z.string().min(1), documentIds: z.array(z.string().min(1)).max(100), amount: z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/).optional() }).strict();

export async function assertPersonnelActNotIntegrated(tx: DatabaseTransaction, actId: string) {
  await tx.execute(sql`SELECT id FROM "PersonnelAct" WHERE id=${actId} FOR UPDATE`);
  const [linked] = await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "OCORRENCIA_FUNCIONAL_REGISTRADA"), sql`${hrIntegrationEvents.payload} #>> '{input,personnelActId}' = ${actId}`)).limit(1);
  if (linked) throw new Error("Ato com ocorrência funcional integrada exige correção compensatória; preserve o registro original.");
  const [lifecycle] = await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "EFEITO_FUNCIONAL_RESCISAO"), sql`${hrIntegrationEvents.payload}->'results' @> ${JSON.stringify([{ actId }])}::jsonb`)).limit(1);
  if (lifecycle) throw new Error("Ato com desligamento/reintegração integrada exige correção compensatória; preserve o registro original.");
}

export async function registerFunctionalOccurrence(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = functionalOccurrenceInputSchema.parse(raw);
  input.documentIds = [...new Set(input.documentIds)].sort();
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("Data civil da ocorrência inválida.");
  if (input.type === "MULTA" ? !input.amount || new Decimal(input.amount).lte(0) : input.amount !== undefined) throw new Error("Valor positivo é obrigatório somente para ocorrência de multa.");
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `OCCURRENCE:${input.sourceKey}`);
    const sourceKey = `OCORRENCIA:${input.sourceKey}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      if (JSON.stringify(functionalOccurrenceInputSchema.parse((previous.payload as { input: unknown }).input)) !== JSON.stringify(input)) throw new Error("Chave da ocorrência reutilizada com outros dados.");
      return previous;
    }
    const stored = await requireEmploymentHolderHistory(tx, input.contractId);
    await lockPersonnel(tx, `employee:${stored.employeeId}`);
    await lockPersonnel(tx, `contract:${stored.id}`);
    const current = await requireEmploymentHistory(tx, stored.id);
    const contract = resolveContractRevision(current, current.revisions, { start: date, end: date }).contract;
    if (contract.status !== "ATIVO" || date < contract.admittedAt || (contract.endsAt && date > contract.endsAt)) throw new Error("Ocorrência fora do período ativo do contrato.");
    await tx.execute(sql`SELECT id FROM "PersonnelAct" WHERE id=${input.personnelActId} FOR SHARE`);
    const [act] = await tx.select().from(personnelActs).where(eq(personnelActs.id, input.personnelActId)).limit(1);
    if (!act) throw new Error("Ato de pessoal não encontrado.");
    if (act.employeeId !== stored.employeeId || act.date.toISOString().slice(0, 10) > input.date) throw new Error("Ato deve pertencer ao titular e não ser posterior à ocorrência.");
    const documents = await tx.select({ id: documentTable.id, title: documentTable.title, documentType: documentTable.documentType, personId: documentTable.personId, companyId: documentTable.companyId, status: documentTable.status, validUntil: documentTable.validUntil, updatedAt: documentTable.updatedAt,
      healthClinicalDocument: sql<{ id: string } | null>`(SELECT jsonb_build_object('id',h.id) FROM "HealthClinicalDocument" h WHERE h."documentId"=${documentTable.id})`,
      healthStandardDocument: sql<{ id: string } | null>`(SELECT jsonb_build_object('id',h.id) FROM "HealthStandardDocument" h WHERE h."documentId"=${documentTable.id})`,
      sstCertificateDocument: sql<{ id: string } | null>`(SELECT jsonb_build_object('id',h.id) FROM "SstCertificateDocument" h WHERE h."documentId"=${documentTable.id})`,
    }).from(documentTable).where(inArray(documentTable.id, input.documentIds)).orderBy(asc(documentTable.id));
    if (documents.length !== input.documentIds.length || documents.some(document => document.companyId || (document.personId && document.personId !== stored.employee.personId) || document.healthClinicalDocument || document.healthStandardDocument || document.sstCertificateDocument)) throw new Error("Anexo ausente, de outro titular ou de origem clínica protegida; use documentos funcionais do GED.");
    const regime = await requireEmploymentRegime(tx, contract.regimeId);
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: regime.ruleSet.scope, eventType: "OCORRENCIA_FUNCIONAL_REGISTRADA", payload: { input, employeeId: stored.employeeId, personId: stored.employee.personId, contractVersion: contract.version, actorId, act, documents, affectsPayroll: false } });
  });
}

export async function cancelFunctionalOccurrence(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ occurrenceId: z.string().min(1), reason: z.string().trim().min(3).max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `OCCURRENCE_CANCEL:${input.occurrenceId}`);
    const [original] = await tx.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.id, input.occurrenceId)).limit(1);
    if (!original) throw new Error("Ocorrência funcional não encontrada.");
    if (original.eventType !== "OCORRENCIA_FUNCIONAL_REGISTRADA") throw new Error("Selecione uma ocorrência funcional original.");
    const sourceKey = `OCORRENCIA:CANCELAMENTO:${original.id}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      if ((previous.payload as { reason: string }).reason !== input.reason) throw new Error("Ocorrência cancelada com outro fundamento.");
      return previous;
    }
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: original.environment, eventType: "OCORRENCIA_FUNCIONAL_CANCELADA", payload: { occurrenceId: original.id, reason: input.reason, actorId } });
  });
}
