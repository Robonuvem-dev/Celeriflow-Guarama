"use server";

import { AssetLifecycleError, depreciateAssetsForMonth, recordAssetDisposal, recordAssetValueAdjustment, type AssetValueAdjustmentType } from "@/lib/patrimonio/asset-lifecycle";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { FinanceError } from "@/lib/financeiro";
import { reverseAssetValuation } from "@/lib/patrimonio/valuation-reversal";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string; message?: string };

function messageFor(error: unknown) {
  return error instanceof AssetLifecycleError || error instanceof FinanceError ? error.message : "Não foi possível concluir a operação patrimonial.";
}

function parseCompetence(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new AssetLifecycleError("Informe a competência no formato AAAA-MM.");
  const date = new Date(`${value}-01T12:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 7) !== value) {
    throw new AssetLifecycleError("Competência de depreciação inválida.");
  }
  return date;
}

export async function runMonthlyDepreciation(competence: string, budgetUnitId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "create");
    await getTenantContextForModuleOperation("FINANCEIRO", "create");
    const result = await depreciateAssetsForMonth(context.prisma, parseCompetence(competence), { budgetUnitId, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds } });
    revalidatePath("/patrimonio/ciclo-vida");
    revalidatePath("/patrimonio/bens");
    revalidatePath("/patrimonio");
    return { message: `${result.processed} bem(ns) depreciado(s); ${result.skipped} sem lançamento.` };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function registerAssetDisposal(input: {
  assetId: string;
  date: string;
  type: "Baixa" | "Alienação";
  reason: string;
  justification: string;
  disposalValue: string;
  financial?: { budgetUnitId: string; bankAccountId?: string; revenueNatureId?: string; resourceSourceId?: string };
}): Promise<ActionResult> {
  try {
    const date = new Date(`${input.date}T12:00:00.000Z`);
    if (!input.date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== input.date) {
      throw new AssetLifecycleError("Data da baixa inválida.");
    }
    const disposalValue = input.disposalValue.trim() === "" ? 0 : Number(input.disposalValue.replace(",", "."));
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "delete");
    if (input.type === "Alienação" && disposalValue > 0) await getTenantContextForModuleOperation("FINANCEIRO", "create");
    const writeOff = await recordAssetDisposal(context.prisma, {
      ...input,
      date,
      disposalValue,
      actor: { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds },
    });
    revalidatePath("/patrimonio/ciclo-vida");
    revalidatePath("/patrimonio/bens");
    revalidatePath("/patrimonio");
    revalidatePath("/frotas");
    revalidatePath("/patrimonio/bens", "layout");
    return { message: writeOff.integration.pending
      ? "Baixa registrada e frota vinculada inativada. O resultado contábil ficou pendente de parametrização; confira os vínculos financeiros da alienação, quando houver."
      : "Baixa patrimonial registrada com a evidência de valor contábil." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function registerAssetValueAdjustment(input: {
  assetId: string;
  date: string;
  type: AssetValueAdjustmentType;
  value: string;
  justification: string;
  evidence: string;
  budgetUnitId: string;
  idempotencyKey: string;
}): Promise<ActionResult> {
  try {
    const date = new Date(`${input.date}T12:00:00.000Z`);
    if (!input.date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== input.date) {
      throw new AssetLifecycleError("Data do ajuste inválida.");
    }
    const value = Number(input.value.replace(",", "."));
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
    await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await recordAssetValueAdjustment(context.prisma, { ...input, date, value }, { budgetUnitId: input.budgetUnitId, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds } });
    revalidatePath("/patrimonio/ciclo-vida");
    revalidatePath("/patrimonio/bens");
    revalidatePath("/patrimonio");
    return { message: "Ajuste de valor registrado com justificativa e evidência." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function reverseAssetValuationAction(input: { kind: "DEPRECIATION" | "ADJUSTMENT"; recordId: string; date: string; reason: string; idempotencyKey: string; budgetUnitId: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
    await getTenantContextForModuleOperation("FINANCEIRO", "update");
    const date = new Date(`${input.date}T12:00:00.000Z`);
    if (!input.date || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== input.date) throw new AssetLifecycleError("Data do estorno inválida.");
    await reverseAssetValuation(context.prisma, { budgetUnitId: input.budgetUnitId, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds } }, { ...input, date });
    revalidatePath("/patrimonio/ciclo-vida");
    revalidatePath("/patrimonio/bens");
    revalidatePath("/financeiro/contabilidade");
    return { message: "Fato patrimonial estornado com linhas originais preservadas e valor do bem recomposto." };
  } catch (error) { return { error: messageFor(error) }; }
}
