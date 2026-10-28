"use server";

import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { biddings, biddingLots, biddingParticipants, biddingResults, purchaseProcessItems, purchaseProcesses } from "@/db/schema/procurement-core";
import { biddingPhases, biddingActs, biddingAppointments, biddingAppointmentMembers, biddingAppointmentAssignments, biddingLotItems, biddingBids, biddingEligibilities, supplierPortalIdentities } from "@/db/schema/procurement-bidding";
import { procurementLifecycleEvents } from "@/db/schema/procurement-requests";
import { employees } from "@/db/schema/administration";
import { suppliers } from "@/db/schema/registry";
import { users } from "@/db/schema/identity";
import { revalidatePath } from "next/cache";
import { getCurrentTenantContext, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { nextYearlyCodeDrizzle } from "@/db/repositories/platform/sequences";
import { BIDDING_NUMBER_DUPLICATE_ERROR, biddingNumberDuplicateError } from "@/lib/compras/bidding-number-integrity";
import {
  BIDDING_BID_STATUS,
  BIDDING_ELIGIBILITY_STATUS,
  BIDDING_LOT_STATUS,
  BIDDING_PHASE_DEFINITIONS,
  BIDDING_PHASE_STATUS,
  BIDDING_RESULT_STATUS,
  BIDDING_STATUS,
  BiddingWorkflowError,
  assertBiddingStatusTransition,
  biddingLotStatusForBiddingStatus,
  biddingModalityPrefix,
  biddingSequenceKey,
  canConfigureBiddingLots,
  canDecideBiddingEligibility,
  canDecideBiddingResult,
  canEditBiddingDetails,
  canRegisterBiddingParticipant,
  getBiddingPhasePlan,
  isBiddingBidSubmissionOpen,
  isBiddingModality,
  isBiddingParticipantEligible,
  isTerminalBiddingStatus,
  normalizeBiddingStatus,
} from "@/lib/compras/bidding-workflow";

type Tx = DatabaseTransaction;

export type BiddingActionResult =
  | { success: true; status?: string; id?: string; created?: boolean; alreadySubmitted?: boolean }
  | { success: false; error: string };

export type BiddingAppointmentMemberInput = {
  employeeId: string;
  role: string;
};

export type BiddingLotItemInput = {
  purchaseProcessItemId: string;
  quantity: number;
};

function formText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function requiredText(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new BiddingWorkflowError(`${label} é obrigatório.`);
  return normalized;
}

function optionalDate(value: string, label: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BiddingWorkflowError(`${label} inválida.`);
  return date;
}

function requiredMoney(value: number, label: string, allowZero = false) {
  if (!Number.isFinite(value)) throw new BiddingWorkflowError(`${label} deve ser um valor numérico válido.`);
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 0.000001) {
    throw new BiddingWorkflowError(`${label} deve possuir no máximo duas casas decimais.`);
  }
  if (allowZero ? cents < 0 : cents <= 0) throw new BiddingWorkflowError(`${label} deve ser ${allowZero ? "maior ou igual a zero" : "maior que zero"}.`);
  return new Decimal(cents).div(100);
}

function optionalMoney(value: number | null | undefined, label: string) {
  return value === null || value === undefined ? null : requiredMoney(value, label);
}

function requiredQuantity(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new BiddingWorkflowError(`${label} deve ser maior que zero.`);
  return value;
}

function isActiveStatus(status: string | null | undefined) {
  return status?.trim().toLocaleLowerCase("pt-BR") === "ativo";
}

function isInactiveParticipantStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLocaleLowerCase("pt-BR");
  return normalized === "inativo" || normalized === "desclassificado" || normalized === "impedido";
}

function decimalsEqual(left: Decimal | null, right: Decimal | null) {
  if (left === null || right === null) return left === right;
  return left.equals(right);
}

function isUniqueConstraint(error: unknown) {
  return getPostgresError(error)?.code === "23505";
}

function actionError(error: unknown, fallback: string): BiddingActionResult {
  if (error instanceof BiddingWorkflowError) return { success: false, error: error.message };
  console.error(fallback, error);
  return { success: false, error: fallback };
}

function revalidateBiddingPaths(id?: string) {
  revalidatePath("/compras/licitacoes");
  revalidatePath("/compras/licitacoes/portal");
  revalidatePath("/compras/licitacoes/portal/[participantId]", "page");
  if (id) revalidatePath(`/compras/licitacoes/${id}`);
}

async function currentPhaseId(tx: Tx, biddingId: string) {
  const [phase] = await tx.select({ id: biddingPhases.id }).from(biddingPhases).where(and(eq(biddingPhases.biddingId, biddingId), eq(biddingPhases.version, 1), eq(biddingPhases.isCurrent, true))).orderBy(asc(biddingPhases.sequence)).limit(1);
  return phase?.id ?? null;
}

async function writeBiddingAct(
  tx: Tx,
  input: {
    biddingId: string;
    actorUsuarioId: string;
    type: string;
    description?: string | null;
    phaseId?: string | null;
    biddingLotId?: string | null;
    idempotencyKey?: string;
  },
) {
  const [act] = await tx.insert(biddingActs).values({
      biddingId: input.biddingId,
      actorUsuarioId: input.actorUsuarioId,
      type: input.type,
      description: input.description ?? null,
      phaseId: input.phaseId ?? null,
      biddingLotId: input.biddingLotId ?? null,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
  }).returning();
  return act;
}

async function writeLifecycleEvent(
  tx: Tx,
  input: { eventType: string; biddingId: string; actorUsuarioId: string; sourceType?: string; sourceId?: string; idempotencyKey?: string },
) {
  await tx.insert(procurementLifecycleEvents).values({
      eventType: input.eventType,
      entityType: "BIDDING",
      entityId: input.biddingId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorUsuarioId: input.actorUsuarioId,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
  });
}

