"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AccessError, getTenantContextForModule, getTenantContextForModuleOperation, assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { captureMscReference2026, configureMscMapping, configureMscReportingScope } from "@/lib/financeiro/msc-configuration";

export async function importMscReference(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
  const file = form.get("referenceFile");
  if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024) throw new Error("Selecione a captura oficial JSON de até 8 MB.");
  await captureMscReference2026(context, await file.text());
  revalidatePath("/financeiro/contabilidade/msc");
}

export async function saveMscMapping(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
  const values = Object.fromEntries(["kind", "canonicalId", "referenceEntryId", "governmentEntityId", "budgetUnitId", "financialYearId", "effectiveFrom", "effectiveUntil", "predecessorEntryId", "poEntryId", "fpEntryId", "dcEntryId", "coEntryId", "reason"].map(key => [key, String(form.get(key) ?? "")]));
  await configureMscMapping(context, { ...values, omitCo: form.get("omitCo") === "on", omitDc: form.get("omitDc") === "on" });
  revalidatePath("/financeiro/contabilidade/msc");
  revalidatePath("/financeiro/contabilidade/lancamentos");
}

export async function saveMscReportingScope(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
  await configureMscReportingScope(context, { governmentEntityId: String(form.get("governmentEntityId") ?? ""), financialYearId: String(form.get("financialYearId") ?? ""), institutionCode: String(form.get("institutionCode") ?? ""), entityIds: form.getAll("entityIds").map(String), predecessorEntryId: String(form.get("predecessorEntryId") ?? ""), reason: String(form.get("reason") ?? "") });
  revalidatePath("/financeiro/contabilidade/msc");
}

async function readMscChoices(raw: unknown) {
  const input = z.object({ field: z.enum(["ACCOUNT", "SOURCE", "REVENUE", "EXPENSE", "MSC_ACCOUNT", "MSC_FR", "MSC_NR", "MSC_ND", "MSC_PO", "MSC_FP", "MSC_DC", "MSC_CO", "PREDECESSOR"]), kind: z.enum(["ACCOUNT", "SOURCE", "REVENUE", "EXPENSE"]), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), financialYearId: z.string().min(1), canonicalId: z.string().default(""), q: z.string().trim().max(150).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) }).parse(raw);
  const context = await getTenantContextForModule("FINANCEIRO");
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  const [year, binding] = await Promise.all([context.prisma.financialYear.findUniqueOrThrow({ where: { id: input.financialYearId }, select: { year: true, governmentEntityId: true } }), context.prisma.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: input.budgetUnitId }, select: { governmentEntityId: true } })]);
  if (year.governmentEntityId !== input.governmentEntityId || binding.governmentEntityId !== input.governmentEntityId) throw new Error("Seleção MSC fora do ente/exercício/UG autorizado.");
  const text = input.q ? { OR: [{ code: { contains: input.q, mode: "insensitive" as const } }, { name: { contains: input.q, mode: "insensitive" as const } }] } : {};
  let total: number;
  let options: Array<{ id: string; name: string }>;
  const page = (count: number) => ({ take: 20, skip: (Math.min(input.page, Math.max(1, Math.ceil(count / 20))) - 1) * 20 });
  if (input.field.startsWith("MSC_") || input.field === "PREDECESSOR") {
    if (input.field === "PREDECESSOR" && !input.canonicalId) return { options: [], total: 0, page: 1 };
    const where: Prisma.PlanningCatalogEntryWhereInput = input.field === "PREDECESSOR" ? { kind: `MSC_MAPPING_${input.kind}`, canonicalId: input.canonicalId, version: { year: year.year, status: "PUBLISHED" }, AND: [{ attributes: { path: ["governmentEntityId"], equals: input.governmentEntityId } }, { attributes: { path: ["budgetUnitId"], equals: input.budgetUnitId } }], ...text } : { kind: input.field, version: { id: "msc-reference:stn:2026:20260708", year: year.year }, ...text };
    total = await context.prisma.planningCatalogEntry.count({ where });
    options = (await context.prisma.planningCatalogEntry.findMany({ where, select: { id: true, code: true, name: true, attributes: true }, orderBy: [{ code: "asc" }, { id: "asc" }], ...page(total) })).map(entry => ({ id: entry.id, name: `${entry.code} · ${entry.name}${input.field === "PREDECESSOR" ? ` · ${(entry.attributes as Prisma.JsonObject)?.effectiveFrom ?? ""}` : ""}` }));
  } else if (input.field === "ACCOUNT") {
    total = await context.prisma.accountingPlan.count({ where: text });
    options = (await context.prisma.accountingPlan.findMany({ where: text, orderBy: [{ code: "asc" }, { id: "asc" }], ...page(total) })).map(entry => ({ id: entry.id, name: `${entry.code} · ${entry.name}` }));
  } else if (input.field === "SOURCE") {
    total = await context.prisma.resourceSource.count({ where: text });
    options = (await context.prisma.resourceSource.findMany({ where: text, orderBy: [{ code: "asc" }, { id: "asc" }], ...page(total) })).map(entry => ({ id: entry.id, name: `${entry.code} · ${entry.name}` }));
  } else if (input.field === "REVENUE") {
    total = await context.prisma.revenueNature.count({ where: text });
    options = (await context.prisma.revenueNature.findMany({ where: text, orderBy: [{ code: "asc" }, { id: "asc" }], ...page(total) })).map(entry => ({ id: entry.id, name: `${entry.code} · ${entry.name}` }));
  } else {
    total = await context.prisma.expenseNature.count({ where: text });
    options = (await context.prisma.expenseNature.findMany({ where: text, orderBy: [{ code: "asc" }, { id: "asc" }], ...page(total) })).map(entry => ({ id: entry.id, name: `${entry.code} · ${entry.name}` }));
  }
  return { options, total, page: Math.min(input.page, Math.max(1, Math.ceil(total / 20))) };
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
