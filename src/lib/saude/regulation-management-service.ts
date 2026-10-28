import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { scopedPatient } from "./patient-registration-service";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { runHealthTransaction } from "./health-transaction";
import { people } from "@/db/schema/people";
import { patients, healthPatientRegistrationChanges } from "@/db/schema/health-registration";
import { healthCallPanels, healthPanelCalls, healthRegulationRequests, healthRegulationEvents, healthRegulationReviews, healthRegulationQuotas, healthRegulationQuotaAllocations } from "@/db/schema/health-regulation";
import { healthAppointments, healthAppointmentEvents, healthCareSchedules, healthScheduleBlocks } from "@/db/schema/health-agenda";
import { instanceParameters, systemInstances } from "@/db/schema/instance-configuration";

export async function updateBookingPatientIdentity(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), cpf: z.string().trim().nullable(), cns: z.string().trim().nullable(), cellphone: z.string().trim().max(50).nullable() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const patient = await scopedPatient(tx, context, input.patientId);
    const cpf = input.cpf ? requireValidCpf(input.cpf) : patient.person.cpf;
    await tx.update(people).set({ cpf, whatsapp: input.cellphone }).where(eq(people.id, patient.personId));
    await tx.update(patients).set({ cns: input.cns }).where(eq(patients.id, patient.id));
    await tx.insert(healthPatientRegistrationChanges).values({ patientId: patient.id, actorUsuarioId: context.user.id, changes: { field: "BOOKING_IDENTITY", before: { cpf: patient.person.cpf, cns: patient.cns, cellphone: patient.person.whatsapp }, after: { cpf, cns: input.cns, cellphone: input.cellphone } } });
    return { patientId: patient.id };
  });
}

export async function distributeRegulationQuota(context: AppContext, raw: unknown) {
  const input = z.object({ quotaId: z.string().min(1), requestUnitId: z.string().min(1), totalQuantity: z.number().int().min(0) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.requestUnitId);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthRegulationQuota" WHERE id=${input.quotaId} FOR UPDATE`);
    const [quota] = await tx.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id, input.quotaId)).limit(1);
    if (!quota) throw new Error("Cota não encontrada.");
    if (quota.unitId) assertHealthUnitAccess(context.user, quota.unitId);
    const allocations = await tx.select().from(healthRegulationQuotaAllocations).where(eq(healthRegulationQuotaAllocations.quotaId, quota.id));
    const current = allocations.find(row => row.requestUnitId === input.requestUnitId);
    if (current && input.totalQuantity < current.reservedQuantity + current.realizedQuantity || allocations.filter(row => row.requestUnitId !== input.requestUnitId).reduce((sum, row) => sum + row.totalQuantity, 0) + input.totalQuantity > quota.totalQuantity) throw new Error("A distribuição não pode ultrapassar o total nem reduzir saldo já consumido.");
    const requests = await tx.select({ status: healthRegulationRequests.status, executedAt: healthRegulationRequests.executedAt }).from(healthRegulationRequests).where(and(eq(healthRegulationRequests.quotaId, quota.id), eq(healthRegulationRequests.requestUnitId, input.requestUnitId)));
    const reservedQuantity = requests.filter(row => !row.executedAt && ["AUTORIZADA", "AGENDADA"].includes(row.status)).length, realizedQuantity = requests.filter(row => row.executedAt).length;
    if (!current && input.totalQuantity < reservedQuantity + realizedQuantity) throw new Error("A distribuição deve contemplar as solicitações já reservadas e executadas desta unidade.");
    const [allocation] = await tx.insert(healthRegulationQuotaAllocations).values({ ...input, reservedQuantity, realizedQuantity }).onConflictDoUpdate({ target: [healthRegulationQuotaAllocations.quotaId, healthRegulationQuotaAllocations.requestUnitId], set: { totalQuantity: input.totalQuantity } }).returning();
    return allocation;
  });
}

export async function configureRegulationReviews(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), administrativeRequired: z.boolean(), technicalRequired: z.boolean() }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return runHealthTransaction(context, async tx => {
    const [instance] = await tx.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
    if (!instance) throw new Error("Configuração da instância não encontrada.");
    const chave = `HEALTH_REGULATION_REVIEW:${input.unitId}`;
    const [parameter] = await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave, valor: input }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: input } }).returning();
    return parameter;
  });
}

