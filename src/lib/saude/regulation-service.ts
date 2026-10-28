import { z } from "zod";
import { updateWaitlistWithEvent } from "./waitlist-events";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { healthRegulationAttachments, healthRegulationEvents, healthRegulationQuotas, healthRegulationQuotaAllocations, healthRegulationRequests, healthRegulationReviews, healthRegulationSectors, healthProviderAccesses } from "@/db/schema/health-regulation";
import { healthWaitlists, healthWaitlistEvents, healthAppointments } from "@/db/schema/health-agenda";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { runHealthTransaction } from "./health-transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { randomUUID } from "node:crypto";
import { parseBrazilDateTime } from "./appointment-policy";

export class RegulationError extends Error {}

const quotaSchema = z.object({
  providerSupplierId: z.string().min(1),
  unitId: z.string().min(1).nullable().optional(),
  specialtyId: z.string().min(1).nullable().optional(),
  serviceId: z.string().min(1).nullable().optional(),
  procedureId: z.string().min(1).nullable().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  totalQuantity: z.number().int().positive().max(9999),
  unitValue: z.number().nonnegative().nullable().optional(),
  convenioId: z.string().min(1).nullable().optional(),
}).strict();

const requestSchema = z.object({
  patientId: z.string().min(1),
  requestUnitId: z.string().min(1).nullable().optional(),
  professionalId: z.string().min(1).nullable().optional(),
  specialtyId: z.string().min(1).nullable().optional(),
  serviceId: z.string().min(1).nullable().optional(),
  procedureId: z.string().min(1).nullable().optional(),
  sectorId: z.string().min(1).nullable().optional(),
  cidReferenceId: z.string().min(1).nullable().optional(),
  priority: z.enum(["Alta","Media","Normal"]).default("Normal"),
  description: z.string().trim().max(2000).nullable().optional(),
  origin: z.enum(["DIRECT","PEP_REFERRAL","PEP_EXAM"]).default("DIRECT"),
  referralId: z.string().min(1).nullable().optional(),
  examRequestId: z.string().min(1).nullable().optional(),
  patientCondition: z.string().trim().max(60).nullable().optional(),
  executorNotes: z.string().trim().max(2000).nullable().optional(),
  transportNotes: z.string().trim().max(2000).nullable().optional(),
  isExternal: z.boolean().default(false),
  observations: z.string().trim().max(2000).nullable().optional(),
  preparation: z.string().trim().max(2000).nullable().optional(),
  contactPhone: z.string().trim().max(30).nullable().optional(),
}).strict();

const VALID_TRANSITIONS: Record<string, string[]> = {
  RECEBIDA: ["EM_ANALISE","AUTORIZADA","DEVOLVIDA","CANCELADA"],
  EM_ANALISE: ["AUTORIZADA","DEVOLVIDA","CANCELADA"],
  AUTORIZADA: ["AGENDADA","EXECUTADA","CANCELADA","DEVOLVIDA"],
  AGENDADA: ["EXECUTADA","CANCELADA"],
  EXECUTADA: ["CONCLUIDA","DEVOLVIDA"],
  DEVOLVIDA: ["RECEBIDA","ARQUIVADA"],
  CANCELADA: ["ARQUIVADA"],
  CONCLUIDA: ["ARQUIVADA"],
  ARQUIVADA: ["RECEBIDA"],
};

async function nextProtocolNumber(tx: DatabaseTransaction) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `REG-${year}-${randomUUID().slice(0, 6).toUpperCase()}`;
    if (!(await tx.select({ id: healthRegulationRequests.id }).from(healthRegulationRequests).where(eq(healthRegulationRequests.protocolNumber, candidate)).limit(1)).length) return candidate;
  }
  throw new RegulationError("Não foi possível gerar o protocolo.");
}

