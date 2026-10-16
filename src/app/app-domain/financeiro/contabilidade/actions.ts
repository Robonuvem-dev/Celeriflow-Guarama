"use server";

import { FinanceError, authorizeAccountingMonthClose, authorizeAccountingMonthReopen, configureAccountingPostingRule, finalizeAnnualAccountingClose, postAccountingTransaction, prepareAnnualAccountingClose, requestAccountingMonthClose, requestAccountingMonthReopen } from "@/lib/financeiro";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { executeAnnualBalanceStage, undoAnnualBudgetStage, undoAnnualRapPostingStage, undoAnnualResultStage } from "@/lib/financeiro/annual-balance-stages";
import { captureAnnualConsistencyReport } from "@/lib/financeiro/annual-consistency";
import { executeAnnualPayableRegistration } from "@/lib/financeiro/annual-payable-registration";
import { executeAnnualEstimativeBalances } from "@/lib/financeiro/annual-estimative-balances";
import { executeAnnualRapPostings } from "@/lib/financeiro/annual-rap-postings";
import { executeAnnualExtraNoteTransport, undoAnnualExtraNoteTransport } from "@/lib/financeiro/annual-extra-note-transport";
import { prepareAnnualPaymentPrograms, transportAnnualPaymentPrograms, undoAnnualPaymentPrograms } from "@/lib/financeiro/annual-payment-program-transport";

type ActionResult = { error?: string };
const message = (error: unknown) => error instanceof FinanceError ? error.message : "Nao foi possivel concluir a operacao contabil.";

const financeActor = (context: Awaited<ReturnType<typeof getTenantContextForModuleOperation>>) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });

export async function captureAnnualConsistency(financialYearId: string) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
    return { report: await captureAnnualConsistencyReport(context.prisma, financeActor(context), financialYearId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível emitir a conferência anual." };
  }
}

export async function executeAnnualRegistration(data: { financialYearId: string; operation: "REGISTER" | "UNDO"; reason: string; requestKey: string }) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await executeAnnualPayableRegistration(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    revalidatePath("/financeiro/restos-a-pagar");
    return { stageId: result.stageId, replay: result.replay };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível executar a inscrição anual." };
  }
}

export async function executeEstimativeBalances(data: { financialYearId: string; operation: "KEEP" | "CANCEL_UNSETTLED"; reason: string; requestKey: string }) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await executeAnnualEstimativeBalances(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    revalidatePath("/financeiro/empenhos");
    revalidatePath("/financeiro/orcamento");
    revalidatePath("/financeiro/contabilidade/disponibilidade");
    return { stageId: result.stageId, replay: result.replay };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível preparar os saldos estimativos." };
  }
}

export async function executeAnnualStage(data: { stage: "OPENING" | "RESULT_CLOSE" | "BUDGET_CLOSE"; sourceFinancialYearId: string; targetFinancialYearId: string; resultAccountId: string; reason: string; requestKey: string }): Promise<{ error?: string; editionId?: string; replay?: boolean; provisional?: boolean }> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await executeAnnualBalanceStage(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/lancamentos");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return { editionId: result.editionId, replay: result.replay, provisional: result.provisional === true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível executar a etapa anual." };
  }
}

export async function undoAnnualResult(data: { editionId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await undoAnnualResultStage(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/lancamentos");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível desmovimentar a etapa anual." };
  }
}

export async function undoAnnualBudget(data: { editionId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await undoAnnualBudgetStage(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/lancamentos");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível desmovimentar o encerramento orçamentário." };
  }
}

export async function publishAnnualRapPostings(data: { financialYearId: string; reason: string; requestKey: string }) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await executeAnnualRapPostings(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/lancamentos");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return { editionId: result.editionId, replay: result.replay };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar as partidas RAP." }; }
}

export async function undoAnnualRapPostings(data: { editionId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await undoAnnualRapPostingStage(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/lancamentos");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível desmovimentar as partidas RAP." }; }
}

