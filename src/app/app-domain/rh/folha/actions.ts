"use server";

import { assertBudgetUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { HR_PAYROLL_TYPES, payrollPeriod } from "@/lib/rh/calculation-engine";
import { postBenefitPayrollBatch } from "@/lib/sst/benefit-posting";
import { count, eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { payrolls, payrollItems, hrPayrollRuns } from "@/db/schema/personnel-workforce";
import { externalPayrollScopes } from "@/db/schema/personnel-external-operations";
import { requirePayroll } from "@/db/repositories/personnel/workforce";

async function payrollHistory(tx: DatabaseExecutor, id: string) {
  const current = await requirePayroll(tx, id);
  const [items] = await tx.select({ count: count() }).from(payrollItems).where(eq(payrollItems.payrollId, id));
  const [runs] = await tx.select({ count: count() }).from(hrPayrollRuns).where(eq(hrPayrollRuns.payrollId, id));
  return { ...current, itemCount: items.count, runCount: runs.count };
}

export async function saveFolha(formData: FormData) {
  const id = String(formData.get("id") || "");
  const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    const competence = String(formData.get("competence") || "").trim();
    payrollPeriod(competence);
    const type = String(formData.get("type") || "Mensal");
    if (!(HR_PAYROLL_TYPES as readonly string[]).includes(type)) throw new Error("Tipo de folha inválido.");
    await withDatabaseTransaction(databaseConnection, async tx => {
      if (id) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${id}`}))`);
        await tx.select({ id: payrolls.id }).from(payrolls).where(eq(payrolls.id, id)).for("update");
        const [scope] = await tx.select().from(externalPayrollScopes).where(eq(externalPayrollScopes.payrollId, id)).limit(1);
        if (scope) assertBudgetUnitAccess(context.user, scope.budgetUnitId);
        const current = await payrollHistory(tx, id);
        if (current.status !== "Aberta" || current.itemCount || current.runCount) throw new Error("Folha com cálculo/histórico não pode ter sua competência ou tipo alterados.");
        await tx.update(payrolls).set({ competence, type }).where(eq(payrolls.id, id));
      } else await tx.insert(payrolls).values({ competence, type, status: "Aberta" });
    });
    revalidatePath("/rh/folha");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar folha." };
  }
}

export async function deleteFolha(id: string) {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${id}`}))`);
      await tx.select({ id: payrolls.id }).from(payrolls).where(eq(payrolls.id, id)).for("update");
      const [scope] = await tx.select().from(externalPayrollScopes).where(eq(externalPayrollScopes.payrollId, id)).limit(1);
      if (scope) assertBudgetUnitAccess(context.user, scope.budgetUnitId);
      const current = await payrollHistory(tx, id);
      if (current.status !== "Aberta" || current.itemCount || current.runCount) throw new Error("Folha com histórico não pode ser excluída.");
      await tx.delete(payrolls).where(eq(payrolls.id, id));
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