async function ensureQuotaTx(tx: DatabaseTransaction, quotaId: string, adjust: { reserved?: number; realized?: number }, requestUnitId?: string | null) {
  await tx.execute(sql`SELECT id FROM "HealthRegulationQuota" WHERE id=${quotaId} FOR UPDATE`);
  const [quota] = await tx.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id, quotaId)).limit(1);
  if (!quota) throw new RegulationError("Cota não encontrada.");
  const reserved = quota.reservedQuantity + (adjust.reserved ?? 0);
  const realized = quota.realizedQuantity + (adjust.realized ?? 0);
  if (reserved < 0 || realized < 0) throw new RegulationError("Saldo de cota incoerente.");
  if (reserved + realized > quota.totalQuantity) throw new RegulationError("Cota sem saldo disponível.");
  const allocations = await tx.select().from(healthRegulationQuotaAllocations).where(eq(healthRegulationQuotaAllocations.quotaId, quotaId));
  if (allocations.length) {
    const allocation = allocations.find(row => row.requestUnitId === requestUnitId);
    if (!allocation) throw new RegulationError("A unidade solicitante não possui distribuição desta cota.");
    const allocatedReserved = allocation.reservedQuantity + (adjust.reserved || 0), allocatedRealized = allocation.realizedQuantity + (adjust.realized || 0);
    if (allocatedReserved < 0 || allocatedRealized < 0 || allocatedReserved + allocatedRealized > allocation.totalQuantity) throw new RegulationError("Saldo da cota da unidade solicitante esgotado ou incoerente.");
    await tx.update(healthRegulationQuotaAllocations).set({ reservedQuantity: allocatedReserved, realizedQuantity: allocatedRealized }).where(eq(healthRegulationQuotaAllocations.id, allocation.id));
  }
  const [updated] = await tx.update(healthRegulationQuotas).set({ reservedQuantity: reserved, realizedQuantity: realized }).where(eq(healthRegulationQuotas.id, quotaId)).returning();
  return updated;
}

export async function saveRegulationQuota(context: AppContext, raw: unknown) {
  const input = quotaSchema.parse(raw);
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  if (!input.unitId && context.user.hasHealthAccessScope) throw new RegulationError("Informe a unidade para configurar cota.");
  // Upsert by provider+unit+specialty+service+procedure+period (simplified: provider+unit+period when specialty/service/procedure empty)
  const database = context.database ?? db;
  const [existing] = await database.select({ id: healthRegulationQuotas.id }).from(healthRegulationQuotas).where(and(eq(healthRegulationQuotas.providerSupplierId, input.providerSupplierId), input.unitId ? eq(healthRegulationQuotas.unitId, input.unitId) : isNull(healthRegulationQuotas.unitId), input.specialtyId ? eq(healthRegulationQuotas.specialtyId, input.specialtyId) : isNull(healthRegulationQuotas.specialtyId), input.serviceId ? eq(healthRegulationQuotas.serviceId, input.serviceId) : isNull(healthRegulationQuotas.serviceId), input.procedureId ? eq(healthRegulationQuotas.procedureId, input.procedureId) : isNull(healthRegulationQuotas.procedureId), eq(healthRegulationQuotas.period, input.period))).limit(1);
  if (input.convenioId && !(await database.execute(sql`SELECT id FROM "Covenant" WHERE id=${input.convenioId} LIMIT 1`)).rows.length) throw new RegulationError("Convênio não encontrado.");
  if (existing) {
    return runHealthTransaction(context, async tx => {
      await tx.execute(sql`SELECT id FROM "HealthRegulationQuota" WHERE id=${existing.id} FOR UPDATE`);
      const [current] = await tx.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id, existing.id)).limit(1);
      if (!current) throw new RegulationError("Cota não encontrada.");
      if (input.totalQuantity < current.reservedQuantity + current.realizedQuantity) throw new RegulationError("A quantidade total não pode ser menor que as cotas reservadas e realizadas.");
      if (current.reservedQuantity + current.realizedQuantity > 0 && current.convenioId !== (input.convenioId || null)) throw new RegulationError("O convênio de uma cota com consumo deve ser preservado.");
      const [updated] = await tx.update(healthRegulationQuotas).set({ totalQuantity: input.totalQuantity, unitValue: input.unitValue == null ? undefined : new Decimal(input.unitValue), convenioId: input.convenioId || null, isActive: true }).where(eq(healthRegulationQuotas.id, current.id)).returning({ id: healthRegulationQuotas.id });
      return updated;
    });
  }
  const [created] = await database.insert(healthRegulationQuotas).values({
    providerSupplierId: input.providerSupplierId,
    unitId: input.unitId || null,
    specialtyId: input.specialtyId || null,
    serviceId: input.serviceId || null,
    procedureId: input.procedureId || null,
    period: input.period,
    totalQuantity: input.totalQuantity,
    unitValue: input.unitValue == null ? null : new Decimal(input.unitValue),
    convenioId: input.convenioId || null,
  }).returning({ id: healthRegulationQuotas.id });
  return created;
}

