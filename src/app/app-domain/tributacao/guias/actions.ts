"use server";

import { canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { cancelTaxGuide, confirmTaxPayment } from "@/lib/tributacao";
import { reverseTaxPayment } from "@/lib/tributacao/payment-reversal";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export async function payGuide(guideId: string, amount: number) {
  const context = await taxActionContext("create");
  const paymentDate = new Date();
  const idempotencyKey = `TRIBUTARIO:MANUAL_GUIDE:${guideId}:${amount.toFixed(2)}:${paymentDate.toISOString().slice(0, 10)}`;
  const result = await confirmTaxPayment(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, {
    guideId,
    amountPaid: amount,
    paymentDate,
    paymentMethod: "Manual",
    idempotencyKey,
  });

  revalidatePath("/tributacao/guias");
  return result;
}

export async function cancelGuide(guideId: string) {
  const context = await taxActionContext("update");
  const result = await cancelTaxGuide(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, guideId);

  revalidatePath("/tributacao/guias");
  return result;
}

export async function reverseGuidePayment(data: { paymentId: string; date: string; reason: string; idempotencyKey: string }): Promise<{ error?: string }> {
  try {
    const input = z.object({ paymentId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().trim().min(1).max(200) }).strict().parse(data);
    const date = new Date(`${input.date}T12:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) return { error: "Data de estorno inválida." };
    const context = await taxActionContext("update");
    if (!canPerformModuleOperation(context.user, "FINANCEIRO", "update")) return { error: "O estorno exige alteração em Tributação e Financeiro." };
    await reverseTaxPayment(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, { ...input, date });
    revalidatePath("/tributacao/guias");
    revalidatePath("/tributacao/motor-fiscal");
    revalidatePath("/financeiro/receitas");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível estornar o pagamento." }; }
}
