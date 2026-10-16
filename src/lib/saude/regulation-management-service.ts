import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { scopedPatient } from "./patient-registration-service";

export async function updateBookingPatientIdentity(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), cpf: z.string().trim().nullable(), cns: z.string().trim().nullable(), cellphone: z.string().trim().max(50).nullable() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const patient = await scopedPatient(tx, context, input.patientId);
    const cpf = input.cpf ? requireValidCpf(input.cpf) : patient.person.cpf;
    await tx.person.update({ where: { id: patient.personId }, data: { cpf, whatsapp: input.cellphone } });
    await tx.patient.update({ where: { id: patient.id }, data: { cns: input.cns } });
    await tx.healthPatientRegistrationChange.create({ data: { patientId: patient.id, actorUsuarioId: context.user.id, changes: { field: "BOOKING_IDENTITY", before: { cpf: patient.person.cpf, cns: patient.cns, cellphone: patient.person.whatsapp }, after: { cpf, cns: input.cns, cellphone: input.cellphone } } } });
    return { patientId: patient.id };
  });
}

export async function distributeRegulationQuota(context: AppContext, raw: unknown) {
  const input = z.object({ quotaId: z.string().min(1), requestUnitId: z.string().min(1), totalQuantity: z.number().int().min(0) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.requestUnitId);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthRegulationQuota" WHERE id=${input.quotaId} FOR UPDATE`;
    const quota = await tx.healthRegulationQuota.findUniqueOrThrow({ where: { id: input.quotaId } });
    if (quota.unitId) assertHealthUnitAccess(context.user, quota.unitId);
    const allocations = await tx.healthRegulationQuotaAllocation.findMany({ where: { quotaId: quota.id } });
    const current = allocations.find(row => row.requestUnitId === input.requestUnitId);
    if (current && input.totalQuantity < current.reservedQuantity + current.realizedQuantity || allocations.filter(row => row.requestUnitId !== input.requestUnitId).reduce((sum, row) => sum + row.totalQuantity, 0) + input.totalQuantity > quota.totalQuantity) throw new Error("A distribuição não pode ultrapassar o total nem reduzir saldo já consumido.");
    const requests = await tx.healthRegulationRequest.findMany({ where: { quotaId: quota.id, requestUnitId: input.requestUnitId }, select: { status: true, executedAt: true } });
    const reservedQuantity = requests.filter(row => !row.executedAt && ["AUTORIZADA", "AGENDADA"].includes(row.status)).length, realizedQuantity = requests.filter(row => row.executedAt).length;
    if (!current && input.totalQuantity < reservedQuantity + realizedQuantity) throw new Error("A distribuição deve contemplar as solicitações já reservadas e executadas desta unidade.");
    return tx.healthRegulationQuotaAllocation.upsert({ where: { quotaId_requestUnitId: { quotaId: quota.id, requestUnitId: input.requestUnitId } }, create: { ...input, reservedQuantity, realizedQuantity }, update: { totalQuantity: input.totalQuantity } });
  });
}

export async function configureRegulationReviews(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), administrativeRequired: z.boolean(), technicalRequired: z.boolean() }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return context.prisma.$transaction(async tx => {
    const instance = await tx.configuracaoInstancia.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
    const chave = `HEALTH_REGULATION_REVIEW:${input.unitId}`;
    return tx.configuracaoParametroInstancia.upsert({ where: { configuracaoInstanciaId_chave: { configuracaoInstanciaId: instance.id, chave } }, create: { configuracaoInstanciaId: instance.id, chave, valor: input }, update: { valor: input } });
  });
}

