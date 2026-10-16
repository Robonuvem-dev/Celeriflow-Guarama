"use server";

import { cancelPayableCarryForward, createSettlement, cancelSettlement, FinanceError, reregisterPayableCarryForward, trackPayableCarryForwardPayment } from "@/lib/financeiro";
import { createPayment } from "../pagamentos/actions";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { transportCarryForward, undoCarryForwardTransport } from "@/lib/financeiro/carry-forward-transport";

type ActionResult = { error?: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir o acompanhamento do resto a pagar.";
const financeActor = (context: Awaited<ReturnType<typeof getTenantContextForModuleOperation>>) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });

async function assertPayableCarryForwardAccess(payableCarryForwardId: string, operation: ModuleOperation) {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", operation);
  const payable = await context.prisma.payableCarryForward.findUnique({
    where: { id: payableCarryForwardId },
    select: { commitment: { select: { appropriation: { select: { budgetUnitId: true } } } } },
  });
  if (!payable) throw new FinanceError("Resto a pagar não encontrado.");
  assertBudgetUnitAccess(context.user, payable.commitment.appropriation.budgetUnitId);
  return context;
}

function revalidateRap() {
  revalidatePath("/financeiro/restos-a-pagar");
  revalidatePath("/financeiro/contabilidade");
}

export async function issueRapPayment(data: { payableCarryForwardId: string; settlementId: string; bankAccountId: string; orderNumber: string; date: string; value: string }): Promise<ActionResult> {
  try {
    const context = await assertPayableCarryForwardAccess(data.payableCarryForwardId, "create");
    const payable = await context.prisma.payableCarryForward.findUniqueOrThrow({ where: { id: data.payableCarryForwardId }, select: { commitmentId: true, commitment: { select: { supplierId: true } } } });
    const date = new Date(`${data.date}T12:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) throw new FinanceError("Informe uma data válida para o pagamento.");
    const result = await createPayment({ ...data, date, commitmentId: payable.commitmentId, supplierId: payable.commitment.supplierId, paymentMethod: "Transferência" });
    if (result.error) return result;
    revalidateRap();
    revalidatePath("/financeiro/pagamentos");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function transportRap(data: { payableCarryForwardId: string; sourceFinancialYearId: string; targetFinancialYearId: string; reason: string; requestKey: string }) {
  try {
    const context = await assertPayableCarryForwardAccess(data.payableCarryForwardId, "update");
    const result = await transportCarryForward(context.prisma, financeActor(context), data);
    revalidateRap();
    revalidatePath("/financeiro/contabilidade/disponibilidade");
    return { payableCarryForwardId: result.payableCarryForwardId, replay: result.replay };
  } catch (error) { return { error: message(error) }; }
}

export async function undoRapTransport(data: { payableCarryForwardId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await assertPayableCarryForwardAccess(data.payableCarryForwardId, "update");
    await undoCarryForwardTransport(context.prisma, financeActor(context), data);
    revalidateRap();
    revalidatePath("/financeiro/contabilidade/disponibilidade");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function liquidateRap(data: { payableCarryForwardId: string; date: string; value: string; documentId: string; authorId: string }): Promise<ActionResult> {
  try {
    const context = await assertPayableCarryForwardAccess(data.payableCarryForwardId, "create");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new FinanceError("Informe uma data válida para liquidação.");
    const date = new Date(`${data.date}T12:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.date) throw new FinanceError("Data de liquidação inválida.");
    const payable = await context.prisma.payableCarryForward.findUniqueOrThrow({ where: { id: data.payableCarryForwardId }, select: { commitmentId: true } });
    await createSettlement(context.prisma, financeActor(context), { ...data, date, commitmentId: payable.commitmentId });
    revalidateRap();
    revalidatePath("/financeiro/liquidacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function cancelRapSettlement(settlementId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "delete");
    const settlement = await context.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId }, select: { payableCarryForwardId: true, commitment: { select: { appropriation: { select: { budgetUnitId: true } } } } } });
    if (!settlement.payableCarryForwardId) throw new FinanceError("Selecione uma liquidação nativa de RAP.");
    assertBudgetUnitAccess(context.user, settlement.commitment.appropriation.budgetUnitId);
    await cancelSettlement(context.prisma, financeActor(context), settlementId);
    revalidateRap();
    revalidatePath("/financeiro/liquidacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function trackRapPayment(data: { payableCarryForwardId: string; paymentId: string; value: number }): Promise<ActionResult> {
  try {
    const context = await assertPayableCarryForwardAccess(data.payableCarryForwardId, "update");
    await trackPayableCarryForwardPayment(context.prisma, financeActor(context), data);
    revalidateRap();
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function cancelRap(data: { payableCarryForwardId: string; justification: string }): Promise<ActionResult> {
  try {
    const context = await assertPayableCarryForwardAccess(data.payableCarryForwardId, "delete");
    await cancelPayableCarryForward(context.prisma, financeActor(context), data);
    revalidateRap();
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function reregisterRap(data: { payableCarryForwardId: string; targetFinancialYearId: string; justification: string }): Promise<ActionResult> {
  try {
    const context = await assertPayableCarryForwardAccess(data.payableCarryForwardId, "create");
    await reregisterPayableCarryForward(context.prisma, financeActor(context), data);
    revalidateRap();
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}