async function ensureBiddingPhases(tx: Tx, biddingId: string, biddingStatus: string, now = new Date()) {
  let phases = await tx.select().from(biddingPhases).where(and(eq(biddingPhases.biddingId, biddingId), eq(biddingPhases.version, 1))).orderBy(asc(biddingPhases.sequence));
  const existingCodes = new Set(phases.map((phase) => phase.code));

  for (const definition of BIDDING_PHASE_DEFINITIONS) {
    if (existingCodes.has(definition.code)) continue;
    await tx.insert(biddingPhases).values({
        biddingId,
        code: definition.code,
        name: definition.name,
        sequence: definition.sequence,
        version: 1,
        isCurrent: false,
        status: BIDDING_PHASE_STATUS.PENDING,
    });
  }

  phases = await tx.select().from(biddingPhases).where(and(eq(biddingPhases.biddingId, biddingId), eq(biddingPhases.version, 1))).orderBy(asc(biddingPhases.sequence));
  const plan = getBiddingPhasePlan(biddingStatus);

  if (!plan) {
    const suspended = normalizeBiddingStatus(biddingStatus) === BIDDING_STATUS.SUSPENDED;
    await tx.update(biddingPhases).set({
        status: suspended ? BIDDING_PHASE_STATUS.SUSPENDED : BIDDING_PHASE_STATUS.INTERRUPTED,
        isCurrent: suspended,
    }).where(and(eq(biddingPhases.biddingId, biddingId), eq(biddingPhases.version, 1), eq(biddingPhases.isCurrent, true)));
    return currentPhaseId(tx, biddingId);
  }

  const phaseByCode = new Map(phases.map((phase) => [phase.code, phase]));
  for (const expected of plan) {
    const phase = phaseByCode.get(expected.code);
    if (!phase) continue;
    await tx.update(biddingPhases).set({
        name: expected.name,
        sequence: expected.sequence,
        isCurrent: expected.isCurrent,
        status: expected.status,
        startedAt: expected.status === BIDDING_PHASE_STATUS.PENDING ? phase.startedAt : phase.startedAt ?? now,
        completedAt: expected.status === BIDDING_PHASE_STATUS.COMPLETED ? phase.completedAt ?? now : null,
    }).where(eq(biddingPhases.id, phase.id));
  }

  return currentPhaseId(tx, biddingId);
}

async function assertTransitionRequirements(
  tx: Tx,
  bidding: { id: string; sessionDate: Date | null },
  nextStatus: string,
  now: Date,
) {
  if (nextStatus === BIDDING_STATUS.PUBLISHED) {
    const [lots, [assignment]] = await Promise.all([
      tx.select({ id: biddingLots.id, itemCount: sql<number>`(SELECT count(*)::integer FROM "BiddingLotItem" i WHERE i."biddingLotId" = ${biddingLots.id})` }).from(biddingLots).where(eq(biddingLots.biddingId, bidding.id)),
      tx.select({ id: biddingAppointmentAssignments.id }).from(biddingAppointmentAssignments).where(and(eq(biddingAppointmentAssignments.biddingId, bidding.id), eq(biddingAppointmentAssignments.status, "Ativa"))).limit(1),
    ]);
    if (!assignment) throw new BiddingWorkflowError("Vincule uma comissão ou agente de contratação antes de publicar a licitação.");
    if (!lots.length) throw new BiddingWorkflowError("Cadastre ao menos um lote antes de publicar a licitação.");
    if (lots.some((lot) => lot.itemCount === 0)) throw new BiddingWorkflowError("Todos os lotes precisam possuir ao menos um item antes da publicação.");
  }

  if (nextStatus === BIDDING_STATUS.OPEN) {
    if (!bidding.sessionDate || bidding.sessionDate.getTime() <= now.getTime()) {
      throw new BiddingWorkflowError("Defina um prazo futuro para a sessão antes de abrir a disputa.");
    }
    const participant = await tx.select({ id: biddingParticipants.id }).from(biddingParticipants).where(eq(biddingParticipants.biddingId, bidding.id)).limit(1);
    if (!participant.length) throw new BiddingWorkflowError("Cadastre ao menos um participante antes de abrir a disputa.");
  }

  if (nextStatus === BIDDING_STATUS.HOMOLOGATED) {
    const lots = await tx.select({ id: biddingLots.id, hasResult: sql<boolean>`EXISTS (SELECT 1 FROM "BiddingResult" r WHERE r."biddingLotId" = ${biddingLots.id} AND r."isCurrent" = true)` }).from(biddingLots).where(eq(biddingLots.biddingId, bidding.id));
    if (!lots.length || lots.some((lot) => !lot.hasResult)) {
      throw new BiddingWorkflowError("Registre a arrematação de todos os lotes antes de homologar a licitação.");
    }
  }
}

async function changeBiddingStatus(id: string, requestedStatus: string): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const status = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [bidding] = await tx.select({ id: biddings.id, status: biddings.status, sessionDate: biddings.sessionDate }).from(biddings).where(eq(biddings.id, id)).limit(1);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");

      const { current, next } = assertBiddingStatusTransition(bidding.status, requestedStatus);
      const now = new Date();
      await assertTransitionRequirements(tx, bidding, next, now);
      const claimed = await tx.update(biddings).set({ status: next }).where(and(eq(biddings.id, bidding.id), eq(biddings.status, bidding.status))).returning({ id: biddings.id });
      if (claimed.length !== 1) {
        throw new BiddingWorkflowError("A situação da licitação foi alterada por outra operação. Atualize a página e tente novamente.");
      }

      const phaseId = await ensureBiddingPhases(tx, bidding.id, next, now);
      await tx.update(biddingLots).set({ status: biddingLotStatusForBiddingStatus(next) }).where(eq(biddingLots.biddingId, bidding.id));

      const idempotencyKey = randomUUID();
      await writeBiddingAct(tx, {
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        type: "STATUS_TRANSITION",
        description: `${current} para ${next}`,
        phaseId,
        idempotencyKey: `BIDDING:${bidding.id}:STATUS:${idempotencyKey}`,
      });
      await writeLifecycleEvent(tx, {
        eventType: "BIDDING_STATUS_TRANSITION",
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        sourceType: current,
        sourceId: next,
        idempotencyKey: `BIDDING:${bidding.id}:STATUS:${idempotencyKey}:LIFECYCLE`,
      });

      return next;
    });

    revalidateBiddingPaths(id);
    return { success: true, status };
  } catch (error) {
    return actionError(error, "Falha ao alterar a situação da licitação.");
  }
}

