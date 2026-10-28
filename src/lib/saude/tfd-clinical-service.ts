import { z } from "zod";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import * as t from "@/db/schema/health-tfd";
import { healthProfessionals, healthProfessionalAssignments } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { medicalRecords } from "@/db/schema/health-care";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { people } from "@/db/schema/people";
import { activeTfdPassengerWhere, lockTfdTrips, readTfdRequest, requiredTfdRecord, tfdSnapshot } from "@/db/repositories/health-tfd/records";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import type { HealthTfdContext as AppContext } from "@/lib/contracts/health-tfd";

const id = z.string().trim().min(1).max(200);
const note = z.string().trim().min(3).max(12000);
const optionalId = id.nullable().default(null);
const reportSchema = z.object({
  requestId: id, expectedVersion: z.number().int().min(0), medicalRecordId: optionalId,
  professionalId: id, procedureId: optionalId, diagnosis: note,
  diagnosticCode: z.string().trim().max(30).nullable().default(null),
  clinicalHistory: note, examinations: note, treatment: note,
  localTreatmentUnavailableReason: note, transportType: z.enum(["TERRESTRE", "AEREO", "FLUVIAL", "SANITARIO", "OUTRO"]),
  transportJustification: note, companionRequired: z.boolean(),
  companionJustification: z.string().trim().max(4000).nullable().default(null), reason: note,
}).strict();

export async function lockTfdRequest(tx: DatabaseTransaction, requestId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_TFD_REQUEST:${requestId}`}))`);
}

export async function tfdRequestForActor(tx: DatabaseExecutor, context: AppContext, requestId: string) {
  const request = requiredTfdRecord(await readTfdRequest(tx, requestId));
  if (request.originUnitId) assertHealthUnitAccess(context.user, request.originUnitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Solicitação TFD sem unidade de origem acessível.");
  return request;
}

export async function saveTfdClinicalReport(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = reportSchema.parse(raw);
  if (input.companionRequired && !input.companionJustification?.trim()) throw new Error("Justifique a necessidade de acompanhante.");
  return withDatabaseTransaction(connection, async tx => {
    await lockTfdRequest(tx, input.requestId);
    const request = await tfdRequestForActor(tx, context, input.requestId);
    if (!["SOLICITADA", "GLOSADA", "ALTERACAO"].includes(request.status)) throw new Error("O laudo só pode ser alterado antes da aprovação/autorização.");
    const previous = request.clinicalReport;
    if ((previous?.version || 0) !== input.expectedVersion) throw new Error("Laudo alterado por outra sessão. Atualize antes de salvar.");
    const [professional] = await tx.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId, councilName: healthProfessionals.councilName, councilNumber: healthProfessionals.councilNumber, cns: healthProfessionals.cns, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.id, input.professionalId), eq(healthProfessionals.employeeId, context.user.employeeId || "__SEM_PROFISSIONAL__"), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1);
    if (!professional) throw new Error("A emissão exige o profissional de Saúde autenticado responsável pelo laudo.");
    if (!professional.employee.name?.trim()) throw new Error("Complete o nome do profissional no cadastro de origem antes de emitir o laudo.");
    if (request.originUnitId && professional.unitId !== request.originUnitId && !(await tx.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.unitId, request.originUnitId), eq(healthProfessionalAssignments.isActive, true), or(isNull(healthProfessionalAssignments.validFrom), lte(healthProfessionalAssignments.validFrom, new Date())), or(isNull(healthProfessionalAssignments.validUntil), gte(healthProfessionalAssignments.validUntil, new Date())))).limit(1))[0]) throw new Error("Profissional sem vínculo vigente na unidade solicitante.");
    if (input.medicalRecordId && !(await tx.select({ id: medicalRecords.id }).from(medicalRecords).where(and(eq(medicalRecords.id, input.medicalRecordId), eq(medicalRecords.patientId, request.patientId), eq(medicalRecords.professionalId, professional.id), request.originUnitId ? eq(medicalRecords.unitId, request.originUnitId) : undefined)).limit(1))[0]) throw new Error("Prontuário não corresponde ao paciente, profissional e unidade do laudo.");
    if (input.procedureId && !(await tx.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(eq(healthSusProcedures.id, input.procedureId)).limit(1))[0]) throw new Error("Procedimento não encontrado no catálogo SUS.");
    const { requestId, expectedVersion, reason, ...clinical } = input;
    const version = expectedVersion + 1;
    const values = { ...clinical, version,
      patientSnapshot: tfdSnapshot({ id: request.patientId, fullName: request.patient.person.fullName, cpf: request.patient.person.cpf, birthDate: request.patient.person.birthDate, cns: request.patient.cns, originUnitName: request.originUnit?.name, destination: request.destination }),
      professionalSnapshot: { id: professional.id, name: professional.employee.name, councilName: professional.councilName, councilNumber: professional.councilNumber, cns: professional.cns },
    };
    const report = previous
      ? requiredTfdRecord((await tx.update(t.healthTfdClinicalReports).set(values).where(eq(t.healthTfdClinicalReports.id, previous.id)).returning())[0])
      : requiredTfdRecord((await tx.insert(t.healthTfdClinicalReports).values({ ...values, requestId, createdByUsuarioId: context.user.id }).returning())[0]);
    await tx.insert(t.healthTfdReportRevisions).values({ reportId: report.id, version, snapshot: tfdSnapshot(report), reason, actorUsuarioId: context.user.id });
    await tx.update(t.healthTfdRequests).set({ status: "SOLICITADA" }).where(eq(t.healthTfdRequests.id, requestId));
    await tx.insert(t.healthTfdRequestEvents).values({ requestId, eventType: previous ? "LAUDO_ALTERADO" : "LAUDO_INCLUIDO", fromStatus: request.status, toStatus: "SOLICITADA", reportVersion: version, reason, actorUsuarioId: context.user.id });
    return { id: report.id, requestId, version };
  });
}

