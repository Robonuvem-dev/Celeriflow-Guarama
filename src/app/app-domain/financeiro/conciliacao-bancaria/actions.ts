"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { BankReconciliationSession } from "@prisma/client";
import { importBankStatementCsv, matchBankStatementItemToTreasuryMovement } from "@/lib/financeiro";
import { runAutoReconciliation } from "@/lib/financeiro/reconciliation-engine";
import { importBankStatementOfc, importBankStatementOfx } from "@/lib/financeiro/ofx-import";
import { allocateBankReconciliation, confirmMunicipalReconciliation, openMunicipalReconciliation, readReconciliationPosition, reopenMunicipalReconciliation, reverseBankReconciliationAllocation } from "@/lib/financeiro/reconciliation-allocations";
import { getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";

type ActionResult<T = unknown> = { error?: string; data?: T };
type AutoReconciliationResult = Awaited<ReturnType<typeof runAutoReconciliation>>;
type ReconciliationReceipt = { session: BankReconciliationSession; recibo: string; hash: string };
const actorFor = (context: AppContext) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a conciliação bancária.";
const serializable = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const refresh = () => revalidatePath("/financeiro/conciliacao-bancaria");

export async function importBankStatementCsvAction(data: { bankAccountId: string; content: string; fileName?: string }): Promise<ActionResult> {
  try {
    const input = z.object({ bankAccountId: z.string().trim().min(1), content: z.string().min(1), fileName: z.string().trim().max(255).optional() }).parse(data);
    if (Buffer.byteLength(input.content, "utf8") > 2 * 1024 * 1024) return { error: "O arquivo CSV deve ter no máximo 2 MB." };
    if (input.fileName && !input.fileName.toLowerCase().endsWith(".csv")) return { error: "Envie um arquivo no formato CSV." };
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await importBankStatementCsv(context.prisma, actorFor(context), { ...input, fileName: input.fileName?.replace(/[\\/:]/g, "_") });
    refresh();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function matchBankStatementItemAction(data: { statementItemId: string; treasuryMovementId: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await matchBankStatementItemToTreasuryMovement(context.prisma, actorFor(context), data);
    refresh();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function importBankStatementFileAction(data: { bankAccountId: string; base64: string; fileName: string }): Promise<ActionResult<{ id: string; checksum: string }>> {
  try {
    const input = z.object({ bankAccountId: z.string().trim().min(1), base64: z.string().min(1).max(2800000).regex(/^[A-Za-z0-9+/]+={0,2}$/), fileName: z.string().trim().min(1).max(255).regex(/\.(?:csv|ofx|ofc)$/i) }).parse(data);
    const bytes = Buffer.from(input.base64, "base64");
    if (bytes.toString("base64") !== input.base64 || bytes.length > 2 * 1024 * 1024) return { error: "Arquivo inválido ou maior que 2 MB." };
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    const actor = actorFor(context);
    const result = /\.ofx$/i.test(input.fileName)
      ? await importBankStatementOfx(context.prisma, actor, { bankAccountId: input.bankAccountId, bytes, fileName: input.fileName })
      : /\.ofc$/i.test(input.fileName)
        ? await importBankStatementOfc(context.prisma, actor, { bankAccountId: input.bankAccountId, bytes, fileName: input.fileName })
        : await importBankStatementCsv(context.prisma, actor, { bankAccountId: input.bankAccountId, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes), originalBytes: bytes, fileName: input.fileName.replace(/[\\/:]/g, "_") });
    refresh();
    return { data: { id: result.id, checksum: result.checksum } };
  } catch (error) { return { error: message(error) }; }
}

export async function openReconciliationSessionAction(input: { banco: string; agencia: string; contaNumero: string; periodo: string; saldoInicial: number; bankAccountId?: string }): Promise<ActionResult<BankReconciliationSession>> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const accounts = await context.prisma.bankAccount.findMany({ where: input.bankAccountId ? { id: input.bankAccountId } : { bankName: input.banco.trim(), agency: input.agencia.trim(), accountNumber: input.contaNumero.trim() }, select: { id: true } });
    if (accounts.length !== 1) return { error: "Selecione uma conta municipal sem ambiguidade." };
    const session = await openMunicipalReconciliation(context.prisma, actorFor(context), { bankAccountId: accounts[0].id, period: input.periodo, openingBalance: input.saldoInicial });
    refresh();
    return { data: serializable(session) };
  } catch (error) { return { error: message(error) }; }
}

export async function runAutoReconciliationAction(sessionId: string): Promise<ActionResult<AutoReconciliationResult>> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await runAutoReconciliation(context.prisma, sessionId, actorFor(context));
    refresh();
    return { data: serializable(result) };
  } catch (error) { return { error: message(error) }; }
}

export async function confirmReconciliationSessionAction(sessionId: string): Promise<ActionResult<ReconciliationReceipt>> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const result = await confirmMunicipalReconciliation(context.prisma, actorFor(context), sessionId);
    refresh();
    return { data: serializable({ ...result, hash: createHash("sha256").update(`${result.recibo}:${sessionId}`).digest("hex") }) };
  } catch (error) { return { error: message(error) }; }
}

export async function getActiveReconciliationSessionsAction(): Promise<ActionResult<BankReconciliationSession[]>> {
  try {
    const context = await getTenantContextForModule("FINANCEIRO");
    const sessions = await context.prisma.bankReconciliationSession.findMany({ where: isSystemAdministrator(context.user) ? {} : { bankAccount: { budgetUnitId: { in: context.user.allowedBudgetUnitIds } } }, orderBy: { createdAt: "desc" }, take: 30 });
    return { data: serializable(sessions) };
  } catch (error) { return { error: message(error) }; }
}

export async function getReconciliationPositionAction(sessionId: string) {
  try {
    const context = await getTenantContextForModule("FINANCEIRO");
    const position = await readReconciliationPosition(context.prisma, actorFor(context), sessionId);
    return { data: {
      bank: position.bank.map((item) => ({ id: item.id, label: `${item.date.toISOString().slice(0, 10)} · ${item.description ?? item.reference ?? item.id}`, remaining: item.remaining.toFixed(2) })),
      treasury: position.treasury.filter((item) => item.remaining.gt(0)).map((item) => ({ id: item.id, label: `${item.date.toISOString().slice(0, 10)} · ${item.history ?? item.sourceId ?? item.id}`, remaining: item.remaining.toFixed(2) })),
      groups: position.groups.map((group) => ({ id: group.id, reason: group.reason, status: group.status, total: group.allocations.reduce((sum, row) => sum + Number(row.amountDecimal), 0).toFixed(2) })),
    } };
  } catch (error) { return { error: message(error) }; }
}

export async function allocateReconciliationAction(input: { sessionId: string; idempotencyKey: string; reason: string; allocations: Array<{ statementItemId: string; treasuryMovementId: string; amount: string | number }> }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await allocateBankReconciliation(context.prisma, actorFor(context), input);
    refresh();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function reverseReconciliationAllocationAction(input: { groupId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await reverseBankReconciliationAllocation(context.prisma, actorFor(context), input);
    refresh();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function reopenReconciliationSessionAction(input: { sessionId: string; reason: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await reopenMunicipalReconciliation(context.prisma, actorFor(context), input);
    refresh();
    return {};
  } catch (error) { return { error: message(error) }; }
}
