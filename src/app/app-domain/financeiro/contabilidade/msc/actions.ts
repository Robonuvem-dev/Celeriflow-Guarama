"use server";

import { db, databaseConnection } from "@/db/client";
import { lookupMscConfigurationChoices, readMscFinancialYear, readMscUnitBinding } from "@/db/repositories/finance/msc-configuration";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AccessError, getTenantContextForModule, getTenantContextForModuleOperation, assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { captureMscReference2026, configureMscMapping, configureMscReportingScope } from "@/lib/financeiro/msc-configuration";

export async function importMscReference(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
  const file = form.get("referenceFile");
  if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024) throw new Error("Selecione a captura oficial JSON de até 8 MB.");
  await captureMscReference2026(databaseConnection, context, await file.text());
  revalidatePath("/financeiro/contabilidade/msc");
}

export async function saveMscMapping(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
  const values = Object.fromEntries(["kind", "canonicalId", "referenceEntryId", "governmentEntityId", "budgetUnitId", "financialYearId", "effectiveFrom", "effectiveUntil", "predecessorEntryId", "poEntryId", "fpEntryId", "dcEntryId", "coEntryId", "reason"].map(key => [key, String(form.get(key) ?? "")]));
  await configureMscMapping(databaseConnection, context, { ...values, omitCo: form.get("omitCo") === "on", omitDc: form.get("omitDc") === "on" });
  revalidatePath("/financeiro/contabilidade/msc");
  revalidatePath("/financeiro/contabilidade/lancamentos");
}

export async function saveMscReportingScope(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
  await configureMscReportingScope(databaseConnection, context, { governmentEntityId: String(form.get("governmentEntityId") ?? ""), financialYearId: String(form.get("financialYearId") ?? ""), institutionCode: String(form.get("institutionCode") ?? ""), entityIds: form.getAll("entityIds").map(String), predecessorEntryId: String(form.get("predecessorEntryId") ?? ""), reason: String(form.get("reason") ?? "") });
  revalidatePath("/financeiro/contabilidade/msc");
}

async function readMscChoices(raw: unknown) {
  const input = z.object({ field: z.enum(["ACCOUNT", "SOURCE", "REVENUE", "EXPENSE", "MSC_ACCOUNT", "MSC_FR", "MSC_NR", "MSC_ND", "MSC_PO", "MSC_FP", "MSC_DC", "MSC_CO", "PREDECESSOR"]), kind: z.enum(["ACCOUNT", "SOURCE", "REVENUE", "EXPENSE"]), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), financialYearId: z.string().min(1), canonicalId: z.string().default(""), q: z.string().trim().max(150).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(raw);
  const context = await getTenantContextForModule("FINANCEIRO");
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  const executor = context.database ?? db;
  const [year, binding] = await Promise.all([readMscFinancialYear(executor, input.financialYearId), readMscUnitBinding(executor, input.budgetUnitId)]);
  if (year.governmentEntityId !== input.governmentEntityId || binding.governmentEntityId !== input.governmentEntityId) throw new Error("Seleção MSC fora do ente/exercício/UG autorizado.");
  return lookupMscConfigurationChoices(executor, { ...input, year: year.year });
}

export async function lookupMscChoice(raw: unknown): Promise<{ options: Array<{ id: string; name: string }>; total: number; page: number } | { error: string }> {
  try {
    return await readMscChoices(raw);
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Seleção inválida." };
    return { error: "Não foi possível pesquisar. Confira o ente, a UG e o exercício selecionados." };
  }
}