export async function transportAnnualExtraNotes(data: { sourceFinancialYearId: string; targetFinancialYearId: string; reason: string; requestKey: string }) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await executeAnnualExtraNoteTransport(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return { stageId: result.stageId, replay: result.replay };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível transportar as notas extraorçamentárias." }; }
}

export async function undoAnnualExtraNotes(data: { stageId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await undoAnnualExtraNoteTransport(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível desmovimentar as notas extraorçamentárias." }; }
}

export async function transportAnnualPrograms(data: { sourceFinancialYearId: string; targetFinancialYearId: string; paymentIds: string[]; reason: string; requestKey: string }) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await transportAnnualPaymentPrograms(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    revalidatePath("/financeiro/pagamentos");
    revalidatePath("/financeiro/restos-a-pagar");
    return { stageId: result.stageId, replay: result.replay };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível transportar as programações." }; }
}

export async function prepareAnnualPrograms(data: { sourceFinancialYearId: string; targetFinancialYearId: string; paymentIds: string[]; reason: string; requestKey: string }) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await prepareAnnualPaymentPrograms(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    revalidatePath("/financeiro/contabilidade");
    return { stageId: result.stageId, replay: result.replay };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível preparar as programações." }; }
}

export async function undoAnnualPrograms(data: { stageId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await undoAnnualPaymentPrograms(context.prisma, financeActor(context), data);
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    revalidatePath("/financeiro/pagamentos");
    revalidatePath("/financeiro/restos-a-pagar");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível desmovimentar as programações." }; }
}

export async function postManualAccountingTransaction(data: { financialYearId: string; governmentEntityId: string; budgetUnitId: string; date: string; history: string; debitAccountId: string; creditAccountId: string; value: number }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await postAccountingTransaction(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, {
      financialYearId: data.financialYearId,
      governmentEntityId: data.governmentEntityId,
      budgetUnitId: data.budgetUnitId,
      date: new Date(data.date),
      history: data.history,
      lines: [{ accountId: data.debitAccountId, type: "Débito", value: data.value }, { accountId: data.creditAccountId, type: "Crédito", value: data.value }],
    });
    revalidatePath("/financeiro/contabilidade");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function requestMonthClose(data: { financialYearId: string; competence: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await requestAccountingMonthClose(context.prisma, financeActor(context), data.financialYearId, new Date(data.competence));
    revalidatePath("/financeiro/contabilidade");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function authorizeMonthClose(data: { financialYearId: string; competence: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await authorizeAccountingMonthClose(context.prisma, financeActor(context), data.financialYearId, new Date(data.competence));
    revalidatePath("/financeiro/contabilidade");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function requestMonthReopen(data: { financialYearId: string; competence: string; justification: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await requestAccountingMonthReopen(context.prisma, financeActor(context), data.financialYearId, new Date(data.competence), data.justification);
    revalidatePath("/financeiro/contabilidade");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function authorizeMonthReopen(data: { financialYearId: string; competence: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await authorizeAccountingMonthReopen(context.prisma, financeActor(context), data.financialYearId, new Date(data.competence));
    revalidatePath("/financeiro/contabilidade");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function prepareAnnualClose(financialYearId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await prepareAnnualAccountingClose(context.prisma, financeActor(context), financialYearId);
    revalidatePath("/financeiro/contabilidade");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function finalizeAnnualClose(financialYearId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await finalizeAnnualAccountingClose(context.prisma, financeActor(context), financialYearId);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/orcamento");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function savePostingRule(data: { eventCode: string; eventName: string; debitAccountId: string; creditAccountId: string; isReference?: boolean; components?: { debitAccountId: string; creditAccountId: string; valueBasis: "EVENT_VALUE" | "PAYMENT_NET" | "PAYMENT_RETENTION"; creditFromOriginBank?: boolean }[] }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await configureAccountingPostingRule(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, data);
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contabilidade/eventos");
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}
