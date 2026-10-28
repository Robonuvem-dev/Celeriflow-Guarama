"use server";

import { randomUUID } from "node:crypto";
import { FinanceError, collectLaunchedRevenue, createRevenue, launchRevenue, redistributeRevenueResourceSource, reverseRevenue, type RevenueClassification } from "@/lib/financeiro";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { databaseConnection, db } from "@/db/client";
import { findFinanceBankAccount } from "@/db/repositories/finance/treasury";

type ActionResult = { error?: string };
const message = (error: unknown) => error instanceof Error ? error.message : "Nao foi possivel concluir a operacao de receita.";

const classificationSchema = z.enum(["ORCAMENTARIA", "INTRAORCAMENTARIA", "REDUTORA"]);
const baseRevenueSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data valida."),
  value: z.number().finite().positive("Informe um valor maior que zero."),
  revenueNatureId: z.string().trim().min(1, "Selecione a natureza da receita."),
  resourceSourceId: z.string().trim().min(1, "Selecione a fonte de recursos."),
  classification: classificationSchema,
  history: z.string().trim().max(500, "O historico deve ter no maximo 500 caracteres.").optional(),
});
const revenueSchema = baseRevenueSchema.extend({ budgetUnitId: z.string().trim().min(1, "Selecione a unidade gestora.") });

function parseDate(raw: string) {
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw) throw new FinanceError("Informe uma data valida.");
  return date;
}

async function assertAccountAccess(context: AppContext, bankAccountId: string) {
  const account = await findFinanceBankAccount(db, bankAccountId);
  if (!account?.budgetUnitId) throw new FinanceError("A conta bancaria deve estar vinculada a uma Unidade Gestora.");
  assertBudgetUnitAccess(context.user, account.budgetUnitId);
}

function revalidateRevenuePaths() {
  revalidatePath("/financeiro/receitas");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/relatorios");
}

function revenueActor(context: AppContext) {
  return { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
}

export async function launchRevenueAction(data: z.infer<typeof revenueSchema>): Promise<ActionResult> {
  const parsed = revenueSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados da receita invalidos." };
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    assertBudgetUnitAccess(context.user, parsed.data.budgetUnitId);
    await launchRevenue(databaseConnection, revenueActor(context), {
      ...parsed.data,
      date: parseDate(parsed.data.date),
      sourceModule: "FINANCEIRO",
      sourceType: "MANUAL_REVENUE",
      eventType: "REVENUE_LAUNCHED_MANUAL",
      idempotencyKey: `FINANCEIRO:MANUAL_REVENUE:LAUNCH:${randomUUID()}`,
    });
    revalidateRevenuePaths();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function collectRevenueAction(data: { revenueId: string; date: string; bankAccountId: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await assertAccountAccess(context, data.bankAccountId);
    await collectLaunchedRevenue(databaseConnection, revenueActor(context), { revenueId: data.revenueId, date: parseDate(data.date), bankAccountId: data.bankAccountId, idempotencyKey: `FINANCEIRO:MANUAL_REVENUE:COLLECT:${randomUUID()}` });
    revalidateRevenuePaths();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function recordRevenueCollectionAction(data: z.infer<typeof revenueSchema> & { bankAccountId: string }): Promise<ActionResult> {
  const parsed = baseRevenueSchema.extend({ bankAccountId: z.string().trim().min(1, "Selecione a conta bancaria.") }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados da receita invalidos." };
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await assertAccountAccess(context, parsed.data.bankAccountId);
    await createRevenue(databaseConnection, revenueActor(context), {
      ...parsed.data,
      date: parseDate(parsed.data.date),
      sourceModule: "FINANCEIRO",
      sourceType: "MANUAL_REVENUE",
      eventType: "REVENUE_COLLECTED_MANUAL",
      idempotencyKey: `FINANCEIRO:MANUAL_REVENUE:COLLECT:${randomUUID()}`,
    });
    revalidateRevenuePaths();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function reverseRevenueAction(data: { revenueId: string; date: string; justification: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "delete");
    await reverseRevenue(databaseConnection, revenueActor(context), { revenueId: data.revenueId, date: parseDate(data.date), justification: data.justification });
    revalidateRevenuePaths();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function redistributeRevenueResourceSourceAction(data: { revenueId: string; date: string; value: number; destinationResourceSourceId: string; history: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await redistributeRevenueResourceSource(databaseConnection, revenueActor(context), {
      ...data,
      date: parseDate(data.date),
      idempotencyKey: `FINANCEIRO:MANUAL_REVENUE:REDISTRIBUTION:${randomUUID()}`,
    });
    revalidateRevenuePaths();
    return {};
  } catch (error) { return { error: message(error) }; }
}

export type RevenueActionClassification = RevenueClassification;