export async function createRegulationRequest(context: AppContext, raw: unknown) {
  const input = requestSchema.parse(raw);
  const unitId = input.requestUnitId || null;
  if (unitId) assertHealthUnitAccess(context.user, unitId);
  else if (context.user.hasHealthAccessScope) throw new RegulationError("Informe a unidade solicitante.");
  const database = context.database ?? db;
  const patient = (await database.execute(sql`SELECT id FROM "Patient" WHERE id=${input.patientId} LIMIT 1`)).rows[0];
  if (!patient) throw new RegulationError("Paciente não encontrado.");
  if (input.sectorId && !(await database.select({ id: healthRegulationSectors.id }).from(healthRegulationSectors).where(and(eq(healthRegulationSectors.id, input.sectorId), eq(healthRegulationSectors.isActive, true))).limit(1)).length) throw new RegulationError("Setor de regulação inválido.");
  return runHealthTransaction(context, async tx => {
    const [request] = await tx.insert(healthRegulationRequests).values({
        patientId: input.patientId,
        requestUnitId: unitId,
        professionalId: input.professionalId || null,
        specialtyId: input.specialtyId || null,
        serviceId: input.serviceId || null,
        procedureId: input.procedureId || null,
        sectorId: input.sectorId || null,
        cidReferenceId: input.cidReferenceId || null,
        priority: input.priority,
        origin: input.origin,
        referralId: input.referralId || null,
        examRequestId: input.examRequestId || null,
        description: input.description || null,
        patientCondition: input.patientCondition || null,
        executorNotes: input.executorNotes || null,
        transportNotes: input.transportNotes || null,
        isExternal: input.isExternal,
        observations: input.observations || null,
        preparation: input.preparation || null,
        contactPhone: input.contactPhone || null,
        protocolNumber: await nextProtocolNumber(tx),
        createdByUsuarioId: context.user.id,
    }).returning({ id: healthRegulationRequests.id });
    await tx.insert(healthRegulationEvents).values({ requestId: request.id, fromStatus: "RECEBIDA", toStatus: "RECEBIDA", eventType: "CRIADA", actorUsuarioId: context.user.id });
    return request;
  });
}

