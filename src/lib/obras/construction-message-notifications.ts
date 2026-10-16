import type { Prisma } from "@prisma/client";
import { canViewModule, type AppContext } from "@/lib/platform/tenant-context";

// External authors have no Usuario: their identity remains in the message.
export async function notifyConstructionMessageDepartment(tx: Prisma.TransactionClient, caseId: string, messageId: string) {
  const item = await tx.constructionCase.findUniqueOrThrow({ where: { id: caseId }, select: { process: { select: { currentDepartmentId: true, protocolNumber: true } } } });
  const departmentId = item.process.currentDepartmentId;
  if (!departmentId) return;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const recipients = await tx.usuario.findMany({ where: { ativo: true, perfil: { ativo: true }, employee: { is: { isActive: true, departmentId, department: { isActive: true }, constructionStaff: { some: { departmentId, isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }] } } } } }, include: { perfil: true, permissoesModulo: { include: { modulo: true } } } });
  const dedupeKey = `OBRAS:CONSTRUCTION_CASE:${caseId}:PROFESSIONAL_MESSAGE:${messageId}`;
  for (const recipient of recipients) {
    const user: AppContext["user"] = { id: recipient.id, firebaseUid: "", email: "", name: "", role: recipient.perfil.nome, profileCode: recipient.perfil.codigo, permissions: recipient.perfil.permissoes, modulePermissions: recipient.permissoesModulo.map((permission) => ({ code: permission.modulo.codigo.toUpperCase(), canView: permission.canView, canEdit: permission.canEdit })), allowedBudgetUnitIds: [], employeeId: null, departmentId, secretariatId: null };
    if (!canViewModule(user, "OBRAS")) continue;
    if (await tx.protocolNotification.findFirst({ where: { userId: recipient.id, dedupeKey }, select: { id: true } })) continue;
    await tx.protocolNotification.create({ data: { userId: recipient.id, sourceModule: "OBRAS", entityType: "CONSTRUCTION_CASE", entityId: caseId, type: "PROFESSIONAL_MESSAGE", title: `Comunicação profissional — ${item.process.protocolNumber}`, message: `Há nova comunicação em /obras/construcao-civil/${caseId}.`, priority: "NORMAL", dedupeKey }, select: { id: true } });
  }
}
