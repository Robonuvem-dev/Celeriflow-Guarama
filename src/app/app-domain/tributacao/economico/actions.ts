"use server";

import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { updateEconomicRegistrationWithHistory } from "@/lib/tributacao/economic-history";
import { redirect } from "next/navigation";

export async function createEconomicRegistration(data: {
  municipalInsc: string;
  primaryCnae: string;
  taxRegime: string;
  taxpayerId: string;
}) {
  void data;
  await getTenantContextForModuleOperation("TRIBUTACAO", "create");
  redirect("/tributacao/economico/novo");
}

export async function updateEconomicRegistration(id: string, data: {
  municipalInsc?: string;
  primaryCnae?: string | null;
  taxRegime?: string | null;
}) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
  const result = await updateEconomicRegistrationWithHistory(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id, data);

  revalidatePath("/tributacao/economico");
  revalidatePath(`/tributacao/economico/${id}`);
  return result;
}

export async function deactivateEconomicRegistration(id: string) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
  const result = await updateEconomicRegistrationWithHistory(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id, { status: "Inativo" });

  revalidatePath("/tributacao/economico");
  revalidatePath(`/tributacao/economico/${id}`);
  return result;
}

export async function activateEconomicRegistration(id: string) {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
  const result = await updateEconomicRegistrationWithHistory(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id, { status: "Ativo" });

  revalidatePath("/tributacao/economico");
  revalidatePath(`/tributacao/economico/${id}`);
  return result;
}