export async function transitionBiddingStatus(id: string, nextStatus: string) {
  return changeBiddingStatus(id, nextStatus);
}

export async function inactivateBidding(id: string) {
  return changeBiddingStatus(id, BIDDING_STATUS.INACTIVE);
}

export async function saveBidding(formData: FormData): Promise<BiddingActionResult> {
  const id = formText(formData, "id") || null;
  const context = await getTenantContextForModuleOperation("COMPRAS", id ? "update" : "create");

  try {
    const number = formText(formData, "number");
    const modality = formText(formData, "modality");
    const processId = formText(formData, "processId");
    const publicationDate = optionalDate(formText(formData, "publicationDate"), "Data de publicação");
    const sessionDate = optionalDate(formText(formData, "sessionDate"), "Data da sessão");

    if (!processId) return { success: false, error: "Selecione o processo de compra vinculado." };
    if (publicationDate && sessionDate && sessionDate < publicationDate) {
      return { success: false, error: "A sessão não pode ocorrer antes da publicação." };
    }

    const [process] = await (context.database ?? db).select({ id: purchaseProcesses.id }).from(purchaseProcesses).where(eq(purchaseProcesses.id, processId)).limit(1);
    if (!process) return { success: false, error: "O processo de compra selecionado não existe." };

    if (id) {
      const [existing] = await (context.database ?? db).select({ id: biddings.id, modality: biddings.modality, status: biddings.status }).from(biddings).where(eq(biddings.id, id)).limit(1);
      if (!existing) return { success: false, error: "Licitação não encontrada." };
      if (!canEditBiddingDetails(existing.status)) {
        return { success: false, error: "Somente licitações em elaboração podem ter seus dados alterados." };
      }
      if (!number) return { success: false, error: "Informe o número da licitação." };
      if (modality && modality !== existing.modality) {
        return { success: false, error: "A modalidade é definida na criação para preservar a numeração do certame." };
      }

      const [duplicate] = await (context.database ?? db).select({ id: biddings.id }).from(biddings).where(and(eq(biddings.number, number), ne(biddings.id, existing.id))).limit(1);
      if (duplicate) return { success: false, error: BIDDING_NUMBER_DUPLICATE_ERROR };

      await (context.database ?? db).update(biddings).set({ number, processId: process.id, publicationDate, sessionDate }).where(eq(biddings.id, existing.id));
      revalidateBiddingPaths(existing.id);
      return { success: true, id: existing.id };
    }

    if (!isBiddingModality(modality)) return { success: false, error: "Selecione uma modalidade válida." };

    const biddingId = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const finalNumber = number || await nextYearlyCodeDrizzle({
        db: tx,
        key: biddingSequenceKey(modality),
        prefix: biddingModalityPrefix(modality),
        existingCodes: (await tx.select({ number: biddings.number }).from(biddings)).map(({ number: code }) => ({ code })),
      });

      const [duplicate] = number ? await tx.select({ id: biddings.id }).from(biddings).where(eq(biddings.number, finalNumber)).limit(1) : [];
      if (duplicate) throw new BiddingWorkflowError(BIDDING_NUMBER_DUPLICATE_ERROR);

      const [bidding] = await tx.insert(biddings).values({
          number: finalNumber,
          modality,
          status: BIDDING_STATUS.DRAFT,
          publicationDate,
          sessionDate,
          processId: process.id,
      }).returning();
      const phaseId = await ensureBiddingPhases(tx, bidding.id, BIDDING_STATUS.DRAFT);
      await writeBiddingAct(tx, {
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        type: "BIDDING_CREATED",
        description: "Certame criado em elaboração.",
        phaseId,
        idempotencyKey: `BIDDING:${bidding.id}:CREATED:ACT`,
      });
      await writeLifecycleEvent(tx, {
        eventType: "BIDDING_CREATED",
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        sourceType: "BIDDING_STATUS",
        sourceId: BIDDING_STATUS.DRAFT,
        idempotencyKey: `BIDDING:${bidding.id}:CREATED`,
      });
      return bidding.id;
    });

    revalidateBiddingPaths(biddingId);
    return { success: true, id: biddingId };
  } catch (error) {
    const duplicateNumberError = biddingNumberDuplicateError(error);
    if (duplicateNumberError) return { success: false, ...duplicateNumberError };
    return actionError(error, "Falha ao salvar a licitação.");
  }
}

export async function initializeBiddingWorkflow(biddingId: string): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [bidding] = await tx.select({ id: biddings.id, status: biddings.status }).from(biddings).where(eq(biddings.id, biddingId)).limit(1);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");
      const phaseCount = (await tx.select({ id: biddingPhases.id }).from(biddingPhases).where(and(eq(biddingPhases.biddingId, bidding.id), eq(biddingPhases.version, 1)))).length;
      const phaseId = await ensureBiddingPhases(tx, bidding.id, bidding.status);
      if (phaseCount < BIDDING_PHASE_DEFINITIONS.length) {
        await writeBiddingAct(tx, {
          biddingId: bidding.id,
          actorUsuarioId: context.user.id,
          type: "WORKFLOW_INITIALIZED",
          description: "Fases persistidas foram inicializadas para o certame.",
          phaseId,
        });
      }
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, id: biddingId };
  } catch (error) {
    return actionError(error, "Falha ao inicializar as fases da licitação.");
  }
}

