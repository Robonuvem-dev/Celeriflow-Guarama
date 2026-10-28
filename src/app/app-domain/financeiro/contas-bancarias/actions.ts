"use server";

import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator, type ModuleOperation } from "@/lib/platform/tenant-context";
import { createBankAccountWithOpeningBalance, createTreasuryTransfer, FinanceError, updateBankAccountDetails } from "@/lib/financeiro";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { configureBankResourceSources } from "@/lib/financeiro/bank-resource-sources";
import { databaseConnection, db } from "@/db/client";
import { findFinanceBankAccount } from "@/db/repositories/finance/treasury";

type ActionResult = { error?: string };

const transferSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  value: z.number().finite().positive("Informe um valor maior que zero."),
  sourceBankAccountId: z.string().trim().min(1, "Selecione a conta de origem."),
  destinationBankAccountId: z.string().trim().min(1, "Selecione a conta de destino."),
  resourceSourceId: z.string().trim().min(1).optional(),
  history: z.string().trim().max(500, "O histórico deve ter no máximo 500 caracteres.").optional(),
});

async function getFinanceContext(operation: ModuleOperation) {
  return getTenantContextForModuleOperation("FINANCEIRO", operation);
}
const bankActor = (context: Awaited<ReturnType<typeof getFinanceContext>>) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });

async function assertAccountAccess(context: Awaited<ReturnType<typeof getFinanceContext>>, accountId: string, nextBudgetUnitId?: string) {
  const account = await findFinanceBankAccount(db, accountId);
  if (!account) throw new FinanceError("Conta bancária não encontrada.");
  if (!isSystemAdministrator(context.user)) {
    if (!account.budgetUnitId) throw new FinanceError("Somente o administrador pode classificar uma conta bancária sem Unidade Gestora.");
    assertBudgetUnitAccess(context.user, account.budgetUnitId);
  }
  if (nextBudgetUnitId) assertBudgetUnitAccess(context.user, nextBudgetUnitId);
}

async function getTransferAccount(context: Awaited<ReturnType<typeof getFinanceContext>>, accountId: string) {
  const account = await findFinanceBankAccount(db, accountId);
  if (!account) throw new FinanceError("Conta bancária não encontrada.");
  if (!account.budgetUnitId) throw new FinanceError("A conta bancária deve estar vinculada a uma Unidade Gestora.");
  assertBudgetUnitAccess(context.user, account.budgetUnitId);
  return account;
}

export async function createBankAccount(data: {
  bankName: string;
  agency: string;
  bankId?: string;
  bankBranchId?: string;
  accountNumber: string;
  accountType: string;
  currentBalance: number;
  resourceSourceId: string;
  budgetUnitId: string;
  accountingPlanId: string;
  isActive: boolean;
}) {
  const context = await getFinanceContext("create");
  assertBudgetUnitAccess(context.user, data.budgetUnitId);
  const account = await createBankAccountWithOpeningBalance(databaseConnection, bankActor(context), {
    ...data,
    openingBalance: data.currentBalance,
  });

  revalidatePath("/app-domain/financeiro/contas-bancarias");
  revalidatePath("/app-domain/cadastros/bancos-agencias");
  return account;
}

export async function updateBankAccount(id: string, data: {
  bankName?: string;
  agency?: string;
  bankId?: string | null;
  bankBranchId?: string | null;
  accountNumber?: string;
  accountType?: string;
  currentBalance?: number;
  resourceSourceId?: string;
  budgetUnitId?: string;
  accountingPlanId?: string;
  isActive?: boolean;
}) {
  const context = await getFinanceContext("update");
  await assertAccountAccess(context, id, data.budgetUnitId);
  const account = await updateBankAccountDetails(databaseConnection, bankActor(context), id, data);

  revalidatePath("/app-domain/financeiro/contas-bancarias");
  revalidatePath("/app-domain/cadastros/bancos-agencias");
  return account;
}

export async function toggleBankAccountStatus(id: string, isActive: boolean) {
  const context = await getFinanceContext("update");
  await assertAccountAccess(context, id);
  const account = await updateBankAccountDetails(databaseConnection, bankActor(context), id, { isActive });

  revalidatePath("/app-domain/financeiro/contas-bancarias");
  return account;
}

export async function createTreasuryTransferAction(data: {
  date: string;
  value: number;
  sourceBankAccountId: string;
  destinationBankAccountId: string;
  resourceSourceId?: string;
  history?: string;
}): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados da transferência inválidos." };

  const date = new Date(`${parsed.data.date}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== parsed.data.date) {
    return { error: "Informe uma data válida." };
  }

  try {
    const context = await getFinanceContext("create");
    const [source, destination] = await Promise.all([
      getTransferAccount(context, parsed.data.sourceBankAccountId),
      getTransferAccount(context, parsed.data.destinationBankAccountId),
    ]);
    if (!parsed.data.resourceSourceId && (!source.resourceSourceId || source.resourceSourceId !== destination.resourceSourceId)) throw new FinanceError("Selecione a fonte comum às contas da transferência.");

    await createTreasuryTransfer(databaseConnection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, {
      ...parsed.data,
      date,
    });
    revalidatePath("/financeiro/contas-bancarias");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível concluir a transferência." };
  }
}

export async function saveBankResourceSources(bankAccountId: string, resourceSourceIds: string[]): Promise<ActionResult> {
  try {
    const context = await getFinanceContext("update");
    await assertAccountAccess(context, bankAccountId);
    await configureBankResourceSources(databaseConnection, bankActor(context), bankAccountId, resourceSourceIds);
    revalidatePath("/financeiro/contas-bancarias");
    revalidatePath("/financeiro/pagamentos");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível configurar as fontes da conta." }; }
}
