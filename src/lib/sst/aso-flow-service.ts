import { createHash } from "node:crypto";
import { z } from "zod";
import { and, asc, eq, gt, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstAsos } from "@/db/schema/sst-clinical";
import { sstAvailability, sstScheduleBlocks, sstAppointments } from "@/db/schema/sst-agenda";
import { vacations } from "@/db/schema/personnel-records";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { sstContextConnection, sstDatabase } from "./database";
import { AccessError, canPerformModuleOperation, assertBudgetUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { assertSstClinicalAccess } from "./access";
import { asoFlowSettings, secondVacationWarning } from "./aso-flow-policy";
import { sstCivilDate } from "./aso-policy";
import { availableSlots } from "./agenda-policy";
import { SstValidationError } from "./errors";

export async function saveAsoFlowSettings(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = asoFlowSettings.parse(raw);
  if (!canPerformModuleOperation(context.user, "SST", "update")) throw new AccessError("Permissão para configurar SST necessária.", 403);
  await assertSstClinicalAccess(context, input.budgetUnitId, true);
  await withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`INSERT INTO "SstAsoFlowSettings" ("budgetUnitId","suggestedResults","vacationWarningDays","updatedById") VALUES (${input.budgetUnitId},${sql.param(input.suggestedResults)}::text[],${input.vacationWarningDays},${context.user.id}) ON CONFLICT ("budgetUnitId") DO UPDATE SET "suggestedResults"=EXCLUDED."suggestedResults","vacationWarningDays"=EXCLUDED."vacationWarningDays","updatedById"=EXCLUDED."updatedById","updatedAt"=CURRENT_TIMESTAMP`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ASO_SETTINGS", targetId: input.budgetUnitId });
  });
  return input.budgetUnitId;
}
export async function registerVacationConcessionSource(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ vacationId: z.string().min(1), functionalPeriodId: z.string().min(1), budgetUnitId: z.string().min(1), expiresAt: sstCivilDate, sourceReference: z.string().trim().min(10).max(2000) }).parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("A origem e prazo concessivo exigem autorização RH.", 403);
  return withDatabaseTransaction(connection, async (tx) => {
    const active = await findModuleActivation(tx, "RH");
    if (active?.ativo === false) throw new SstValidationError("RH desativado.");
    const [vacation] = await tx.select().from(vacations).where(eq(vacations.id, input.vacationId));
    if (!vacation || input.expiresAt < vacation.acquisitionEnd) throw new SstValidationError("Férias ou prazo concessivo inválido.");
    const periods = await sstRows<{ id: string }>(tx, sql`SELECT id FROM "HrEmployeeFunctionalPeriod" WHERE id=${input.functionalPeriodId} AND "employeeId"=${vacation.employeeId} AND "budgetUnitId"=${input.budgetUnitId} AND NOT voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=${input.functionalPeriodId})`);
    if (!periods.length) throw new SstValidationError("Vínculo RH explícito inválido.");
    await tx.execute(sql`INSERT INTO "HrVacationConcessionSource" ("vacationId","budgetUnitId","functionalPeriodId","expiresAt","sourceReference","acquisitionStart","acquisitionEnd","createdById") VALUES (${vacation.id},${input.budgetUnitId},${input.functionalPeriodId},${input.expiresAt},${input.sourceReference},${vacation.acquisitionStart},${vacation.acquisitionEnd},${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HR_VACATION_CONCESSION_SOURCE", targetId: vacation.id });
    return vacation.id;
  });
}
export async function readAsoFollowUp(context: AppContext, asoId: string) {
  const database = sstDatabase(context);
  const [scope] = await database.select({ budgetUnitId: sstAsos.budgetUnitId }).from(sstAsos).where(eq(sstAsos.id, asoId));
  if (!scope) throw new SstValidationError("ASO não encontrado.");
  await assertSstClinicalAccess(context, scope.budgetUnitId);
  const [aso] = await database.select().from(sstAsos).where(eq(sstAsos.id, asoId));
  if (!aso) throw new SstValidationError("ASO não encontrado.");
  const [settings] = await sstRows<{ suggestedResults: string[]; vacationWarningDays: number }>(database, sql`SELECT "suggestedResults","vacationWarningDays" FROM "SstAsoFlowSettings" WHERE "budgetUnitId"=${aso.budgetUnitId}`);
  const corrections = (await sstRows<{ id: string; kind: string; reason: string; replacementAsoId: string | null; createdAt: string; requestHash: string }>(database, sql`SELECT * FROM "SstAsoCorrection" WHERE "asoId"=${asoId}`)).map(row => ({ ...row, createdAt: sstTimestamp(row.createdAt) }));
  const documents = await sstRows<{ id: string; documentId: string; kind: string; fileUrl: string }>(database, sql`SELECT l.id,l."documentId",l.kind,d."fileUrl" FROM "SstAsoDocument" l JOIN "Document" d ON d.id=l."documentId" WHERE l."asoId"=${asoId} ORDER BY l."createdAt",l.id`);
  const slots: { availabilityId: string; startsAt: string; unitName: string }[] = [];
  if (!corrections.length && settings?.suggestedResults.includes(aso.result)) {
    const windows = await database.select().from(sstAvailability).where(and(eq(sstAvailability.budgetUnitId, aso.budgetUnitId), eq(sstAvailability.professionalPersonId, aso.examinerPersonId), eq(sstAvailability.isActive, true), gt(sstAvailability.endsAt, new Date()))).orderBy(asc(sstAvailability.startsAt), asc(sstAvailability.id)).limit(20);
    for (const window of windows) {
      const blocks = await database.select().from(sstScheduleBlocks).where(eq(sstScheduleBlocks.availabilityId, window.id));
      const appointments = await database.select({ startsAt: sstAppointments.startsAt, endsAt: sstAppointments.endsAt }).from(sstAppointments).innerJoin(sstAvailability, eq(sstAvailability.id, sstAppointments.availabilityId)).where(and(ne(sstAppointments.status, "CANCELLED"), lt(sstAppointments.startsAt, window.endsAt), gt(sstAppointments.endsAt, window.startsAt), or(eq(sstAvailability.professionalPersonId, window.professionalPersonId), aso.employeeId ? eq(sstAppointments.employeeId, aso.employeeId) : undefined)));
      slots.push(...availableSlots(window, [...blocks, ...appointments]).filter((s) => s.startsAt > new Date()).slice(0, 5).map((s) => ({ availabilityId: window.id, startsAt: s.startsAt.toISOString(), unitName: window.unitName })));
      if (slots.length >= 10) break;
    }
  }
  let vacationWarning = null;
  let vacationSourceMissing = false;
  if (!corrections.length && aso.employeeId && aso.kind === "RETORNO_TRABALHO" && ["APTO", "APTO_RESTRICOES", "APTO_RECOMENDACOES"].includes(aso.result) && settings) {
    const periods = (await sstRows<{ id: string; acquisitionStart: string; acquisitionEnd: string; expiresAt: string }>(database, sql`SELECT v.id,v."acquisitionStart",v."acquisitionEnd",s."expiresAt" FROM "Vacation" v JOIN "HrVacationConcessionSource" s ON s."vacationId"=v.id AND s."budgetUnitId"=${aso.budgetUnitId} WHERE v."employeeId"=${aso.employeeId} AND v.status NOT IN ('Concluída','ConcluÃ­da') AND v."enjoymentEnd" IS NULL AND v."acquisitionStart"=s."acquisitionStart" AND v."acquisitionEnd"=s."acquisitionEnd" ORDER BY v."acquisitionStart",v.id`)).map(row => ({ ...row, acquisitionStart: sstTimestamp(row.acquisitionStart), acquisitionEnd: sstTimestamp(row.acquisitionEnd), expiresAt: sstTimestamp(row.expiresAt) }));
    const [{ total: count }] = await database.select({ total: sql<number>`count(*)::int` }).from(vacations).where(and(eq(vacations.employeeId, aso.employeeId), isNull(vacations.enjoymentEnd), notInArray(vacations.status, ["Concluída", "ConcluÃ­da"]), lte(vacations.acquisitionEnd, aso.performedAt)));
    vacationSourceMissing = count !== periods.filter((p) => p.acquisitionEnd <= aso.performedAt).length;
    if (!vacationSourceMissing) vacationWarning = secondVacationWarning(periods, aso.performedAt, settings.vacationWarningDays);
  }
  return { slots: slots.slice(0, 10), corrections, documents, vacationWarning, vacationSourceMissing };
}
export async function correctAso(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ asoId: z.string().min(1), kind: z.enum(["ANNULMENT", "RECTIFICATION"]), replacementAsoId: z.string().default(""), reason: z.string().trim().min(10).max(2000), submissionKey: z.uuid() }).parse(raw);
  if (!canPerformModuleOperation(context.user, "SST", "update")) throw new AccessError("Permissão de retificação necessária.", 403);
  const [scope] = await sstDatabase(context).select({ budgetUnitId: sstAsos.budgetUnitId }).from(sstAsos).where(eq(sstAsos.id, input.asoId));
  if (!scope) throw new SstValidationError("ASO não encontrado.");
  await assertSstClinicalAccess(context, scope.budgetUnitId, true);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_ASO_CORRECTION:${input.asoId}`}))`);
    const existing = await sstRows<{ id: string; requestHash: string; createdById: string }>(tx, sql`SELECT id,"requestHash","createdById" FROM "SstAsoCorrection" WHERE "asoId"=${input.asoId} OR id=${input.submissionKey}`);
    if (existing.length) {
      if (existing[0].id === input.submissionKey && existing[0].requestHash === hash && existing[0].createdById === context.user.id) return existing[0].id;
      throw new SstValidationError("ASO já corrigido ou submissão reutilizada. Corrija a versão sucessora.");
    }
    const [origin] = await tx.select().from(sstAsos).where(eq(sstAsos.id, input.asoId));
    if (!origin) throw new SstValidationError("ASO não encontrado.");
    if (input.kind === "RECTIFICATION") {
      const [replacement] = await tx.select().from(sstAsos).where(eq(sstAsos.id, input.replacementAsoId));
      if (!replacement || replacement.id === origin.id || replacement.personId !== origin.personId || replacement.employeeId !== origin.employeeId || replacement.budgetUnitId !== origin.budgetUnitId || replacement.createdAt < origin.createdAt) throw new SstValidationError("Retificação exige novo ASO emitido da mesma pessoa, vínculo e UG.");
      const invalid = await sstRows<{ id: string }>(tx, sql`SELECT id FROM "SstAsoCorrection" WHERE "asoId"=${replacement.id} OR "replacementAsoId"=${replacement.id}`);
      if (invalid.length) throw new SstValidationError("A versão sucessora já está corrigida ou vinculada.");
    } else if (input.replacementAsoId) throw new SstValidationError("Anulação não pode indicar sucessor.");
    await tx.execute(sql`INSERT INTO "SstAsoCorrection" (id,"asoId",kind,"replacementAsoId",reason,"requestHash","createdById") VALUES (${input.submissionKey},${origin.id},${input.kind},${input.replacementAsoId || null},${input.reason},${hash},${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ASO_CORRECTION", targetId: input.submissionKey });
    return input.submissionKey;
  });
}