export async function createBiddingAppointment(input: {
  biddingId: string;
  kind: string;
  name: string;
  members: BiddingAppointmentMemberInput[];
  role?: string;
  appointedAt?: string;
  endsAt?: string;
  notes?: string;
}): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const kind = requiredText(input.kind, "Tipo de designação");
    const name = requiredText(input.name, "Nome da designação");
    const members = input.members.map((member) => ({
      employeeId: requiredText(member.employeeId, "Servidor designado"),
      role: requiredText(member.role, "Função do servidor"),
    }));
    if (!members.length) throw new BiddingWorkflowError("Informe ao menos um servidor para a designação.");
    const memberKeys = new Set(members.map((member) => `${member.employeeId}:${member.role}`));
    if (memberKeys.size !== members.length) throw new BiddingWorkflowError("Não repita o mesmo servidor na mesma função.");

    const appointedAt = optionalDate(input.appointedAt?.trim() ?? "", "Data da designação");
    const endsAt = optionalDate(input.endsAt?.trim() ?? "", "Data final da designação");
    if (appointedAt && endsAt && endsAt < appointedAt) throw new BiddingWorkflowError("A vigência não pode terminar antes da designação.");

    const appointmentId = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[bidding], selectedEmployees] = await Promise.all([
        tx.select({ id: biddings.id, status: biddings.status }).from(biddings).where(eq(biddings.id, biddingId)).limit(1),
        tx.select({ id: employees.id }).from(employees).where(and(inArray(employees.id, members.map(member => member.employeeId)), eq(employees.isActive, true))),
      ]);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");
      if (isTerminalBiddingStatus(bidding.status)) throw new BiddingWorkflowError("Não é possível alterar a comissão de uma licitação encerrada.");
      if (selectedEmployees.length !== new Set(members.map((member) => member.employeeId)).size) {
        throw new BiddingWorkflowError("Um ou mais servidores não estão ativos.");
      }

      const [appointment] = await tx.insert(biddingAppointments).values({
          kind,
          name,
          appointedAt,
          endsAt,
          notes: input.notes?.trim() || null,
      }).returning();
      await tx.insert(biddingAppointmentMembers).values(members.map(member => ({ appointmentId: appointment.id, employeeId: member.employeeId, role: member.role, appointedAt, endsAt })));
      await tx.insert(biddingAppointmentAssignments).values({ appointmentId: appointment.id, biddingId: bidding.id, role: input.role?.trim() || null });
      const phaseId = await currentPhaseId(tx, bidding.id);
      await writeBiddingAct(tx, {
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        type: "APPOINTMENT_ASSIGNED",
        description: `${appointment.name} foi designada para o certame.`,
        phaseId,
      });
      return appointment.id;
    });

    revalidateBiddingPaths(biddingId);
    return { success: true, id: appointmentId, created: true };
  } catch (error) {
    return actionError(error, "Falha ao registrar a designação da comissão.");
  }
}

export async function assignBiddingAppointment(input: { biddingId: string; appointmentId: string; role?: string }): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const appointmentId = requiredText(input.appointmentId, "Designação");
    const assignmentId = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[bidding], [appointment]] = await Promise.all([
        tx.select({ id: biddings.id, status: biddings.status }).from(biddings).where(eq(biddings.id, biddingId)).limit(1),
        tx.select({ id: biddingAppointments.id, name: biddingAppointments.name, status: biddingAppointments.status }).from(biddingAppointments).where(eq(biddingAppointments.id, appointmentId)).limit(1),
      ]);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");
      if (!appointment || appointment.status !== "Ativa") throw new BiddingWorkflowError("A designação informada não está ativa.");
      if (isTerminalBiddingStatus(bidding.status)) throw new BiddingWorkflowError("Não é possível alterar a comissão de uma licitação encerrada.");

      const [current] = await tx.select({ id: biddingAppointmentAssignments.id }).from(biddingAppointmentAssignments).where(and(eq(biddingAppointmentAssignments.biddingId, bidding.id), eq(biddingAppointmentAssignments.appointmentId, appointment.id))).limit(1);
      const [assignment] = current
        ? await tx.update(biddingAppointmentAssignments).set({ status: "Ativa", endedAt: null, role: input.role?.trim() || null }).where(eq(biddingAppointmentAssignments.id, current.id)).returning()
        : await tx.insert(biddingAppointmentAssignments).values({ biddingId: bidding.id, appointmentId: appointment.id, role: input.role?.trim() || null }).returning();
      const phaseId = await currentPhaseId(tx, bidding.id);
      await writeBiddingAct(tx, {
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        type: "APPOINTMENT_ASSIGNED",
        description: `${appointment.name} foi vinculada ao certame.`,
        phaseId,
      });
      return assignment.id;
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, id: assignmentId };
  } catch (error) {
    return actionError(error, "Falha ao vincular a designação ao certame.");
  }
}

export async function endBiddingAppointmentAssignment(input: { biddingId: string; assignmentId: string }): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const assignmentId = requiredText(input.assignmentId, "Vínculo de designação");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [row] = await tx.select({ assignment: biddingAppointmentAssignments, appointment: { name: biddingAppointments.name }, bidding: { status: biddings.status } }).from(biddingAppointmentAssignments).innerJoin(biddingAppointments, eq(biddingAppointments.id, biddingAppointmentAssignments.appointmentId)).innerJoin(biddings, eq(biddings.id, biddingAppointmentAssignments.biddingId)).where(and(eq(biddingAppointmentAssignments.id, assignmentId), eq(biddingAppointmentAssignments.biddingId, biddingId))).limit(1);
      const assignment = row ? { ...row.assignment, appointment: row.appointment, bidding: row.bidding } : null;
      if (!assignment) throw new BiddingWorkflowError("Vínculo de designação não encontrado.");
      if (isTerminalBiddingStatus(assignment.bidding.status)) throw new BiddingWorkflowError("Não é possível alterar a comissão de uma licitação encerrada.");
      if (assignment.status === "Encerrada") return;
      await tx.update(biddingAppointmentAssignments).set({ status: "Encerrada", endedAt: new Date() }).where(eq(biddingAppointmentAssignments.id, assignment.id));
      const phaseId = await currentPhaseId(tx, biddingId);
      await writeBiddingAct(tx, {
        biddingId,
        actorUsuarioId: context.user.id,
        type: "APPOINTMENT_ENDED",
        description: `${assignment.appointment.name} teve sua vinculação encerrada.`,
        phaseId,
      });
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, id: assignmentId };
  } catch (error) {
    return actionError(error, "Falha ao encerrar a designação do certame.");
  }
}