export async function addTfdReportSupplement(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: id, narrative: note }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockTfdRequest(tx, input.requestId);
    const request = await tfdRequestForActor(tx, context, input.requestId);
    if (!request.clinicalReport) throw new Error("Inclua o laudo antes de registrar complementos.");
    if (["CANCELADA", "ARQUIVADA"].includes(request.status)) throw new Error("Processo encerrado não recebe novos complementos.");
    const supplement = requiredTfdRecord((await tx.insert(t.healthTfdReportSupplements).values({ reportId: request.clinicalReport.id, reportVersion: request.clinicalReport.version, narrative: input.narrative, actorUsuarioId: context.user.id }).returning({ id: t.healthTfdReportSupplements.id }))[0]);
    await tx.insert(t.healthTfdRequestEvents).values({ requestId: request.id, eventType: "COMPLEMENTO", fromStatus: request.status, toStatus: request.status, reportVersion: request.clinicalReport.version, reason: input.narrative, actorUsuarioId: context.user.id });
    return { id: supplement.id };
  });
}

export async function transitionTfdClinicalRequest(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: id, status: z.enum(["APROVADA", "GLOSADA", "ALTERACAO", "NEGADA", "ARQUIVADA", "CANCELADA"]), reason: note }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockTfdRequest(tx, input.requestId);
    const request = await tfdRequestForActor(tx, context, input.requestId);
    if (!request.clinicalReport) throw new Error("Inclua o laudo clínico antes de decidir o processo.");
    const allowed: Record<string, string[]> = {
      SOLICITADA: ["APROVADA", "GLOSADA", "ALTERACAO", "NEGADA", "CANCELADA"],
      GLOSADA: ["ALTERACAO", "NEGADA", "ARQUIVADA", "CANCELADA"],
      ALTERACAO: ["NEGADA", "ARQUIVADA", "CANCELADA"],
      APROVADA: ["ALTERACAO", "CANCELADA"], AUTORIZADA: ["CANCELADA"],
      NEGADA: ["ARQUIVADA"], CANCELADA: ["ARQUIVADA"], CONCLUIDA: ["ARQUIVADA"],
    };
    if (!allowed[request.status]?.includes(input.status)) throw new Error(`Trâmite de ${request.status} para ${input.status} não permitido.`);
    if (input.status === "CANCELADA") {
      // Lock linked trips in the same ordering used by passenger operations before checking their state.
      const passengers = await tx.select({ tripId: t.healthTfdPassengers.tripId }).from(t.healthTfdPassengers).where(eq(t.healthTfdPassengers.tfdRequestId, request.id));
      await lockTfdTrips(tx, passengers.map(p => p.tripId));
      if ((await tx.select({ id: t.healthTfdPassengers.id }).from(t.healthTfdPassengers).innerJoin(t.healthTfdTrips, eq(t.healthTfdTrips.id, t.healthTfdPassengers.tripId)).where(and(eq(t.healthTfdPassengers.tfdRequestId, request.id), sql`${t.healthTfdTrips.status} <> 'CANCELADA'`, activeTfdPassengerWhere)).limit(1))[0]) throw new Error("Remova os passageiros por dupla custódia ou cancele a viagem antes de cancelar o tratamento.");
      await tx.update(t.healthTfdBenefits).set({ status: "CANCELADO" }).where(and(eq(t.healthTfdBenefits.requestId, request.id), inArray(t.healthTfdBenefits.status, ["SOLICITADO", "AUTORIZADO"])));
    }
    await tx.update(t.healthTfdRequests).set({ status: input.status }).where(eq(t.healthTfdRequests.id, request.id));
    await tx.insert(t.healthTfdRequestEvents).values({ requestId: request.id, eventType: "DECISAO", fromStatus: request.status, toStatus: input.status, reportVersion: request.clinicalReport.version, reason: input.reason, actorUsuarioId: context.user.id });
    return { id: request.id, status: input.status };
  });
}

