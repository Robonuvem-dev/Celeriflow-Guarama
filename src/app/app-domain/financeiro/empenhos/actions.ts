"use server";

import { databaseConnection, db } from "@/db/client";
import { findBudgetAppropriation, findBudgetReservation, findExpenseRequest, findFinanceCommitment } from "@/db/repositories/finance/budget-execution";
import { hasFinanceProcurementEvent } from "@/db/repositories/finance/procurement-origins";
import { FinanceError, cancelCommitment as cancelOfficialCommitment, createCommitment as createOfficialCommitment } from "@/lib/financeiro";
import {
  ProcurementFinanceBridgeError,
  cancelCommitmentForCancelledContract,
  createCommitmentFromExpenseAuthorization,
  procurementFinanceEventTypes,
} from "@/lib/compras/procurement-finance-bridge";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string };

function message(error: unknown) {
  return error instanceof FinanceError || error instanceof ProcurementFinanceBridgeError ? error.message : "Não foi possível concluir o empenho.";
}

async function assertCommitmentAccess(context: AppContext, commitmentId: string) {
  const commitment = await findFinanceCommitment(db, commitmentId);
  if (!commitment) throw new FinanceError("Empenho não encontrado.");
  assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnitId);
  return commitment;
}

async function expenseAuthorizationForReservation(context: AppContext, reservationId: string) {
  const reservation = await findBudgetReservation(db, reservationId);
  if (!reservation) throw new FinanceError("Reserva orçamentária não encontrada.");
  const appropriation = await findBudgetAppropriation(db, reservation.appropriationId);
  if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
  assertBudgetUnitAccess(context.user, appropriation.budgetUnitId);

  const expense = reservation.expenseId ? await findExpenseRequest(db, { id: reservation.expenseId }) : null;
  if (
    !expense
    || expense.sourceModule !== "COMPRAS"
    || expense.sourceType !== "CONTRACT"
    || !expense.sourceId
    || expense.eventType !== procurementFinanceEventTypes.expenseAuthorizationCreated
  ) {
    return { reservation, expense: null };
  }
  return { reservation, expense };
}

function revalidateContractExecution(contractId?: string | null) {
  if (!contractId) return;
  revalidatePath("/compras/contratos");
  revalidatePath(`/compras/contratos/${contractId}`);
}

function revalidateProtocolProcess(processId?: string | null) {
  if (!processId) return;
  for (const path of [
    "/protocolos",
    "/protocolos/processos",
    `/protocolos/processos/${processId}`,
    "/protocolos/acompanhamento",
    "/app-domain/protocolos",
    "/app-domain/protocolos/processos",
    `/app-domain/protocolos/processos/${processId}`,
    "/app-domain/protocolos/acompanhamento",
  ]) {
    revalidatePath(path);
  }
}

export async function createCommitment(data: {
  number: string;
  date: Date;
  value: number;
  type: string;
  history: string;
  appropriationId: string;
  supplierId: string;
  reservationId: string;
  processId?: string;
  contractId?: string;
  obrasServiceId?: string;
  covenantId?: string;
  publicityCampaignId?: string;
  fundedDebtId?: string;
}): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    const { reservation, expense } = await expenseAuthorizationForReservation(context, data.reservationId);
    if (reservation.appropriationId !== data.appropriationId) {
      throw new FinanceError("A reserva selecionada não pertence à dotação informada.");
    }
    if (expense && data.contractId && data.contractId !== expense.sourceId) {
      throw new ProcurementFinanceBridgeError("O contrato informado não corresponde à AE selecionada.");
    }
    if (expense && data.supplierId && data.supplierId !== expense.supplierId) {
      throw new ProcurementFinanceBridgeError("O fornecedor informado não corresponde à AE selecionada.");
    }

    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    const commitment = expense
      ? (await createCommitmentFromExpenseAuthorization(databaseConnection, actor, {
        expenseId: expense.id,
        reservationId: reservation.id,
        reservationNumber: reservation.number,
        commitmentNumber: data.number,
        date: data.date,
        value: data.value,
        type: data.type,
        history: data.history,
      })).commitment
      : await createOfficialCommitment(databaseConnection, actor, data);
    revalidatePath("/financeiro/empenhos");
    revalidatePath("/financeiro/orcamento");
    revalidateContractExecution(commitment.contractId);
    if (data.obrasServiceId) {
      revalidatePath("/obras");
      revalidatePath("/obras/ordens-servico");
      revalidatePath("/iluminacao-publica/ordens-servico");
      revalidatePath("/iluminacao-publica/iluminacao-energia");
    }
    revalidateProtocolProcess(commitment.processId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

// Financial values are corrected through cancellation and a new official record.
export async function updateCommitment(_id: string, _data: {
  number?: string;
  date?: Date;
  value?: number;
  type?: string;
  history?: string;
  appropriationId?: string;
  supplierId?: string;
  processId?: string;
  contractId?: string;
}): Promise<ActionResult> {
  void _id;
  void _data;
  return { error: "Empenhos não podem ser editados. Anule o registro e emita um novo empenho." };
}

export async function cancelCommitment(id: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "delete");
    const commitment = await assertCommitmentAccess(context, id);
    const fromProcurement = await hasFinanceProcurementEvent(db, procurementFinanceEventTypes.commitmentCreated, "COMMITMENT", id);
    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    if (fromProcurement) {
      await cancelCommitmentForCancelledContract(databaseConnection, actor, id);
    } else {
      await cancelOfficialCommitment(databaseConnection, actor, id);
    }
    revalidatePath("/financeiro/empenhos");
    revalidatePath("/financeiro/orcamento");
    revalidateContractExecution(commitment.contractId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}