export async function createBiddingLot(input: {
  biddingId: string;
  description?: string;
  items: BiddingLotItemInput[];
}): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      const itemId = requiredText(item.purchaseProcessItemId, "Item do processo");
      if (quantities.has(itemId)) throw new BiddingWorkflowError("Um item do processo só pode ser informado uma vez no lote.");
      quantities.set(itemId, requiredQuantity(item.quantity, "Quantidade do item"));
    }
    if (!quantities.size) throw new BiddingWorkflowError("Selecione ao menos um item para o lote.");

    const lotId = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [bidding] = await tx.select({ id: biddings.id, processId: biddings.processId, status: biddings.status }).from(biddings).where(eq(biddings.id, biddingId)).limit(1);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");
      if (!canConfigureBiddingLots(bidding.status)) {
        throw new BiddingWorkflowError("Os lotes só podem ser alterados enquanto a licitação está em elaboração.");
      }

      const itemIds = [...quantities.keys()];
      const [processItems, alreadyAssigned] = await Promise.all([
        tx.select({ id: purchaseProcessItems.id, quantity: purchaseProcessItems.quantity, estimatedUnitValue: purchaseProcessItems.estimatedUnitValue }).from(purchaseProcessItems).where(and(inArray(purchaseProcessItems.id, itemIds), eq(purchaseProcessItems.purchaseProcessId, bidding.processId))),
        tx.select({ purchaseProcessItemId: biddingLotItems.purchaseProcessItemId }).from(biddingLotItems).innerJoin(biddingLots, eq(biddingLots.id, biddingLotItems.biddingLotId)).where(and(inArray(biddingLotItems.purchaseProcessItemId, itemIds), eq(biddingLots.biddingId, bidding.id))),
      ]);
      if (processItems.length !== itemIds.length) throw new BiddingWorkflowError("Um ou mais itens não pertencem ao processo desta licitação.");
      if (alreadyAssigned.length) throw new BiddingWorkflowError("Um ou mais itens já pertencem a outro lote deste certame.");

      let estimatedValue = new Decimal(0);
      for (const item of processItems) {
        const quantity = quantities.get(item.id);
        if (!quantity || quantity > item.quantity) {
          throw new BiddingWorkflowError("A quantidade do lote não pode ser maior que a quantidade disponível no processo.");
        }
        estimatedValue = estimatedValue.plus(new Decimal(String(item.estimatedUnitValue ?? 0)).mul(String(quantity)));
      }

      const [lastLot] = await tx.select({ number: biddingLots.number }).from(biddingLots).where(eq(biddingLots.biddingId, bidding.id)).orderBy(desc(biddingLots.number)).limit(1);
      const [lot] = await tx.insert(biddingLots).values({
          biddingId: bidding.id,
          number: (lastLot?.number ?? 0) + 1,
          description: input.description?.trim() || null,
          status: BIDDING_LOT_STATUS.DRAFT,
          estimatedValueDecimal: estimatedValue.toDecimalPlaces(2),
      }).returning();
      await tx.insert(biddingLotItems).values(processItems.map(item => ({ biddingLotId: lot.id, purchaseProcessItemId: item.id, quantity: quantities.get(item.id) ?? 0 })));
      const phaseId = await currentPhaseId(tx, bidding.id);
      await writeBiddingAct(tx, {
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        type: "LOT_CREATED",
        description: `Lote ${lot.number} foi criado com ${processItems.length} item(ns).`,
        phaseId,
        biddingLotId: lot.id,
      });
      return lot.id;
    });

    revalidateBiddingPaths(biddingId);
    return { success: true, id: lotId, created: true };
  } catch (error) {
    return actionError(error, "Falha ao criar o lote da licitação.");
  }
}

export async function addBiddingParticipant(input: {
  biddingId: string;
  supplierId: string;
  displayCode?: string;
  notes?: string;
}): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const supplierId = requiredText(input.supplierId, "Fornecedor");
    const displayCode = input.displayCode?.trim() || null;
    const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[bidding], [supplier]] = await Promise.all([
        tx.select({ id: biddings.id, status: biddings.status }).from(biddings).where(eq(biddings.id, biddingId)).limit(1),
        tx.select({ id: suppliers.id, status: suppliers.status }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1),
      ]);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");
      if (!canRegisterBiddingParticipant(bidding.status)) {
        throw new BiddingWorkflowError("Participantes só podem ser registrados antes da abertura da disputa.");
      }
      if (!supplier || !isActiveStatus(supplier.status)) throw new BiddingWorkflowError("O fornecedor selecionado não está ativo.");
      if (displayCode) {
        const [duplicateCode] = await tx.select({ id: biddingParticipants.id }).from(biddingParticipants).where(and(eq(biddingParticipants.biddingId, bidding.id), eq(biddingParticipants.displayCode, displayCode))).limit(1);
        if (duplicateCode) throw new BiddingWorkflowError("Este código de participante já está em uso no certame.");
      }

      const [existing] = await tx.select({ id: biddingParticipants.id }).from(biddingParticipants).where(and(eq(biddingParticipants.biddingId, bidding.id), eq(biddingParticipants.supplierId, supplier.id))).limit(1);
      if (existing) return { id: existing.id, created: false };

      const [participant] = await tx.insert(biddingParticipants).values({
          biddingId: bidding.id,
          supplierId: supplier.id,
          displayCode,
          notes: input.notes?.trim() || null,
      }).returning();
      const phaseId = await currentPhaseId(tx, bidding.id);
      await writeBiddingAct(tx, {
        biddingId: bidding.id,
        actorUsuarioId: context.user.id,
        type: "PARTICIPANT_REGISTERED",
        description: `Participante ${participant.displayCode || participant.id} foi registrado.`,
        phaseId,
      });
      return { id: participant.id, created: true };
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, ...result };
  } catch (error) {
    return actionError(error, "Falha ao registrar o participante.");
  }
}

