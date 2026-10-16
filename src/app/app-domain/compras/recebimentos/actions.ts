"use server";

import { approvePurchaseReceipt, ProcurementLifecycleError, type ApprovePurchaseReceiptInput } from "@/lib/compras/procurement-lifecycle";
import { ProcurementFinanceBridgeError, recordPurchaseReceiptLiquidationAuthorization } from "@/lib/compras/procurement-finance-bridge";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string; receiptId?: string };

export async function approvePurchaseReceiptAction(input: ApprovePurchaseReceiptInput): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("COMPRAS", "create");
    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    const receipt = await approvePurchaseReceipt(context.prisma, actor, input);
    await recordPurchaseReceiptLiquidationAuthorization(context.prisma, actor, receipt.id);
    revalidatePath("/patrimonio/materiais");
    revalidatePath("/patrimonio/bens");
    revalidatePath("/patrimonio/bens/estoque");
    revalidatePath("/compras/contratos");
    revalidatePath("/compras/recebimentos");
    revalidatePath("/financeiro/orcamento");
    return { receiptId: receipt.id };
  } catch (error) {
    return { error: error instanceof ProcurementLifecycleError || error instanceof ProcurementFinanceBridgeError ? error.message : "Não foi possível aprovar o recebimento." };
  }
}