export async function reviewRegulationRequest(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), step: z.enum(["ADMINISTRATIVE", "TECHNICAL"]), decision: z.enum(["APPROVED", "RETURNED", "DENIED"]), priority: z.enum(["Alta", "Media", "Normal"]), notes: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthRegulationRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const [request] = await tx.select().from(healthRegulationRequests).where(eq(healthRegulationRequests.id, input.requestId)).limit(1);
    if (!request) throw new Error("Solicitação não encontrada.");
    if (request.requestUnitId) assertHealthUnitAccess(context.user, request.requestUnitId);
    if (!["RECEBIDA", "EM_ANALISE", "DEVOLVIDA"].includes(request.status)) throw new Error("Somente pedidos em análise podem receber parecer.");
    const professional = input.step === "TECHNICAL" ? (await tx.execute<{ id: string }>(sql`SELECT id FROM "HealthProfessional" WHERE "employeeId"=${context.user.employeeId || "__SEM_PROFISSIONAL__"} AND "isActive"=true LIMIT 1`)).rows[0] : null;
    if (input.step === "TECHNICAL" && !professional) throw new Error("Análise técnica exige profissional autenticado e ativo.");
    const [review] = await tx.insert(healthRegulationReviews).values({ ...input, professionalId: professional?.id || null, actorUsuarioId: context.user.id }).returning();
    const status = input.decision === "APPROVED" ? "EM_ANALISE" : "DEVOLVIDA";
    await tx.update(healthRegulationRequests).set({ status, priority: input.priority }).where(eq(healthRegulationRequests.id, request.id));
    await tx.insert(healthRegulationEvents).values({ requestId: request.id, fromStatus: request.status, toStatus: status, eventType: `${input.step}_${input.decision}`, notes: input.notes, actorUsuarioId: context.user.id });
    return review;
  });
}

export async function saveSchedulePeriodBlock(context: AppContext, raw: unknown) {
  const input = z.object({ scheduleId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().trim().min(1) }).strict().parse(raw);
  if (input.endsAt <= input.startsAt) throw new Error("O fim do bloqueio deve ser posterior ao início.");
  const database = context.database ?? db;
  const [schedule] = await database.select().from(healthCareSchedules).where(eq(healthCareSchedules.id, input.scheduleId)).limit(1);
  if (!schedule) throw new Error("Cronograma não encontrado.");
  assertHealthUnitAccess(context.user, schedule.unitId);
  const [block] = await database.insert(healthScheduleBlocks).values({ ...input, actorUsuarioId: context.user.id }).returning();
  return block;
}

export async function saveHealthCallPanel(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), sector: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200), callMessage: z.string().trim().min(1).max(1000), news: z.string().trim().max(10000), isActive: z.boolean().default(true) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const database = context.database ?? db;
  if (!(await database.execute(sql`SELECT id FROM "HealthUnit" WHERE id=${input.unitId} AND "isActive"=true LIMIT 1`)).rows.length) throw new Error("Selecione unidade de saúde ativa para o painel.");
  const [panel] = await database.insert(healthCallPanels).values(input).onConflictDoUpdate({ target: [healthCallPanels.unitId, healthCallPanels.sector], set: input }).returning();
  return panel;
}

export async function callHealthPanelPatient(context: AppContext, raw: unknown) {
  const input = z.object({ panelId: z.string().min(1), patientId: z.string().min(1), appointmentId: z.string().nullable(), pharmacyRequestId: z.string().nullable() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const [panel] = await tx.select().from(healthCallPanels).where(eq(healthCallPanels.id, input.panelId)).limit(1);
    if (!panel) throw new Error("Painel não encontrado.");
    assertHealthUnitAccess(context.user, panel.unitId);
    if (!panel.isActive) throw new Error("Painel inativo.");
    const patient = (await tx.execute<{ fullName: string }>(sql`SELECT pe."fullName" FROM "Patient" p JOIN "Person" pe ON pe.id=p."personId" WHERE p.id=${input.patientId} AND p.status='Ativo' AND pe.status='Ativo' AND pe."deathDate" IS NULL LIMIT 1`)).rows[0];
    if (!patient) throw new Error("Paciente ativo não encontrado.");
    if (input.appointmentId && !(await tx.select({ id: healthAppointments.id }).from(healthAppointments).where(and(eq(healthAppointments.id, input.appointmentId), eq(healthAppointments.patientId, input.patientId), eq(healthAppointments.unitId, panel.unitId))).limit(1)).length) throw new Error("Agendamento incompatível com paciente e unidade do painel.");
    if (input.pharmacyRequestId && !(await tx.execute(sql`SELECT p.id FROM "PharmacyRequest" p JOIN "Warehouse" w ON w.id=p."destinationWarehouseId" WHERE p.id=${input.pharmacyRequestId} AND p."patientId"=${input.patientId} AND w."healthUnitId"=${panel.unitId} LIMIT 1`)).rows.length) throw new Error("Pedido de farmácia incompatível com paciente e unidade.");
    const message = panel.callMessage.replaceAll("{paciente}", patient.fullName).replaceAll("{setor}", panel.sector);
    const [call] = await tx.insert(healthPanelCalls).values({ ...input, message, actorUsuarioId: context.user.id }).returning();
    if (input.appointmentId) {
      await tx.update(healthAppointments).set({ calledAt: new Date() }).where(eq(healthAppointments.id, input.appointmentId));
      await tx.insert(healthAppointmentEvents).values({ appointmentId: input.appointmentId, eventType: "CALLED", notes: message, actorUsuarioId: context.user.id });
    }
    return call;
  });
}