export async function saveSupplierPortalIdentity(input: {
  biddingId: string;
  supplierId: string;
  usuarioId: string;
}): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const supplierId = requiredText(input.supplierId, "Fornecedor");
    const usuarioId = requiredText(input.usuarioId, "Usuário do portal");
    const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [[participant], [user]] = await Promise.all([
        tx.select({ id: biddingParticipants.id, supplier: { status: suppliers.status } }).from(biddingParticipants).innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId)).where(and(eq(biddingParticipants.biddingId, biddingId), eq(biddingParticipants.supplierId, supplierId))).limit(1),
        tx.select({ id: users.id, ativo: users.ativo }).from(users).where(eq(users.id, usuarioId)).limit(1),
      ]);
      if (!participant) throw new BiddingWorkflowError("Registre o fornecedor como participante antes de liberar o portal.");
      if (!isActiveStatus(participant.supplier.status)) throw new BiddingWorkflowError("O fornecedor não está ativo para usar o portal.");
      if (!user?.ativo) throw new BiddingWorkflowError("O usuário selecionado não está ativo.");

      const [current] = await tx.select({ id: supplierPortalIdentities.id }).from(supplierPortalIdentities).where(and(eq(supplierPortalIdentities.supplierId, supplierId), eq(supplierPortalIdentities.usuarioId, usuarioId))).limit(1);
      const [identity] = current
        ? await tx.update(supplierPortalIdentities).set({ status: "Ativo" }).where(eq(supplierPortalIdentities.id, current.id)).returning()
        : await tx.insert(supplierPortalIdentities).values({ supplierId, usuarioId, status: "Ativo" }).returning();
      const phaseId = await currentPhaseId(tx, biddingId);
      await writeBiddingAct(tx, {
        biddingId,
        actorUsuarioId: context.user.id,
        type: "SUPPLIER_PORTAL_LINKED",
        description: "Acesso autenticado do fornecedor foi vinculado ao certame.",
        phaseId,
      });
      return { id: identity.id, created: !current };
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, ...result };
  } catch (error) {
    return actionError(error, "Falha ao vincular o acesso do fornecedor.");
  }
}

export async function registerBiddingAct(input: {
  biddingId: string;
  type: string;
  description?: string;
  phaseId?: string;
  biddingLotId?: string;
}): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const type = requiredText(input.type, "Tipo do ato");
    const phaseId = input.phaseId?.trim() || null;
    const biddingLotId = input.biddingLotId?.trim() || null;
    const actId = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [bidding] = await tx.select({ id: biddings.id, status: biddings.status }).from(biddings).where(eq(biddings.id, biddingId)).limit(1);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");
      if (isTerminalBiddingStatus(bidding.status)) throw new BiddingWorkflowError("Não é possível registrar novos atos em uma licitação encerrada.");
      if (phaseId) {
        const [phase] = await tx.select({ id: biddingPhases.id }).from(biddingPhases).where(and(eq(biddingPhases.id, phaseId), eq(biddingPhases.biddingId, biddingId))).limit(1);
        if (!phase) throw new BiddingWorkflowError("A fase selecionada não pertence à licitação.");
      }
      if (biddingLotId) {
        const [lot] = await tx.select({ id: biddingLots.id }).from(biddingLots).where(and(eq(biddingLots.id, biddingLotId), eq(biddingLots.biddingId, biddingId))).limit(1);
        if (!lot) throw new BiddingWorkflowError("O lote selecionado não pertence à licitação.");
      }
      const act = await writeBiddingAct(tx, {
        biddingId,
        actorUsuarioId: context.user.id,
        type,
        description: input.description?.trim() || null,
        phaseId,
        biddingLotId,
      });
      return act.id;
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, id: actId, created: true };
  } catch (error) {
    return actionError(error, "Falha ao registrar o ato da licitação.");
  }
}

export async function decideBiddingEligibility(input: {
  biddingId: string;
  biddingLotId: string;
  participantId: string;
  status: string;
  reason?: string;
  idempotencyKey?: string;
}): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const biddingLotId = requiredText(input.biddingLotId, "Lote");
    const participantId = requiredText(input.participantId, "Participante");
    const status = requiredText(input.status, "Decisão de habilitação");
    if (status !== BIDDING_ELIGIBILITY_STATUS.ELIGIBLE && status !== BIDDING_ELIGIBILITY_STATUS.INELIGIBLE) {
      throw new BiddingWorkflowError("Informe uma decisão de habilitação válida.");
    }
    const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();

    const decisionId = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [existing] = await tx.select({ id: biddingEligibilities.id, biddingLotId: biddingEligibilities.biddingLotId, participantId: biddingEligibilities.participantId }).from(biddingEligibilities).where(eq(biddingEligibilities.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        if (existing.biddingLotId !== biddingLotId || existing.participantId !== participantId) {
          throw new BiddingWorkflowError("A chave de idempotência já pertence a outra decisão.");
        }
        return existing.id;
      }
      const [[bidding], [lot], [participant]] = await Promise.all([
        tx.select({ id: biddings.id, status: biddings.status }).from(biddings).where(eq(biddings.id, biddingId)).limit(1),
        tx.select({ id: biddingLots.id }).from(biddingLots).where(and(eq(biddingLots.id, biddingLotId), eq(biddingLots.biddingId, biddingId))).limit(1),
        tx.select({ id: biddingParticipants.id, displayCode: biddingParticipants.displayCode }).from(biddingParticipants).where(and(eq(biddingParticipants.id, participantId), eq(biddingParticipants.biddingId, biddingId))).limit(1),
      ]);
      if (!bidding) throw new BiddingWorkflowError("Licitação não encontrada.");
      if (!canDecideBiddingEligibility(bidding.status)) throw new BiddingWorkflowError("Não é possível decidir a habilitação de uma licitação encerrada.");
      if (!lot || !participant) throw new BiddingWorkflowError("O lote ou participante não pertence à licitação.");

      const [decision] = await tx.insert(biddingEligibilities).values({
          biddingLotId,
          participantId,
          status,
          reason: input.reason?.trim() || null,
          decidedByUsuarioId: context.user.id,
          idempotencyKey,
      }).returning();
      const phaseId = await currentPhaseId(tx, biddingId);
      await writeBiddingAct(tx, {
        biddingId,
        actorUsuarioId: context.user.id,
        type: "ELIGIBILITY_DECIDED",
        description: `${participant.displayCode || "Participante"}: ${status}.`,
        phaseId,
        biddingLotId,
        idempotencyKey: `${idempotencyKey}:ACT`,
      });
      await writeLifecycleEvent(tx, {
        eventType: "BIDDING_ELIGIBILITY_DECIDED",
        biddingId,
        actorUsuarioId: context.user.id,
        sourceType: "BIDDING_LOT",
        sourceId: biddingLotId,
        idempotencyKey: `${idempotencyKey}:LIFECYCLE`,
      });
      return decision.id;
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, id: decisionId };
  } catch (error) {
    return actionError(error, "Falha ao registrar a habilitação do participante.");
  }
}