export async function reviewRegulationRequest(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), step: z.enum(["ADMINISTRATIVE", "TECHNICAL"]), decision: z.enum(["APPROVED", "RETURNED", "DENIED"]), priority: z.enum(["Alta", "Media", "Normal"]), notes: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthRegulationRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.healthRegulationRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (request.requestUnitId) assertHealthUnitAccess(context.user, request.requestUnitId);
    if (!["RECEBIDA", "EM_ANALISE", "DEVOLVIDA"].includes(request.status)) throw new Error("Somente pedidos em análise podem receber parecer.");
    const professional = input.step === "TECHNICAL" ? await tx.healthProfessional.findFirst({ where: { employeeId: context.user.employeeId || "__SEM_PROFISSIONAL__", isActive: true }, select: { id: true } }) : null;
    if (input.step === "TECHNICAL" && !professional) throw new Error("Análise técnica exige profissional autenticado e ativo.");
    const review = await tx.healthRegulationReview.create({ data: { ...input, professionalId: professional?.id || null, actorUsuarioId: context.user.id } });
    const status = input.decision === "APPROVED" ? "EM_ANALISE" : "DEVOLVIDA";
    await tx.healthRegulationRequest.update({ where: { id: request.id }, data: { status, priority: input.priority } });
    await tx.healthRegulationEvent.create({ data: { requestId: request.id, fromStatus: request.status, toStatus: status, eventType: `${input.step}_${input.decision}`, notes: input.notes, actorUsuarioId: context.user.id } });
    return review;
  });
}

export async function saveSchedulePeriodBlock(context: AppContext, raw: unknown) {
  const input = z.object({ scheduleId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().trim().min(1) }).strict().parse(raw);
  if (input.endsAt <= input.startsAt) throw new Error("O fim do bloqueio deve ser posterior ao início.");
  const schedule = await context.prisma.healthCareSchedule.findUniqueOrThrow({ where: { id: input.scheduleId } });
  assertHealthUnitAccess(context.user, schedule.unitId);
  return context.prisma.healthScheduleBlock.create({ data: { ...input, actorUsuarioId: context.user.id } });
}

export async function saveHealthCallPanel(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), sector: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200), callMessage: z.string().trim().min(1).max(1000), news: z.string().trim().max(10000), isActive: z.boolean().default(true) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (!await context.prisma.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione unidade de saúde ativa para o painel.");
  return context.prisma.healthCallPanel.upsert({ where: { unitId_sector: { unitId: input.unitId, sector: input.sector } }, create: input, update: input });
}

export async function callHealthPanelPatient(context: AppContext, raw: unknown) {
  const input = z.object({ panelId: z.string().min(1), patientId: z.string().min(1), appointmentId: z.string().nullable(), pharmacyRequestId: z.string().nullable() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const panel = await tx.healthCallPanel.findUniqueOrThrow({ where: { id: input.panelId } });
    assertHealthUnitAccess(context.user, panel.unitId);
    if (!panel.isActive) throw new Error("Painel inativo.");
    const patient = await tx.patient.findFirstOrThrow({ where: { id: input.patientId, status: "Ativo", person: { status: "Ativo", deathDate: null } }, include: { person: true } });
    if (input.appointmentId && !await tx.healthAppointment.count({ where: { id: input.appointmentId, patientId: input.patientId, unitId: panel.unitId } })) throw new Error("Agendamento incompatível com paciente e unidade do painel.");
    if (input.pharmacyRequestId && !await tx.pharmacyRequest.count({ where: { id: input.pharmacyRequestId, patientId: input.patientId, destinationWarehouse: { healthUnitId: panel.unitId } } })) throw new Error("Pedido de farmácia incompatível com paciente e unidade.");
    const message = panel.callMessage.replaceAll("{paciente}", patient.person.fullName).replaceAll("{setor}", panel.sector);
    const call = await tx.healthPanelCall.create({ data: { ...input, message, actorUsuarioId: context.user.id } });
    if (input.appointmentId) {
      await tx.healthAppointment.update({ where: { id: input.appointmentId }, data: { calledAt: new Date() } });
      await tx.healthAppointmentEvent.create({ data: { appointmentId: input.appointmentId, eventType: "CALLED", notes: message, actorUsuarioId: context.user.id } });
    }
    return call;
  });
}
