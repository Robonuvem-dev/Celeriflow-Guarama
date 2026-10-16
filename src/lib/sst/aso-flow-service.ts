import { createHash } from "node:crypto";
import { z } from "zod";
import { AccessError, canPerformModuleOperation, assertBudgetUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertSstClinicalAccess } from "./access";
import { asoFlowSettings, secondVacationWarning } from "./aso-flow-policy";
import { sstCivilDate } from "./aso-policy";
import { availableSlots } from "./agenda-policy";
import { SstValidationError } from "./errors";

export async function saveAsoFlowSettings(context: AppContext, raw: unknown) {
  const input = asoFlowSettings.parse(raw);
  if (!canPerformModuleOperation(context.user, "SST", "update")) throw new AccessError("Permissão para configurar SST necessária.", 403);
  await assertSstClinicalAccess(context, input.budgetUnitId, true);
  await context.prisma.$executeRaw`INSERT INTO "SstAsoFlowSettings" ("budgetUnitId","suggestedResults","vacationWarningDays","updatedById") VALUES (${input.budgetUnitId},${input.suggestedResults}::text[],${input.vacationWarningDays},${context.user.id}) ON CONFLICT ("budgetUnitId") DO UPDATE SET "suggestedResults"=EXCLUDED."suggestedResults","vacationWarningDays"=EXCLUDED."vacationWarningDays","updatedById"=EXCLUDED."updatedById","updatedAt"=CURRENT_TIMESTAMP`;
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ASO_SETTINGS", targetId: input.budgetUnitId });
  return input.budgetUnitId;
}
export async function registerVacationConcessionSource(context: AppContext, raw: unknown) {
  const input = z.object({ vacationId: z.string().min(1), functionalPeriodId: z.string().min(1), budgetUnitId: z.string().min(1), expiresAt: sstCivilDate, sourceReference: z.string().trim().min(10).max(2000) }).parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("A origem e prazo concessivo exigem autorização RH.", 403);
  return context.prisma.$transaction(async (tx) => {
    const active = await tx.configuracaoModulo.findUnique({ where: { codigo: "RH" } });
    if (active?.ativo === false) throw new SstValidationError("RH desativado.");
    const vacation = await tx.vacation.findUnique({ where: { id: input.vacationId } });
    if (!vacation || input.expiresAt < vacation.acquisitionEnd) throw new SstValidationError("Férias ou prazo concessivo inválido.");
    const periods = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "HrEmployeeFunctionalPeriod" WHERE id=${input.functionalPeriodId} AND "employeeId"=${vacation.employeeId} AND "budgetUnitId"=${input.budgetUnitId} AND NOT voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=${input.functionalPeriodId})`;
    if (!periods.length) throw new SstValidationError("Vínculo RH explícito inválido.");
    await tx.$executeRaw`INSERT INTO "HrVacationConcessionSource" ("vacationId","budgetUnitId","functionalPeriodId","expiresAt","sourceReference","acquisitionStart","acquisitionEnd","createdById") VALUES (${vacation.id},${input.budgetUnitId},${input.functionalPeriodId},${input.expiresAt},${input.sourceReference},${vacation.acquisitionStart},${vacation.acquisitionEnd},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HR_VACATION_CONCESSION_SOURCE", targetId: vacation.id });
    return vacation.id;
  });
}
export async function readAsoFollowUp(context: AppContext, asoId: string) {
  const scope = await context.prisma.sstAso.findUnique({ where: { id: asoId }, select: { budgetUnitId: true } });
  if (!scope) throw new SstValidationError("ASO não encontrado.");
  await assertSstClinicalAccess(context, scope.budgetUnitId);
  const aso = await context.prisma.sstAso.findUniqueOrThrow({ where: { id: asoId } });
  const [settings] = await context.prisma.$queryRaw<{ suggestedResults: string[]; vacationWarningDays: number }[]>`SELECT "suggestedResults","vacationWarningDays" FROM "SstAsoFlowSettings" WHERE "budgetUnitId"=${aso.budgetUnitId}`;
  const corrections = await context.prisma.$queryRaw<{ id: string; kind: string; reason: string; replacementAsoId: string | null; createdAt: Date; requestHash: string }[]>`SELECT * FROM "SstAsoCorrection" WHERE "asoId"=${asoId}`;
  const documents = await context.prisma.$queryRaw<{ id: string; documentId: string; kind: string; fileUrl: string }[]>`SELECT l.id,l."documentId",l.kind,d."fileUrl" FROM "SstAsoDocument" l JOIN "Document" d ON d.id=l."documentId" WHERE l."asoId"=${asoId} ORDER BY l."createdAt",l.id`;
  const slots: { availabilityId: string; startsAt: string; unitName: string }[] = [];
  if (!corrections.length && settings?.suggestedResults.includes(aso.result)) {
    const windows = await context.prisma.sstScheduleAvailability.findMany({ where: { budgetUnitId: aso.budgetUnitId, professionalPersonId: aso.examinerPersonId, isActive: true, endsAt: { gt: new Date() } }, take: 20, orderBy: [{ startsAt: "asc" }, { id: "asc" }], include: { blocks: true } });
    for (const window of windows) {
      const appointments = await context.prisma.sstAppointment.findMany({ where: { status: { not: "CANCELLED" }, startsAt: { lt: window.endsAt }, endsAt: { gt: window.startsAt }, OR: [{ availability: { professionalPersonId: window.professionalPersonId } }, ...(aso.employeeId ? [{ employeeId: aso.employeeId }] : [])] } });
      slots.push(...availableSlots(window, [...window.blocks, ...appointments]).filter((s) => s.startsAt > new Date()).slice(0, 5).map((s) => ({ availabilityId: window.id, startsAt: s.startsAt.toISOString(), unitName: window.unitName })));
      if (slots.length >= 10) break;
    }
  }
  let vacationWarning = null;
  let vacationSourceMissing = false;
  if (!corrections.length && aso.employeeId && aso.kind === "RETORNO_TRABALHO" && ["APTO", "APTO_RESTRICOES", "APTO_RECOMENDACOES"].includes(aso.result) && settings) {
    const periods = await context.prisma.$queryRaw<{ id: string; acquisitionStart: Date; acquisitionEnd: Date; expiresAt: Date }[]>`SELECT v.id,v."acquisitionStart",v."acquisitionEnd",s."expiresAt" FROM "Vacation" v JOIN "HrVacationConcessionSource" s ON s."vacationId"=v.id AND s."budgetUnitId"=${aso.budgetUnitId} WHERE v."employeeId"=${aso.employeeId} AND v.status NOT IN ('Concluída','ConcluÃ­da') AND v."enjoymentEnd" IS NULL AND v."acquisitionStart"=s."acquisitionStart" AND v."acquisitionEnd"=s."acquisitionEnd" ORDER BY v."acquisitionStart",v.id`;
    const count = await context.prisma.vacation.count({ where: { employeeId: aso.employeeId, enjoymentEnd: null, status: { notIn: ["Concluída", "ConcluÃ­da"] }, acquisitionEnd: { lte: aso.performedAt } } });
    vacationSourceMissing = count !== periods.filter((p) => p.acquisitionEnd <= aso.performedAt).length;
    if (!vacationSourceMissing) vacationWarning = secondVacationWarning(periods, aso.performedAt, settings.vacationWarningDays);
  }
  return { slots: slots.slice(0, 10), corrections, documents, vacationWarning, vacationSourceMissing };
}
export async function correctAso(context: AppContext, raw: unknown) {
  const input = z.object({ asoId: z.string().min(1), kind: z.enum(["ANNULMENT", "RECTIFICATION"]), replacementAsoId: z.string().default(""), reason: z.string().trim().min(10).max(2000), submissionKey: z.uuid() }).parse(raw);
  if (!canPerformModuleOperation(context.user, "SST", "update")) throw new AccessError("Permissão de retificação necessária.", 403);
  const scope = await context.prisma.sstAso.findUnique({ where: { id: input.asoId }, select: { budgetUnitId: true } });
  if (!scope) throw new SstValidationError("ASO não encontrado.");
  await assertSstClinicalAccess(context, scope.budgetUnitId, true);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ASO_CORRECTION:${input.asoId}`}))`;
    const existing = await tx.$queryRaw<{ id: string; requestHash: string; createdById: string }[]>`SELECT id,"requestHash","createdById" FROM "SstAsoCorrection" WHERE "asoId"=${input.asoId} OR id=${input.submissionKey}`;
    if (existing.length) {
      if (existing[0].id === input.submissionKey && existing[0].requestHash === hash && existing[0].createdById === context.user.id) return existing[0].id;
      throw new SstValidationError("ASO já corrigido ou submissão reutilizada. Corrija a versão sucessora.");
    }
    const origin = await tx.sstAso.findUniqueOrThrow({ where: { id: input.asoId } });
    if (input.kind === "RECTIFICATION") {
      const replacement = await tx.sstAso.findUnique({ where: { id: input.replacementAsoId } });
      if (!replacement || replacement.id === origin.id || replacement.personId !== origin.personId || replacement.employeeId !== origin.employeeId || replacement.budgetUnitId !== origin.budgetUnitId || replacement.createdAt < origin.createdAt) throw new SstValidationError("Retificação exige novo ASO emitido da mesma pessoa, vínculo e UG.");
      const invalid = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SstAsoCorrection" WHERE "asoId"=${replacement.id} OR "replacementAsoId"=${replacement.id}`;
      if (invalid.length) throw new SstValidationError("A versão sucessora já está corrigida ou vinculada.");
    } else if (input.replacementAsoId) throw new SstValidationError("Anulação não pode indicar sucessor.");
    await tx.$executeRaw`INSERT INTO "SstAsoCorrection" (id,"asoId",kind,"replacementAsoId",reason,"requestHash","createdById") VALUES (${input.submissionKey},${origin.id},${input.kind},${input.replacementAsoId || null},${input.reason},${hash},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ASO_CORRECTION", targetId: input.submissionKey });
    return input.submissionKey;
  });
}
