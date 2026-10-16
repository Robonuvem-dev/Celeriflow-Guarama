import { Prisma, type PrismaClient } from "@prisma/client";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { RestrictionEmailConfigurationError, type RestrictionEmailSender } from "./restriction-email-provider";

export async function restrictionCronScope(prisma: PrismaClient, actorId: string | undefined) {
  if (!actorId) throw new RestrictionEmailConfigurationError("SST_RESTRICTION_EMAIL_ACTOR_USER_ID não configurado.");
  const [actor,module] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: actorId }, include: { perfil:true, employee:true, permissoesModulo: { include: { modulo: { select: { codigo:true } } } }, unidadesGestoras: { select: { budgetUnitId:true } } } }),
    prisma.configuracaoModulo.findUnique({ where: { codigo:"SST" }, select: { ativo:true } }),
  ]);
  if (!actor?.ativo || !actor.perfil.ativo || !actor.firebaseUid || !module?.ativo) throw new RestrictionEmailConfigurationError("Ator/perfil/módulo SST ausente ou inativo.");
  const user: AppContext["user"] = { id:actor.id, firebaseUid:actor.firebaseUid, email:actor.email, name:actor.nome, role:actor.perfil.nome, profileCode:actor.perfil.codigo, permissions:actor.perfil.permissoes, modulePermissions:actor.permissoesModulo.map(p => ({ code:p.modulo.codigo.toUpperCase(), canView:p.canView, canEdit:p.canEdit })), allowedBudgetUnitIds:actor.unidadesGestoras.map(u => u.budgetUnitId), employeeId:actor.employee?.id || null, departmentId:actor.employee?.departmentId || null, secretariatId:actor.employee?.secretariatId || null };
  if (!canViewModule(user,"SST") || !canPerformModuleOperation(user,"SST","create")) throw new RestrictionEmailConfigurationError("Ator do cron sem operação SST autorizada.");
  // Automatic processing never inherits an administrator's all-UG shortcut: actual
  // user/UG and both clinical grants are required, including for technical accounts.
  const units = await prisma.$queryRaw<{ budgetUnitId: string }[]>`SELECT u."budgetUnitId" FROM "UsuarioUnidadeGestora" u JOIN "SstAccessGrant" a ON a."budgetUnitId"=u."budgetUnitId" AND a."usuarioId"=u."usuarioId" JOIN "SstDisciplineGrant" d ON d."budgetUnitId"=u."budgetUnitId" AND d."usuarioId"=u."usuarioId" WHERE u."usuarioId"=${actor.id} AND a."isActive" AND a."canReadClinical" AND a."canAssess" AND d."discipline"='MEDICINE' AND d."isActive" AND d."canRead" AND d."canWrite"`;
  if (!units.length) throw new RestrictionEmailConfigurationError("Ator do cron sem escopo UG/Medicina explicitamente autorizado.");
  return { actorId:actor.id, unitIds:units.map(u => u.budgetUnitId) };
}
export async function runRestrictionExpiryCron(prisma: PrismaClient, scope: { actorId: string; unitIds: string[] }, send: RestrictionEmailSender, now = new Date()) {
  if (!scope.unitIds.length) throw new RestrictionEmailConfigurationError("Cron sem escopo autorizado.");
  let sent = 0, failed = 0;
  for (let i=0;i<20;i++) {
    const message = await prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<{ id:string; recipient:string; restrictionId:string; attempts:number }[]>`SELECT o."id",o."recipient",o."restrictionId",o."attempts" FROM "SstRestrictionEmailOutbox" o JOIN "SstRestriction" r ON r."id"=o."restrictionId" WHERE r."budgetUnitId" IN (${Prisma.join(scope.unitIds)}) AND o."dueAt"<=${now} AND (o."status"='PENDING' OR (o."status"='FAILED' AND o."attempts"<3 AND o."nextAttemptAt"<=${now} AND o."lastAttemptAt">${new Date(now.getTime()-23*3600000)})) AND NOT EXISTS (SELECT 1 FROM "SstRestrictionFollowup" f WHERE f."restrictionId"=r."id" AND f."data"->>'outcome'='RELEASE') ORDER BY o."dueAt",o."id" LIMIT 1 FOR UPDATE OF o SKIP LOCKED`;
      if (row) await tx.$executeRaw`UPDATE "SstRestrictionEmailOutbox" SET "status"='SENDING',"claimedAt"=${now},"lastAttemptAt"=${now},"attempts"="attempts"+1,"nextAttemptAt"=NULL WHERE "id"=${row.id}`;
      return row;
    });
    if (!message) break;
    try {
      const result = await send({ to:message.recipient, subject:"SST: restrição próxima do término", text:`A restrição ocupacional ${message.restrictionId} está próxima do término. Consulte a ficha na área SST autorizada.`, idempotencyKey:message.id });
      if (!result.receipt) throw new Error("Provedor sem comprovante de aceite.");
      await prisma.$executeRaw`UPDATE "SstRestrictionEmailOutbox" SET "status"='SENT',"providerReceipt"=${result.receipt},"sentAt"=${new Date()},"lastError"=NULL,"claimedAt"=NULL WHERE "id"=${message.id} AND "status"='SENDING'`;
      sent++;
    } catch {
      await prisma.$executeRaw`UPDATE "SstRestrictionEmailOutbox" SET "status"='FAILED',"lastError"='Provedor não confirmou aceite; tentativa limitada e idempotente',"claimedAt"=NULL,"nextAttemptAt"=${new Date(now.getTime()+15*60000)} WHERE "id"=${message.id} AND "status"='SENDING'`;
      failed++;
    }
  }
  const [blocked] = await prisma.$queryRaw<{ count:number }[]>`SELECT COUNT(*)::int count FROM "SstRestrictionEmailOutbox" o JOIN "SstRestriction" r ON r."id"=o."restrictionId" WHERE r."budgetUnitId" IN (${Prisma.join(scope.unitIds)}) AND (o."status"='SENDING' OR (o."status"='FAILED' AND (o."attempts">=3 OR o."lastAttemptAt"<=${new Date(now.getTime()-23*3600000)})))`;
  return { sent, failed, reconciliationRequired:blocked.count, actorId:scope.actorId };
}
