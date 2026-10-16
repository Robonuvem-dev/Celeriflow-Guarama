"use server";

import { assertBudgetUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { HR_PAYROLL_TYPES, payrollPeriod } from "@/lib/rh/calculation-engine";
import { postBenefitPayrollBatch } from "@/lib/sst/benefit-posting";

export async function saveFolha(formData: FormData) {
  const id = String(formData.get("id") || "");
  const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  const { prisma } = context;
  try {
    const competence = String(formData.get("competence") || "").trim();
    payrollPeriod(competence);
    const type = String(formData.get("type") || "Mensal");
    if (!(HR_PAYROLL_TYPES as readonly string[]).includes(type)) throw new Error("Tipo de folha inválido.");
    await prisma.$transaction(async tx => {
      if (id) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${id}`}))`;
        await tx.$queryRaw`SELECT id FROM "Payroll" WHERE id=${id} FOR UPDATE`;
        const scope = await tx.sstBenefitPayrollScope.findUnique({ where: { payrollId: id } });
        if (scope) assertBudgetUnitAccess(context.user, scope.budgetUnitId);
        const current = await tx.payroll.findUniqueOrThrow({ where: { id }, include: { _count: { select: { items: true, hrRuns: true } } } });
        if (current.status !== "Aberta" || current._count.items || current._count.hrRuns) throw new Error("Folha com cálculo/histórico não pode ter sua competência ou tipo alterados.");
        await tx.payroll.update({ where: { id }, data: { competence, type } });
      } else await tx.payroll.create({ data: { competence, type, status: "Aberta" } });
    });
    revalidatePath("/rh/folha");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar folha." };
  }
}

export async function deleteFolha(id: string) {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  const { prisma } = context;
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${id}`}))`;
      await tx.$queryRaw`SELECT id FROM "Payroll" WHERE id=${id} FOR UPDATE`;
      const scope = await tx.sstBenefitPayrollScope.findUnique({ where: { payrollId: id } });
      if (scope) assertBudgetUnitAccess(context.user, scope.budgetUnitId);
      const current = await tx.payroll.findUniqueOrThrow({ where: { id }, include: { _count: { select: { items: true, hrRuns: true } } } });
      if (current.status !== "Aberta" || current._count.items || current._count.hrRuns) throw new Error("Folha com histórico não pode ser excluída.");
      await tx.payroll.delete({ where: { id } });
    });
    revalidatePath("/rh/folha");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir folha." };
  }
}

// Preserve the canonical SST integration received from the other workstation.
export async function processPayroll(payrollId: string) {
  const context = await getTenantContextForModuleOperation("RH", "update");
  try {
    const result = await postBenefitPayrollBatch(context, payrollId);
    if (result.status === "BLOCKED") return { success: false, error: `Integração bloqueada: ${result.blockers.join(" · ")}` };
    revalidatePath(`/rh/folha/${payrollId}/editar`);
    revalidatePath("/sst/planos");
    revalidatePath("/portal-servidor/folha");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao integrar origens." };
  }
}