export async function requestTfdBenefit(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: id, kind: z.enum(["PASSAGEM", "ALIMENTACAO", "HOSPEDAGEM", "OUTRO"]), description: note, quantity: z.number().int().positive().max(10000), unitValue: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable() }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockTfdRequest(tx, input.requestId);
    const request = await tfdRequestForActor(tx, context, input.requestId);
    if (!request.clinicalReport || request.status !== "AUTORIZADA") throw new Error("Benefícios exigem laudo e tratamento autorizado.");
    const benefit = requiredTfdRecord((await tx.insert(t.healthTfdBenefits).values({ ...input, unitValue: input.unitValue === null ? null : new Decimal(input.unitValue), reportVersion: request.clinicalReport.version, createdByUsuarioId: context.user.id }).returning({ id: t.healthTfdBenefits.id }))[0]);
    await tx.insert(t.healthTfdRequestEvents).values({ requestId: request.id, eventType: "BENEFICIO_SOLICITADO", fromStatus: request.status, toStatus: request.status, reportVersion: request.clinicalReport.version, reason: `${benefit.id} · ${input.description} · quantidade ${input.quantity}`, actorUsuarioId: context.user.id });
    return { id: benefit.id };
  });
}

export async function transitionTfdBenefit(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ benefitId: id, status: z.enum(["AUTORIZADO", "ENTREGUE", "CANCELADO"]), reason: note, receivedByPersonId: optionalId, deliveryReceipt: z.string().trim().max(2000).nullable().default(null) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const existing = requiredTfdRecord((await tx.select({ requestId: t.healthTfdBenefits.requestId }).from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.id, input.benefitId)).limit(1))[0]);
    await lockTfdRequest(tx, existing.requestId);
    const request = await tfdRequestForActor(tx, context, existing.requestId);
    const benefit = requiredTfdRecord((await tx.select().from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.id, input.benefitId)).limit(1))[0]);
    const allowed: Record<string, string[]> = { SOLICITADO: ["AUTORIZADO", "CANCELADO"], AUTORIZADO: ["ENTREGUE", "CANCELADO"] };
    if (!allowed[benefit.status]?.includes(input.status)) throw new Error("Transição de benefício não permitida ou já realizada.");
    if (input.status !== "CANCELADO" && (request.status !== "AUTORIZADA" || benefit.reportVersion !== request.clinicalReport?.version)) throw new Error("Tratamento ou versão do laudo não está autorizado para este benefício.");
    if (input.status === "ENTREGUE" && (!input.receivedByPersonId || !input.deliveryReceipt || !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, input.receivedByPersonId), eq(people.status, "Ativo"))).limit(1))[0])) throw new Error("Informe a pessoa recebedora cadastrada e o comprovante de entrega.");
    const result = requiredTfdRecord((await tx.update(t.healthTfdBenefits).set({
      status: input.status,
      ...(input.status === "AUTORIZADO" ? { authorizedAt: new Date(), authorizedByUsuarioId: context.user.id } : {}),
      ...(input.status === "ENTREGUE" ? { deliveredAt: new Date(), deliveredByUsuarioId: context.user.id, receivedByPersonId: input.receivedByPersonId, deliveryReceipt: input.deliveryReceipt } : {}),
    }).where(eq(t.healthTfdBenefits.id, benefit.id)).returning({ id: t.healthTfdBenefits.id, status: t.healthTfdBenefits.status }))[0]);
    await tx.insert(t.healthTfdRequestEvents).values({ requestId: request.id, eventType: `BENEFICIO_${input.status}`, fromStatus: request.status, toStatus: request.status, reportVersion: benefit.reportVersion, reason: `${benefit.id} · ${input.reason}`, actorUsuarioId: context.user.id });
    return { id: result.id, status: result.status };
  });
}