export async function transitionRegulationRequest(context: AppContext, requestId: string, toStatus: string, options?: { quotaId?: string | null; notes?: string | null; scheduledAt?: string | null; scheduleId?: string | null; appointmentUnitId?: string | null; executorProfessionalId?: string | null }) {
  const target = toStatus.trim().toUpperCase();
  const rawDate = options?.scheduledAt?.trim();
  const scheduledAt = rawDate ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawDate) ? parseBrazilDateTime(rawDate) : new Date(rawDate) : undefined;
  if (scheduledAt && !Number.isFinite(scheduledAt.valueOf())) throw new RegulationError("Informe data e horário existentes para o agendamento.");
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthRegulationRequest" WHERE id=${requestId} FOR UPDATE`);
    const [request] = await tx.select().from(healthRegulationRequests).where(eq(healthRegulationRequests.id, requestId)).limit(1);
    if (!request) throw new RegulationError("Solicitação não encontrada.");
    if (request.requestUnitId) assertHealthUnitAccess(context.user, request.requestUnitId);
    if (request.status === target) {
      if (options?.quotaId && options.quotaId !== request.quotaId) throw new RegulationError("A transição já foi registrada com outra cota. Use a transferência de autorização.");
      return { id: request.id, status: request.status, guideNumber: request.guideNumber };
    }
    const allowed = VALID_TRANSITIONS[request.status] || [];
    if (!allowed.includes(target) && request.status !== target) throw new RegulationError(`Transição de ${request.status} para ${target} não permitida.`);
    // Quota handling
    let quotaId = request.quotaId;
    if (target === "AUTORIZADA") {
      const qId = options?.quotaId || quotaId;
      if (!qId) throw new RegulationError("Selecione a cota para autorizar.");
      const [quota] = await tx.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id, qId)).limit(1);
      if (!quota) throw new RegulationError("Cota não encontrada.");
      if (quota.unitId) assertHealthUnitAccess(context.user, quota.unitId);
      assertCompatibleQuota(quota, request);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${qId}))`);
      if (request.executedAt && request.quotaId !== qId) throw new RegulationError("A cota de uma execução já realizada deve ser preservada.");
      if (!request.executedAt) await ensureQuotaTx(tx, qId, { reserved: 1 }, request.requestUnitId);
      quotaId = qId;
      const policy = request.requestUnitId ? (await tx.select({ valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, `HEALTH_REGULATION_REVIEW:${request.requestUnitId}`)).limit(1))[0] : null;
      const parsedPolicy = z.record(z.string(), z.unknown()).safeParse(policy?.valor);
      const configured = parsedPolicy.success ? parsedPolicy.data : {};
      for (const [field, step] of [["administrativeRequired", "ADMINISTRATIVE"], ["technicalRequired", "TECHNICAL"]] as const) if (configured[field] === true) { const [review] = await tx.select({ decision: healthRegulationReviews.decision }).from(healthRegulationReviews).where(and(eq(healthRegulationReviews.requestId, requestId), eq(healthRegulationReviews.step, step))).orderBy(desc(healthRegulationReviews.createdAt)).limit(1); if (review?.decision !== "APPROVED") throw new RegulationError("Conclua as etapas de análise exigidas pela unidade antes da autorização."); }
      const [waiting] = await tx.select({ id: healthWaitlists.id }).from(healthWaitlists).where(eq(healthWaitlists.regulationRequestId, request.id)).limit(1);
      if (waiting) await updateWaitlistWithEvent(tx, { id: waiting.id }, { status: "Aguardando", appointmentId: null }, { type: "REGULATION_RELEASED", actorUsuarioId: context.user.id });
      else {
        const [entry] = await tx.insert(healthWaitlists).values({ regulationRequestId: request.id, patientId: request.patientId, unitId: request.requestUnitId, specialtyId: request.specialtyId, procedureId: request.procedureId, priority: request.priority === "Alta" ? "Urgência" : request.priority === "Media" ? "Prioridade" : "Normal", createdByUsuarioId: context.user.id }).returning({ id: healthWaitlists.id });
        await tx.insert(healthWaitlistEvents).values({ waitlistId: entry.id, eventType: "REGULATION_RELEASED", toStatus: "Aguardando", actorUsuarioId: context.user.id });
      }
    }
    if (!request.executedAt && ["AUTORIZADA", "AGENDADA"].includes(request.status) && ["CANCELADA","DEVOLVIDA"].includes(target) && quotaId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${quotaId}))`);
      await ensureQuotaTx(tx, quotaId, { reserved: -1 }, request.requestUnitId);
      quotaId = null;
    }
    if (target === "EXECUTADA" && !quotaId) throw new RegulationError("A execução exige uma cota previamente autorizada.");
    if (target === "EXECUTADA" && quotaId && !request.executedAt) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${quotaId}))`);
      await ensureQuotaTx(tx, quotaId, { reserved: -1, realized: 1 }, request.requestUnitId);
    }
    if (target === "CONCLUIDA" && options?.notes && options.notes.length < 3) throw new RegulationError("Informe observações do retorno.");
    if (target === "ARQUIVADA" && !(options?.notes || "").trim()) throw new RegulationError("Arquivamento exige motivo.");
    if (target === "AGENDADA" && !scheduledAt) throw new RegulationError("Informe data e horário do agendamento.");
    let appointmentId = request.appointmentId;
    if (target === "AGENDADA") {
      const unitId = options?.appointmentUnitId || request.requestUnitId;
      if (!unitId) throw new RegulationError("Informe a unidade executora do agendamento.");
      const { createHealthAppointmentInTransaction } = await import("./appointment-service");
      const { getHealthAccessAt } = await import("./health-access-policy");
      const instant = getHealthAccessAt(scheduledAt!);
      const appointment = await createHealthAppointmentInTransaction(context, tx, { patientId: request.patientId, unitId, professionalId: options?.executorProfessionalId || null, date: `${instant.date}T${instant.time}`, specialtyId: request.specialtyId, serviceId: request.serviceId, specialty: null, schedulingGroupId: null, scheduleId: options?.scheduleId || null, priority: request.priority === "Alta" ? "Urgência" : request.priority === "Media" ? "Prioridade" : "Normal", visitType: null });
      appointmentId = appointment.id;
      await updateWaitlistWithEvent(tx, { regulationRequestId: request.id }, { status: "Convertido", appointmentId: appointment.id, scheduleId: options?.scheduleId || null }, { type: "BOOKED", actorUsuarioId: context.user.id });
    }
    if (["CANCELADA", "DEVOLVIDA", "ARQUIVADA"].includes(target)) {
      await updateWaitlistWithEvent(tx, { regulationRequestId: request.id }, { status: target === "DEVOLVIDA" ? "Bloqueado" : "Cancelado" }, { type: target === "DEVOLVIDA" ? "REGULATION_RETURNED" : "REGULATION_CLOSED", actorUsuarioId: context.user.id, notes: options?.notes });
      if (request.appointmentId && !request.executedAt) {
        if ((await tx.execute(sql`SELECT id FROM "MedicalRecord" WHERE "appointmentId"=${request.appointmentId} LIMIT 1`)).rows.length) throw new RegulationError("Atendimento iniciado deve ser concluído pelo profissional, sem cancelar sua origem.");
        await tx.update(healthAppointments).set({ status: "Cancelado", cancelledAt: new Date(), cancellationReason: options?.notes || "Cancelamento da regulação" }).where(eq(healthAppointments.id, request.appointmentId));
      }
    }
    if (target === "EXECUTADA" && request.appointmentId) await tx.update(healthAppointments).set({ status: "Atendido", completedAt: request.executedAt || new Date() }).where(eq(healthAppointments.id, request.appointmentId));
    const guideNumber = target === "AUTORIZADA" && !request.quotaId ? `GUI-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${randomUUID().slice(0,6).toUpperCase()}` : undefined;
    const validationCode = target === "AUTORIZADA" && !request.executedAt ? randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase() : undefined;
    const data = {
      status: target,
      appointmentId: appointmentId || undefined,
      quotaId: quotaId || (request.quotaId ? null : undefined),
      guideNumber: guideNumber || undefined,
      guideIssuedAt: guideNumber ? new Date() : undefined,
      validationCode: validationCode || undefined,
      scheduledAt,
      executedAt: target === "EXECUTADA" ? request.executedAt || new Date() : undefined,
      returnedAt: target === "CONCLUIDA" ? new Date() : undefined,
      feedback: target === "CONCLUIDA" ? (options?.notes || null) : undefined,
    };
    const [updated] = await tx.update(healthRegulationRequests).set(data).where(eq(healthRegulationRequests.id, requestId)).returning({ id: healthRegulationRequests.id, status: healthRegulationRequests.status, guideNumber: healthRegulationRequests.guideNumber });
    await tx.insert(healthRegulationEvents).values({ requestId, fromStatus: request.status, toStatus: target, eventType: target, notes: options?.notes || null, actorUsuarioId: context.user.id });
    return updated;
  });
}

export async function saveSector(context: AppContext, name: string) {
  const normalized = name.trim();
  if (normalized.length < 2) throw new RegulationError("Informe o nome do setor.");
  const [sector] = await (context.database ?? db).insert(healthRegulationSectors).values({ name: normalized }).onConflictDoUpdate({ target: healthRegulationSectors.name, set: { isActive: true } }).returning({ id: healthRegulationSectors.id });
  return sector;
}

export async function reclassifyRequest(context: AppContext, requestId: string, raw: unknown) {
  const input = z.object({ specialtyId: z.string().min(1).nullable().optional(), serviceId: z.string().min(1).nullable().optional(), notes: z.string().trim().min(3).max(2000) }).strict().parse(raw);
  const [request] = await (context.database ?? db).select({ id: healthRegulationRequests.id, status: healthRegulationRequests.status, requestUnitId: healthRegulationRequests.requestUnitId }).from(healthRegulationRequests).where(eq(healthRegulationRequests.id, requestId)).limit(1);
  if (!request) throw new RegulationError("Solicitação não encontrada.");
  if (request.requestUnitId) assertHealthUnitAccess(context.user, request.requestUnitId);
  if (["EXECUTADA", "CONCLUIDA", "CANCELADA", "ARQUIVADA"].includes(request.status)) throw new RegulationError("Solicitação encerrada não pode ser reclassificada.");
  if (["AUTORIZADA", "AGENDADA"].includes(request.status)) throw new RegulationError("Devolva a autorização para análise antes de alterar sua especialidade ou serviço.");
  return runHealthTransaction(context, async tx => {
    await tx.update(healthRegulationRequests).set({ specialtyId: input.specialtyId || null, serviceId: input.serviceId || null }).where(eq(healthRegulationRequests.id, requestId));
    await tx.insert(healthRegulationEvents).values({ requestId, fromStatus: request.status, toStatus: request.status, eventType: "RECLASSIFICADA", notes: input.notes, actorUsuarioId: context.user.id });
    return { id: requestId };
  });
}

export async function transferAuthorization(context: AppContext, requestId: string, quotaId: string) {
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthRegulationRequest" WHERE id=${requestId} FOR UPDATE`);
    const [request] = await tx.select().from(healthRegulationRequests).where(eq(healthRegulationRequests.id, requestId)).limit(1);
    if (!request) throw new RegulationError("Solicitação não encontrada.");
    if (request.status !== "AUTORIZADA") throw new RegulationError("Somente autorizações vigentes podem ser transferidas.");
    if (request.executedAt) throw new RegulationError("A cota de um atendimento já executado deve ser preservada.");
    if (request.requestUnitId) assertHealthUnitAccess(context.user, request.requestUnitId);
    const [quota] = await tx.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id, quotaId)).limit(1);
    if (!quota) throw new RegulationError("Cota destino não encontrada.");
    if (quota.unitId) assertHealthUnitAccess(context.user, quota.unitId);
    if (request.quotaId === quotaId) return { id: requestId };
    assertCompatibleQuota(quota, request);
    for (const id of [...new Set([request.quotaId, quotaId].filter((value): value is string => Boolean(value)))].sort()) await tx.execute(sql`SELECT id FROM "HealthRegulationQuota" WHERE id=${id} FOR UPDATE`);
    if (request.quotaId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${request.quotaId}))`);
      await ensureQuotaTx(tx, request.quotaId, { reserved: -1 }, request.requestUnitId);
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${quotaId}))`);
    await ensureQuotaTx(tx, quotaId, { reserved: 1 }, request.requestUnitId);
    await tx.update(healthRegulationRequests).set({ quotaId }).where(eq(healthRegulationRequests.id, requestId));
    await tx.insert(healthRegulationEvents).values({ requestId, fromStatus: "AUTORIZADA", toStatus: "AUTORIZADA", eventType: "AUTORIZACAO_TRANSFERIDA", actorUsuarioId: context.user.id });
    return { id: requestId };
  });
}

