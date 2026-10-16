"use server";

import { revalidatePath } from "next/cache";
import { canViewModule, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { allocateMunicipalCost, configureMunicipalCosts, correctMunicipalCost, MunicipalCostError } from "@/lib/financeiro/cost-ledger";
import { createMunicipalCostObject, deleteMunicipalCostObjectTree, saveMunicipalCostItem, adoptStandardMunicipalCostItems, linkMunicipalCostItems, createMunicipalCostRule, generateMunicipalCostObjectsFromLoa, copyAnnualMunicipalCostRelations } from "@/lib/financeiro/cost-catalog";
import type { CostSourceType, CostShare, CostAmount } from "@/lib/financeiro/cost-types";
import { retireMunicipalCostRule } from "@/lib/financeiro/cost-catalog";

const actor = (context: AppContext) => ({ usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
const date = (value: string) => { const parsed = new Date(`${value}T12:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new MunicipalCostError("Data inválida."); return parsed; };
async function command(operation: "create" | "update" | "delete", work: (context: AppContext) => Promise<unknown>) {
  try { const context = await getTenantContextForModuleOperation("FINANCEIRO", operation); await work(context); revalidatePath("/financeiro/custos"); revalidatePath("/financeiro/liquidacoes"); return {}; }
  catch (error) { return { error: error instanceof MunicipalCostError ? error.message : "Não foi possível concluir a operação de custos." }; }
}

export async function configureCostsAction(input: { financialYearId: string; enabled: boolean; sourceTypes: CostSourceType[]; effectiveFrom: string; reason: string }) { return command("update", context => configureMunicipalCosts(context.prisma, actor(context), { ...input, effectiveFrom: date(input.effectiveFrom) })); }
export async function createCostObjectAction(input: { financialYearId: string; budgetUnitId?: string; parentId?: string; description: string; detailedDescription: string }) { return command("create", context => createMunicipalCostObject(context.prisma, actor(context), input)); }
export async function deleteCostObjectTreeAction(id: string) { return command("delete", context => deleteMunicipalCostObjectTree(context.prisma, actor(context), id)); }
export async function saveCostItemAction(input: { financialYearId: string; id?: string; identifier: string; description: string; detailedDescription: string; identificationClass: string; behavior: "FIXED" | "VARIABLE"; isActive: boolean }) { return command("update", context => saveMunicipalCostItem(context.prisma, actor(context), input)); }
export async function adoptCostItemsAction(financialYearId: string) { return command("create", context => adoptStandardMunicipalCostItems(context.prisma, actor(context), financialYearId)); }
export async function linkCostItemsAction(input: { objectIds: string[]; itemIds: string[] }) { return command("update", context => linkMunicipalCostItems(context.prisma, actor(context), input)); }
export async function generateCostObjectsAction(input: { instrumentId: string; financialYearId: string; level: 1 | 2 | 3 | 4 | 5 | 6 }) { return command("create", context => generateMunicipalCostObjectsFromLoa(context.prisma, actor(context), input)); }
export async function createCostRuleAction(input: { financialYearId: string; budgetUnitId: string; title: string; sourceType: CostSourceType; selector: Record<string, string>; shares: CostShare[]; priority: number; effectiveFrom: string; effectiveUntil?: string }) { return command("create", async context => {
  if (["STOCK_CONSUMPTION", "IMMEDIATE_MATERIAL"].includes(input.sourceType) && ["materialId", "categoryId", "subcategoryId", "warehouseId", "departmentId"].some(key => input.selector[key])) {
    if (!canViewModule(context.user, "PATRIMONIO") || !await context.prisma.configuracaoModulo.count({ where: { codigo: "PATRIMONIO", ativo: true } })) throw new MunicipalCostError("Critérios de almoxarifado exigem leitura autorizada do módulo Patrimônio ativo.");
  }
  if (input.sourceType === "PAYROLL" && ["employeeId", "contractId", "payrollCode", "workLocation"].some(key => input.selector[key])) {
    if (!canViewModule(context.user, "RH") || !await context.prisma.configuracaoModulo.count({ where: { codigo: "RH", ativo: true } })) throw new MunicipalCostError("Critérios individuais de folha exigem leitura autorizada do módulo RH ativo.");
  }
  return createMunicipalCostRule(context.prisma, actor(context), { ...input, effectiveFrom: date(input.effectiveFrom), effectiveUntil: input.effectiveUntil ? date(input.effectiveUntil) : undefined });
}); }
export async function allocateCostAction(input: { sourceId: string; date: string; reason: string; idempotencyKey: string; allocations: CostAmount[] }) { return command("create", context => allocateMunicipalCost(context.prisma, actor(context), { ...input, date: date(input.date) })); }
export async function correctCostAction(input: { movementId: string; date: string; reason: string; idempotencyKey: string; kind: "REVERSAL" | "RESTORATION" }) { return command("update", context => correctMunicipalCost(context.prisma, actor(context), { ...input, date: date(input.date) })); }
export async function copyAnnualCostRelationsAction(input: { sourceFinancialYearId: string; targetFinancialYearId: string }) { return command("create", context => copyAnnualMunicipalCostRelations(context.prisma, actor(context), input)); }
export async function retireCostRuleAction(input: { id: string; reason: string }) { return command("update", context => retireMunicipalCostRule(context.prisma, actor(context), input)); }
