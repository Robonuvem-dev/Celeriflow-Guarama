"use server";

import {
  FinanceError,
  cancelBudgetReservation,
  createExpenseRequest,
  createExpenseRequestFromApprovedPurchaseReceipt,
  approveExpenseRequest,
  createBudgetReservation,
  setFinancialYearStatus,
} from "@/lib/financeiro";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { databaseConnection, db } from "@/db/client";
import { findBudgetAppropriation, findBudgetReservation, findExpenseRequest } from "@/db/repositories/finance/budget-execution";
import { deleteFinanceMasterData, insertFinanceMasterData, updateFinanceMasterData } from "@/db/repositories/finance/master-data";

type ActionResult = { error?: string };
const budgetActor = (context: AppContext) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
type MasterDataType = "budgetUnit" | "resourceSource" | "revenueNature" | "expenseNature";
type ProcurementOriginPolicy = "NONE" | "PROCUREMENT_SOURCE" | "CONTRACT";
type MasterDataInput = { code: string; name: string; secretariatId?: string; procurementOriginPolicy?: ProcurementOriginPolicy };

function failure(error: unknown, fallback: string) {
  return { error: error instanceof FinanceError ? error.message : fallback };
}

function validateMasterData(data: MasterDataInput, type: MasterDataType) {
  if (!data.code.trim() || !data.name.trim()) throw new FinanceError("Código e nome são obrigatórios.");
  if (type === "budgetUnit" && !data.secretariatId) throw new FinanceError("Selecione a secretaria da unidade orçamentária.");
  if (type === "expenseNature" && data.procurementOriginPolicy && !["NONE", "PROCUREMENT_SOURCE", "CONTRACT"].includes(data.procurementOriginPolicy)) {
    throw new FinanceError("Política de origem da contratação inválida.");
  }
}

async function assertAppropriationAccess(context: AppContext, appropriationId: string) {
  const appropriation = await findBudgetAppropriation(db, appropriationId);
  if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
  assertBudgetUnitAccess(context.user, appropriation.budgetUnitId);
}

export async function createMasterData(type: MasterDataType, data: MasterDataInput): Promise<ActionResult> {
  try {
    validateMasterData(data, type);
    await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await insertFinanceMasterData(db, type, data);
    revalidatePath("/financeiro/orcamento/cadastros");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível criar o cadastro.");
  }
}

export async function updateMasterData(type: MasterDataType, id: string, data: MasterDataInput): Promise<ActionResult> {
  try {
    validateMasterData(data, type);
    await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await updateFinanceMasterData(db, type, id, data);
    revalidatePath("/financeiro/orcamento/cadastros");
    revalidatePath("/financeiro/orcamento");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível alterar o cadastro. Registros em uso não podem ser removidos ou alterados indevidamente.");
  }
}

export async function deleteMasterData(type: MasterDataType, id: string): Promise<ActionResult> {
  try {
    await getTenantContextForModuleOperation("FINANCEIRO", "delete");
    await deleteFinanceMasterData(db, type, id);
    revalidatePath("/financeiro/orcamento/cadastros");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível excluir o cadastro. Ele pode estar em uso por lançamentos financeiros.");
  }
}

export async function createBudgetReservationAction(data: { number: string; date: Date; value: number; appropriationId: string; expenseId?: string; justification?: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await assertAppropriationAccess(context, data.appropriationId);
    if (!data.expenseId) throw new FinanceError("Selecione uma solicitação de despesa aprovada.");
    await createBudgetReservation(databaseConnection, budgetActor(context), { ...data, expenseId: data.expenseId });
    revalidatePath("/financeiro/orcamento");
    revalidatePath("/financeiro/empenhos");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível criar a reserva orçamentária.");
  }
}

export async function createExpenseRequestAction(data: { date: Date; description: string; value: number; appropriationId: string; supplierId: string; secretariatId: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await assertAppropriationAccess(context, data.appropriationId);
    await createExpenseRequest(databaseConnection, budgetActor(context), { ...data, sourceModule: "FINANCEIRO", sourceType: "MANUAL_EXPENSE_REQUEST", eventType: "MANUAL_EXPENSE_REQUEST" });
    revalidatePath("/financeiro/orcamento");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível criar a solicitação de despesa.");
  }
}

export async function createExpenseRequestFromPurchaseReceiptAction(data: { purchaseReceiptId: string; date: Date; description: string; value: number; appropriationId: string; secretariatId: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await assertAppropriationAccess(context, data.appropriationId);
    await createExpenseRequestFromApprovedPurchaseReceipt(databaseConnection, budgetActor(context), data);
    revalidatePath("/financeiro/orcamento");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível criar a solicitação de despesa a partir do recebimento.");
  }
}

export async function approveExpenseRequestAction(expenseId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const expense = await findExpenseRequest(db, { id: expenseId });
    if (!expense) throw new FinanceError("Solicitação de despesa não encontrada.");
    await assertAppropriationAccess(context, expense.appropriationId);
    await approveExpenseRequest(databaseConnection, budgetActor(context), expenseId);
    revalidatePath("/financeiro/orcamento");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível aprovar a solicitação de despesa.");
  }
}

export async function cancelBudgetReservationAction(id: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "delete");
    const reservation = await findBudgetReservation(db, id);
    if (!reservation) throw new FinanceError("Reserva orçamentária não encontrada.");
    await assertAppropriationAccess(context, reservation.appropriationId);
    await cancelBudgetReservation(databaseConnection, budgetActor(context), id);
    revalidatePath("/financeiro/orcamento");
    revalidatePath("/financeiro/empenhos");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível cancelar a reserva orçamentária.");
  }
}

export async function setFinancialYearStatusAction(id: string, status: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await setFinancialYearStatus(databaseConnection, budgetActor(context), id, status);
    revalidatePath("/financeiro/orcamento");
    return {};
  } catch (error) {
    return failure(error, "Não foi possível atualizar o exercício financeiro.");
  }
}