export async function adjustRegulationAppointmentQuota(tx: DatabaseTransaction, quotaId: string, requestUnitId: string | null, executed: boolean) {
  return ensureQuotaTx(tx, quotaId, { reserved: -1, realized: executed ? 1 : 0 }, requestUnitId);
}

function assertCompatibleQuota(quota: { isActive: boolean; unitId: string | null; specialtyId: string | null; serviceId: string | null; procedureId: string | null }, request: { requestUnitId: string | null; specialtyId: string | null; serviceId: string | null; procedureId: string | null }) {
  if (!quota.isActive) throw new RegulationError("Selecione uma cota ativa.");
  if (quota.unitId && quota.unitId !== request.requestUnitId || quota.specialtyId && quota.specialtyId !== request.specialtyId || quota.serviceId && quota.serviceId !== request.serviceId || quota.procedureId && quota.procedureId !== request.procedureId) throw new RegulationError("A cota deve corresponder à unidade, especialidade, serviço e procedimento solicitados.");
}

export async function grantProviderAccess(context: AppContext, raw: unknown) {
  const input = z.object({ supplierId: z.string().min(1), usuarioId: z.string().min(1) }).strict().parse(raw);
  const database = context.database ?? db;
  const supplier = (await database.execute(sql`SELECT id FROM "Supplier" WHERE id=${input.supplierId} AND status='Ativo' LIMIT 1`)).rows[0];
  if (!supplier) throw new RegulationError("Prestador ativo não encontrado.");
  const usuario = (await database.execute(sql`SELECT id FROM "Usuario" WHERE id=${input.usuarioId} LIMIT 1`)).rows[0];
  if (!usuario) throw new RegulationError("Usuário não encontrado.");
  const [access] = await database.insert(healthProviderAccesses).values(input).onConflictDoUpdate({ target: [healthProviderAccesses.supplierId, healthProviderAccesses.usuarioId], set: { isActive: true } }).returning({ id: healthProviderAccesses.id });
  return access;
}