export async function decideBiddingResult(input: {
  biddingId: string;
  biddingLotId: string;
  biddingBidId: string;
  idempotencyKey?: string;
}): Promise<BiddingActionResult> {
  const context = await getTenantContextForModuleOperation("COMPRAS", "update");
  try {
    const biddingId = requiredText(input.biddingId, "Licitação");
    const biddingLotId = requiredText(input.biddingLotId, "Lote");
    const biddingBidId = requiredText(input.biddingBidId, "Lance");
    const idempotencyKey = input.idempotencyKey?.trim() || randomUUID();
    const resultId = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [existing] = await tx.select({ id: biddingResults.id, biddingLotId: biddingResults.biddingLotId, biddingBidId: biddingResults.biddingBidId }).from(biddingResults).where(eq(biddingResults.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        if (existing.biddingLotId !== biddingLotId || existing.biddingBidId !== biddingBidId) {
          throw new BiddingWorkflowError("A chave de idempotência já pertence a outra arrematação.");
        }
        return existing.id;
      }

      const [lotRow] = await tx.select({ lot: biddingLots, bidding: { status: biddings.status } }).from(biddingLots).innerJoin(biddings, eq(biddings.id, biddingLots.biddingId)).where(and(eq(biddingLots.id, biddingLotId), eq(biddingLots.biddingId, biddingId))).limit(1);
      const lot = lotRow ? { ...lotRow.lot, bidding: lotRow.bidding } : null;
      if (!lot) throw new BiddingWorkflowError("O lote não pertence à licitação.");
      if (!canDecideBiddingResult(lot.bidding.status)) {
        throw new BiddingWorkflowError("A arrematação só pode ser registrada durante o julgamento.");
      }
      const [bidRow] = await tx.select({ bid: biddingBids, participant: { id: biddingParticipants.id, biddingId: biddingParticipants.biddingId, displayCode: biddingParticipants.displayCode } }).from(biddingBids).innerJoin(biddingParticipants, eq(biddingParticipants.id, biddingBids.participantId)).where(and(eq(biddingBids.id, biddingBidId), eq(biddingBids.biddingLotId, biddingLotId))).limit(1);
      const bid = bidRow ? { ...bidRow.bid, participant: bidRow.participant } : null;
      if (!bid || bid.participant.biddingId !== biddingId) throw new BiddingWorkflowError("O lance não pertence ao lote desta licitação.");
      if (bid.status !== BIDDING_BID_STATUS.ACCEPTED) throw new BiddingWorkflowError("Somente lances aceitos podem ser arrematados.");

      const [eligibility] = await tx.select({ status: biddingEligibilities.status }).from(biddingEligibilities).where(and(eq(biddingEligibilities.biddingLotId, biddingLotId), eq(biddingEligibilities.participantId, bid.participantId))).orderBy(desc(biddingEligibilities.decidedAt), desc(biddingEligibilities.createdAt)).limit(1);
      if (!eligibility || !isBiddingParticipantEligible(eligibility.status)) {
        throw new BiddingWorkflowError("O participante precisa estar habilitado neste lote para receber a arrematação.");
      }

      const phaseId = await currentPhaseId(tx, biddingId);
      const act = await writeBiddingAct(tx, {
        biddingId,
        actorUsuarioId: context.user.id,
        type: "RESULT_AWARDED",
        description: `Lote ${lot.number} arrematado pelo participante ${bid.participant.displayCode || bid.participant.id}.`,
        phaseId,
        biddingLotId,
        idempotencyKey: `${idempotencyKey}:ACT`,
      });
      await tx.update(biddingResults).set({ isCurrent: false }).where(and(eq(biddingResults.biddingLotId, biddingLotId), eq(biddingResults.isCurrent, true)));
      const [result] = await tx.insert(biddingResults).values({
          biddingLotId,
          participantId: bid.participantId,
          biddingBidId: bid.id,
          biddingActId: act.id,
          status: BIDDING_RESULT_STATUS.AWARDED,
          unitValueDecimal: bid.unitValueDecimal,
          totalValueDecimal: bid.totalValueDecimal,
          decidedByUsuarioId: context.user.id,
          idempotencyKey,
      }).returning();
      await tx.update(biddingLots).set({ status: BIDDING_LOT_STATUS.AWARDED }).where(eq(biddingLots.id, biddingLotId));
      await writeLifecycleEvent(tx, {
        eventType: "BIDDING_LOT_AWARDED",
        biddingId,
        actorUsuarioId: context.user.id,
        sourceType: "BIDDING_LOT",
        sourceId: biddingLotId,
        idempotencyKey: `${idempotencyKey}:LIFECYCLE`,
      });
      return result.id;
    });
    revalidateBiddingPaths(biddingId);
    return { success: true, id: resultId };
  } catch (error) {
    return actionError(error, "Falha ao registrar a arrematação do lote.");
  }
}

