import { z } from "zod";
import { Prisma } from "@prisma/client";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

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

export async function lockTfdRequest(tx: Prisma.TransactionClient, requestId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_TFD_REQUEST:${requestId}`}))`;
}

export async function tfdRequestForActor(tx: Prisma.TransactionClient, context: AppContext, requestId: string) {
  const request = await tx.healthTfdRequest.findUniqueOrThrow({ where: { id: requestId }, include: { patient: { include: { person: true } }, originUnit: true, clinicalReport: true } });
  if (request.originUnitId) assertHealthUnitAccess(context.user, request.originUnitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Solicitação TFD sem unidade de origem acessível.");
  return request;
}

export async function saveTfdClinicalReport(context: AppContext, raw: unknown) {
  const input = reportSchema.parse(raw);
  if (input.companionRequired && !input.companionJustification?.trim()) throw new Error("Justifique a necessidade de acompanhante.");
  return context.prisma.$transaction(async tx => {
    await lockTfdRequest(tx, input.requestId);
    const request = await tfdRequestForActor(tx, context, input.requestId);
    if (!["SOLICITADA", "GLOSADA", "ALTERACAO"].includes(request.status)) throw new Error("O laudo só pode ser alterado antes da aprovação/autorização.");
    const previous = request.clinicalReport;
    if ((previous?.version || 0) !== input.expectedVersion) throw new Error("Laudo alterado por outra sessão. Atualize antes de salvar.");
    const professional = await tx.healthProfessional.findFirst({ where: { id: input.professionalId, employeeId: context.user.employeeId || "__SEM_PROFISSIONAL__", isActive: true, employee: { isActive: true } }, include: { employee: { select: { name: true } } } });
    if (!professional) throw new Error("A emissão exige o profissional de Saúde autenticado responsável pelo laudo.");
    if (!professional.employee.name?.trim()) throw new Error("Complete o nome do profissional no cadastro de origem antes de emitir o laudo.");
    if (request.originUnitId && professional.unitId !== request.originUnitId && !await tx.healthProfessionalAssignment.count({ where: { professionalId: professional.id, unitId: request.originUnitId, isActive: true, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }] } })) throw new Error("Profissional sem vínculo vigente na unidade solicitante.");
    if (input.medicalRecordId && !await tx.medicalRecord.count({ where: { id: input.medicalRecordId, patientId: request.patientId, professionalId: professional.id, ...(request.originUnitId ? { unitId: request.originUnitId } : {}) } })) throw new Error("Prontuário não corresponde ao paciente, profissional e unidade do laudo.");
    if (input.procedureId && !await tx.healthSusProcedure.count({ where: { id: input.procedureId } })) throw new Error("Procedimento não encontrado no catálogo SUS.");
    const { requestId, expectedVersion, reason, ...clinical } = input;
    const version = expectedVersion + 1;
    const values = { ...clinical, version,
      patientSnapshot: JSON.parse(JSON.stringify({ id: request.patientId, fullName: request.patient.person.fullName, cpf: request.patient.person.cpf, birthDate: request.patient.person.birthDate, cns: request.patient.cns, originUnitName: request.originUnit?.name, destination: request.destination })),
      professionalSnapshot: { id: professional.id, name: professional.employee.name, councilName: professional.councilName, councilNumber: professional.councilNumber, cns: professional.cns },
    };
    const report = previous
      ? await tx.healthTfdClinicalReport.update({ where: { id: previous.id }, data: values })
      : await tx.healthTfdClinicalReport.create({ data: { ...values, requestId, createdByUsuarioId: context.user.id } });
    await tx.healthTfdReportRevision.create({ data: { reportId: report.id, version, snapshot: JSON.parse(JSON.stringify(report)), reason, actorUsuarioId: context.user.id } });
    await tx.healthTfdRequest.update({ where: { id: requestId }, data: { status: "SOLICITADA" } });
    await tx.healthTfdRequestEvent.create({ data: { requestId, eventType: previous ? "LAUDO_ALTERADO" : "LAUDO_INCLUIDO", fromStatus: request.status, toStatus: "SOLICITADA", reportVersion: version, reason, actorUsuarioId: context.user.id } });
    return { id: report.id, requestId, version };
  });
}

export async function addTfdReportSupplement(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: id, narrative: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await lockTfdRequest(tx, input.requestId);
    const request = await tfdRequestForActor(tx, context, input.requestId);
    if (!request.clinicalReport) throw new Error("Inclua o laudo antes de registrar complementos.");
    if (["CANCELADA", "ARQUIVADA"].includes(request.status)) throw new Error("Processo encerrado não recebe novos complementos.");
    const supplement = await tx.healthTfdReportSupplement.create({ data: { reportId: request.clinicalReport.id, reportVersion: request.clinicalReport.version, narrative: input.narrative, actorUsuarioId: context.user.id } });
    await tx.healthTfdRequestEvent.create({ data: { requestId: request.id, eventType: "COMPLEMENTO", fromStatus: request.status, toStatus: request.status, reportVersion: request.clinicalReport.version, reason: input.narrative, actorUsuarioId: context.user.id } });
    return { id: supplement.id };
  });
}