export async function addRequestAttachment(context: AppContext, input: { requestId: string; file: File }) {
  const [request] = await (context.database ?? db).select({ id: healthRegulationRequests.id, requestUnitId: healthRegulationRequests.requestUnitId }).from(healthRegulationRequests).where(eq(healthRegulationRequests.id, input.requestId)).limit(1);
  if (!request) throw new RegulationError("Solicitação não encontrada.");
  if (request.requestUnitId) assertHealthUnitAccess(context.user, request.requestUnitId);
  if (!(input.file instanceof File) || input.file.size === 0) throw new RegulationError("Selecione o arquivo do anexo.");
  const { ingestGedDocument } = await import("@/lib/documents/document-flow-service");
  const content = new Uint8Array(await input.file.arrayBuffer());
  const { uploadFile } = await import("@/lib/platform/blob");
  const blob = await uploadFile(input.file);
  let attachmentId: string | undefined;
  await ingestGedDocument(databaseConnection, { title: `Anexo regulação ${request.id.slice(0, 8)}`, documentType: "Anexo", documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content, actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => {
    const [attachment] = await tx.insert(healthRegulationAttachments).values({ requestId: request.id, documentId, uploadedByUsuarioId: context.user.id }).returning({ id: healthRegulationAttachments.id });
    attachmentId = attachment.id;
  } });
  if (!attachmentId) throw new RegulationError("Não foi possível vincular o anexo.");
  return { id: attachmentId };
}

