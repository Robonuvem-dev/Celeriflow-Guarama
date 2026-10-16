"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { selectDebtNoticeTargets, issueDebtNoticeBatch, cancelDebtNotice } from "@/lib/tributacao/debt-notices";

async function context() { const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); return { prisma, actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }; }
export async function previewDebtNoticesAction(input: Parameters<typeof selectDebtNoticeTargets>[2]) {
  try { const { prisma, actor } = await context(); return await selectDebtNoticeTargets(prisma, actor, input); } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível consultar os débitos." }; }
}
export async function issueDebtNoticesAction(input: Parameters<typeof issueDebtNoticeBatch>[2]) {
  try { const { prisma, actor } = await context(); const result = await issueDebtNoticeBatch(prisma, actor, input); revalidatePath("/tributacao/notificacoes"); return result; } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir as notificações." }; }
}
export async function cancelDebtNoticeAction(input: Parameters<typeof cancelDebtNotice>[2]) {
  try { const { prisma, actor } = await context(); await cancelDebtNotice(prisma, actor, input); revalidatePath("/tributacao/notificacoes"); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível cancelar a notificação." }; }
}