export async function transitionTfdClinicalRequest(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: id, status: z.enum(["APROVADA", "GLOSADA", "ALTERACAO", "NEGADA", "ARQUIVADA", "CANCELADA"]), reason: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
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
      const passengers = await tx.healthTfdPassenger.findMany({ where: { tfdRequestId: request.id }, select: { tripId: true } });
      for (const tripId of [...new Set(passengers.map(p => p.tripId))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tripId}))`;
      if (await tx.healthTfdPassenger.count({ where: { tfdRequestId: request.id, trip: { status: { not: "CANCELADA" } }, OR: [{ healthTfdPassengerRemoval: null }, { healthTfdPassengerRemoval: { is: { status: { not: "Confirmada" } } } }] } })) throw new Error("Remova os passageiros por dupla custódia ou cancele a viagem antes de cancelar o tratamento.");
      await tx.healthTfdBenefit.updateMany({ where: { requestId: request.id, status: { in: ["SOLICITADO", "AUTORIZADO"] } }, data: { status: "CANCELADO" } });
    }
    await tx.healthTfdRequest.update({ where: { id: request.id }, data: { status: input.status } });
    await tx.healthTfdRequestEvent.create({ data: { requestId: request.id, eventType: "DECISAO", fromStatus: request.status, toStatus: input.status, reportVersion: request.clinicalReport.version, reason: input.reason, actorUsuarioId: context.user.id } });
    return { id: request.id, status: input.status };
  });
}

export async function requestTfdBenefit(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: id, kind: z.enum(["PASSAGEM", "ALIMENTACAO", "HOSPEDAGEM", "OUTRO"]), description: note, quantity: z.number().int().positive().max(10000), unitValue: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await lockTfdRequest(tx, input.requestId);
    const request = await tfdRequestForActor(tx, context, input.requestId);
    if (!request.clinicalReport || request.status !== "AUTORIZADA") throw new Error("Benefícios exigem laudo e tratamento autorizado.");
    const benefit = await tx.healthTfdBenefit.create({ data: { ...input, unitValue: input.unitValue === null ? null : new Prisma.Decimal(input.unitValue), reportVersion: request.clinicalReport.version, createdByUsuarioId: context.user.id } });
    await tx.healthTfdRequestEvent.create({ data: { requestId: request.id, eventType: "BENEFICIO_SOLICITADO", fromStatus: request.status, toStatus: request.status, reportVersion: request.clinicalReport.version, reason: `${benefit.id} · ${input.description} · quantidade ${input.quantity}`, actorUsuarioId: context.user.id } });
    return { id: benefit.id };
  });
}

export async function transitionTfdBenefit(context: AppContext, raw: unknown) {
  const input = z.object({ benefitId: id, status: z.enum(["AUTORIZADO", "ENTREGUE", "CANCELADO"]), reason: note, receivedByPersonId: optionalId, deliveryReceipt: z.string().trim().max(2000).nullable().default(null) }).strict().parse(raw);
  const existing = await context.prisma.healthTfdBenefit.findUniqueOrThrow({ where: { id: input.benefitId }, select: { requestId: true } });
  return context.prisma.$transaction(async tx => {
    await lockTfdRequest(tx, existing.requestId);
    const request = await tfdRequestForActor(tx, context, existing.requestId);
    const benefit = await tx.healthTfdBenefit.findUniqueOrThrow({ where: { id: input.benefitId } });
    const allowed: Record<string, string[]> = { SOLICITADO: ["AUTORIZADO", "CANCELADO"], AUTORIZADO: ["ENTREGUE", "CANCELADO"] };
    if (!allowed[benefit.status]?.includes(input.status)) throw new Error("Transição de benefício não permitida ou já realizada.");
    if (input.status !== "CANCELADO" && (request.status !== "AUTORIZADA" || benefit.reportVersion !== request.clinicalReport?.version)) throw new Error("Tratamento ou versão do laudo não está autorizado para este benefício.");
    if (input.status === "ENTREGUE" && (!input.receivedByPersonId || !input.deliveryReceipt || !await tx.person.count({ where: { id: input.receivedByPersonId, status: "Ativo" } }))) throw new Error("Informe a pessoa recebedora cadastrada e o comprovante de entrega.");
    const result = await tx.healthTfdBenefit.update({ where: { id: benefit.id }, data: {
      status: input.status,
      ...(input.status === "AUTORIZADO" ? { authorizedAt: new Date(), authorizedByUsuarioId: context.user.id } : {}),
      ...(input.status === "ENTREGUE" ? { deliveredAt: new Date(), deliveredByUsuarioId: context.user.id, receivedByPersonId: input.receivedByPersonId, deliveryReceipt: input.deliveryReceipt } : {}),
    } });
    await tx.healthTfdRequestEvent.create({ data: { requestId: request.id, eventType: `BENEFICIO_${input.status}`, fromStatus: request.status, toStatus: request.status, reportVersion: benefit.reportVersion, reason: `${benefit.id} · ${input.reason}`, actorUsuarioId: context.user.id } });
    return { id: result.id, status: result.status };
  });
}