export async function submitBiddingBid(input: {
  participantId: string;
  biddingLotId: string;
  totalValue: number;
  unitValue?: number | null;
  idempotencyKey: string;
}): Promise<BiddingActionResult> {
  const context = await getCurrentTenantContext();
  try {
    const participantId = requiredText(input.participantId, "Participante");
    const biddingLotId = requiredText(input.biddingLotId, "Lote");
    const idempotencyKey = requiredText(input.idempotencyKey, "Chave de idempotência");
    const totalValueDecimal = requiredMoney(input.totalValue, "Valor total do lance");
    const unitValueDecimal = optionalMoney(input.unitValue, "Valor unitário do lance");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
          const [participantRow] = await tx.select({ participant: biddingParticipants, supplier: { status: suppliers.status }, bidding: { id: biddings.id, status: biddings.status, sessionDate: biddings.sessionDate } }).from(biddingParticipants).innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId)).innerJoin(biddings, eq(biddings.id, biddingParticipants.biddingId)).where(eq(biddingParticipants.id, participantId)).limit(1);
          const participant = participantRow ? { ...participantRow.participant, supplier: participantRow.supplier, bidding: participantRow.bidding } : null;
          if (!participant || isInactiveParticipantStatus(participant.status)) {
            throw new BiddingWorkflowError("O participante não está ativo para apresentar lances.");
          }

          const [identity] = await tx.select({ id: supplierPortalIdentities.id }).from(supplierPortalIdentities).where(and(eq(supplierPortalIdentities.supplierId, participant.supplierId), eq(supplierPortalIdentities.usuarioId, context.user.id), eq(supplierPortalIdentities.status, "Ativo"))).limit(1);
          if (!identity || !isActiveStatus(participant.supplier.status)) {
            throw new BiddingWorkflowError("Sua conta não possui acesso ativo para enviar lances deste fornecedor.");
          }

          const [existing] = await tx.select().from(biddingBids).where(eq(biddingBids.idempotencyKey, idempotencyKey)).limit(1);
          if (existing) {
            if (
              existing.biddingLotId !== biddingLotId
              || existing.participantId !== participant.id
              || existing.supplierPortalIdentityId !== identity.id
              || !existing.totalValueDecimal.equals(totalValueDecimal)
              || !decimalsEqual(existing.unitValueDecimal, unitValueDecimal)
            ) {
              throw new BiddingWorkflowError("A chave de idempotência já foi usada para outro lance.");
            }
            return { id: existing.id, alreadySubmitted: true, biddingId: participant.bidding.id };
          }

          const [lot] = await tx.select({ id: biddingLots.id, status: biddingLots.status }).from(biddingLots).where(and(eq(biddingLots.id, biddingLotId), eq(biddingLots.biddingId, participant.bidding.id))).limit(1);
          if (!lot) throw new BiddingWorkflowError("O lote não pertence a este certame.");
          if (!participant.bidding.sessionDate) throw new BiddingWorkflowError("O certame não possui prazo definido para lances.");
          if (!isBiddingBidSubmissionOpen({
            biddingStatus: participant.bidding.status,
            lotStatus: lot.status,
            deadline: participant.bidding.sessionDate,
          })) {
            throw new BiddingWorkflowError("O prazo de lances está encerrado ou a disputa não está aberta.");
          }

          const [eligibility] = await tx.select({ status: biddingEligibilities.status }).from(biddingEligibilities).where(and(eq(biddingEligibilities.biddingLotId, lot.id), eq(biddingEligibilities.participantId, participant.id))).orderBy(desc(biddingEligibilities.decidedAt), desc(biddingEligibilities.createdAt)).limit(1);
          if (!eligibility || !isBiddingParticipantEligible(eligibility.status)) {
            throw new BiddingWorkflowError("Seu fornecedor precisa estar habilitado neste lote antes de apresentar lances.");
          }

          const [lastBid] = await tx.select({ sequence: biddingBids.sequence }).from(biddingBids).where(eq(biddingBids.biddingLotId, lot.id)).orderBy(desc(biddingBids.sequence)).limit(1);
          const [bid] = await tx.insert(biddingBids).values({
              biddingLotId: lot.id,
              participantId: participant.id,
              supplierPortalIdentityId: identity.id,
              kind: "Lance",
              unitValueDecimal,
              totalValueDecimal,
              sequence: (lastBid?.sequence ?? 0) + 1,
              status: BIDDING_BID_STATUS.ACCEPTED,
              idempotencyKey,
          }).returning();
          const phaseId = await currentPhaseId(tx, participant.bidding.id);
          await writeBiddingAct(tx, {
            biddingId: participant.bidding.id,
            actorUsuarioId: context.user.id,
            type: "BID_SUBMITTED",
            description: `Lance ${bid.sequence} recebido para o lote ${lot.id}.`,
            phaseId,
            biddingLotId: lot.id,
            idempotencyKey: `${idempotencyKey}:ACT`,
          });
          await writeLifecycleEvent(tx, {
            eventType: "BIDDING_BID_SUBMITTED",
            biddingId: participant.bidding.id,
            actorUsuarioId: context.user.id,
            sourceType: "BIDDING_LOT",
            sourceId: lot.id,
            idempotencyKey: `${idempotencyKey}:LIFECYCLE`,
          });
          return { id: bid.id, alreadySubmitted: false, biddingId: participant.bidding.id };
        });
        revalidateBiddingPaths(result.biddingId);
        return { success: true, id: result.id, alreadySubmitted: result.alreadySubmitted };
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        const [existing] = await (context.database ?? db).select().from(biddingBids).where(eq(biddingBids.idempotencyKey, idempotencyKey)).limit(1);
        if (existing) {
          if (
            existing.biddingLotId !== biddingLotId
            || existing.participantId !== participantId
            || !existing.totalValueDecimal.equals(totalValueDecimal)
            || !decimalsEqual(existing.unitValueDecimal, unitValueDecimal)
          ) {
            throw new BiddingWorkflowError("A chave de idempotência já foi usada para outro lance.");
          }
          revalidateBiddingPaths();
          return { success: true, id: existing.id, alreadySubmitted: true };
        }
        if (attempt === 2) throw new BiddingWorkflowError("Outro lance foi registrado ao mesmo tempo. Tente novamente.");
      }
    }
    throw new BiddingWorkflowError("Não foi possível registrar o lance.");
  } catch (error) {
    return actionError(error, "Falha ao registrar o lance.");
  }
}