export async function validateGuideCode(context: AppContext, code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new RegulationError("Informe o código de validação.");
  const request = (await (context.database ?? db).execute<{ id: string; status: string; guideNumber: string | null; patientName: string; specialtyName: string | null; serviceName: string | null; providerSupplierId: string | null }>(sql`SELECT r.id, r.status, r."guideNumber", pe."fullName" AS "patientName", sp.name AS "specialtyName", s.name AS "serviceName", q."providerSupplierId" FROM "HealthRegulationRequest" r JOIN "Patient" p ON p.id=r."patientId" JOIN "Person" pe ON pe.id=p."personId" LEFT JOIN "HealthSpecialty" sp ON sp.id=r."specialtyId" LEFT JOIN "HealthService" s ON s.id=r."serviceId" LEFT JOIN "HealthRegulationQuota" q ON q.id=r."quotaId" WHERE r."validationCode"=${normalized} LIMIT 1`)).rows[0];
  if (!request) throw new RegulationError("Código de validação não localizado.");
  return { id: request.id, status: request.status, guideNumber: request.guideNumber, patient: request.patientName, service: request.specialtyName || request.serviceName || "-", providerSupplierId: request.providerSupplierId || null };
}

export async function createFromReferralTx(tx: DatabaseTransaction, referral: { id: string; patientId: string; specialtyId: string | null; serviceId: string | null; destinationUnitId: string | null; professionalId: string; priority: string; reason: string }, actorUsuarioId: string) {
  const [existing] = await tx.select({ id: healthRegulationRequests.id }).from(healthRegulationRequests).where(eq(healthRegulationRequests.referralId, referral.id)).limit(1);
  if (existing) return existing;
  const [request] = await tx.insert(healthRegulationRequests).values({
      patientId: referral.patientId,
      requestUnitId: referral.destinationUnitId,
      professionalId: referral.professionalId,
      specialtyId: referral.specialtyId,
      serviceId: referral.serviceId,
      priority: referral.priority || "Normal",
      origin: "PEP_REFERRAL",
      referralId: referral.id,
      description: referral.reason,
      protocolNumber: await nextProtocolNumber(tx),
      createdByUsuarioId: actorUsuarioId,
  }).returning({ id: healthRegulationRequests.id });
  await tx.insert(healthRegulationEvents).values({ requestId: request.id, fromStatus: "RECEBIDA", toStatus: "RECEBIDA", eventType: "CRIADA_VIA_PEP", actorUsuarioId });
  return request;
}
