import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { sstParameters } from "@/db/repositories/sst/scope";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { RestrictionEmailConfigurationError, type RestrictionEmailSender } from "./restriction-email-provider";

export async function restrictionCronScope(database: DatabaseExecutor, actorId: string | undefined) {
  if (!actorId) throw new RestrictionEmailConfigurationError("SST_RESTRICTION_EMAIL_ACTOR_USER_ID não configurado.");
  const [actor] = (await database.execute<{ id: string; ativo: boolean; profileActive: boolean; firebaseUid: string | null; email: string; name: string; role: string; profileCode: string; permissions: string; employeeId: string | null; departmentId: string | null; secretariatId: string | null; moduleActive: boolean | null }>(sql`SELECT u.id,u.ativo,p.ativo AS "profileActive",u."firebaseUid",u.email,u.nome AS name,p.nome AS role,p.codigo AS "profileCode",p.permissoes AS permissions,e.id AS "employeeId",e."departmentId",e."secretariatId",m.ativo AS "moduleActive" FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" LEFT JOIN "Employee" e ON e.id=u."employeeId" LEFT JOIN "ConfiguracaoModulo" m ON m.codigo='SST' WHERE u.id=${actorId}`)).rows;
  if (!actor?.ativo || !actor.profileActive || !actor.firebaseUid || !actor.moduleActive) throw new RestrictionEmailConfigurationError("Ator/perfil/módulo SST ausente ou inativo.");
  const modulePermissions = (await database.execute<{ code: string; canView: boolean; canEdit: boolean }>(sql`SELECT upper(m.codigo) AS code,p."canView",p."canEdit" FROM "UsuarioModulo" p JOIN "ConfiguracaoModulo" m ON m.id=p."moduloId" WHERE p."usuarioId"=${actor.id}`)).rows;
  const budgetUnits = (await database.execute<{ budgetUnitId: string }>(sql`SELECT "budgetUnitId" FROM "UsuarioUnidadeGestora" WHERE "usuarioId"=${actor.id}`)).rows;
  const user: AppContext["user"] = { id:actor.id, firebaseUid:actor.firebaseUid, email:actor.email, name:actor.name, role:actor.role, profileCode:actor.profileCode, permissions:actor.permissions, modulePermissions, allowedBudgetUnitIds:budgetUnits.map(u => u.budgetUnitId), employeeId:actor.employeeId, departmentId:actor.departmentId, secretariatId:actor.secretariatId };
  if (!canViewModule(user,"SST") || !canPerformModuleOperation(user,"SST","create")) throw new RestrictionEmailConfigurationError("Ator do cron sem operação SST autorizada.");
  // Automatic processing never inherits an administrator's all-UG shortcut: actual
  // user/UG and both clinical grants are required, including for technical accounts.
  const units = (await database.execute<{ budgetUnitId: string }>(sql`SELECT u."budgetUnitId" FROM "UsuarioUnidadeGestora" u JOIN "SstAccessGrant" a ON a."budgetUnitId"=u."budgetUnitId" AND a."usuarioId"=u."usuarioId" JOIN "SstDisciplineGrant" d ON d."budgetUnitId"=u."budgetUnitId" AND d."usuarioId"=u."usuarioId" WHERE u."usuarioId"=${actor.id} AND a."isActive" AND a."canReadClinical" AND a."canAssess" AND d."discipline"='MEDICINE' AND d."isActive" AND d."canRead" AND d."canWrite"`)).rows;
  if (!units.length) throw new RestrictionEmailConfigurationError("Ator do cron sem escopo UG/Medicina explicitamente autorizado.");
  return { actorId:actor.id, unitIds:units.map(u => u.budgetUnitId) };
}
export async function runRestrictionExpiryCron(connection: DatabaseConnection, scope: { actorId: string; unitIds: string[] }, send: RestrictionEmailSender, now = new Date()) {
  if (!scope.unitIds.length) throw new RestrictionEmailConfigurationError("Cron sem escopo autorizado.");
  let sent = 0, failed = 0;
  for (let i=0;i<20;i++) {
    const message = await withDatabaseTransaction(connection, async tx => {
      const [row] = (await tx.execute<{ id:string; recipient:string; restrictionId:string; attempts:number }>(sql`SELECT o."id",o."recipient",o."restrictionId",o."attempts" FROM "SstRestrictionEmailOutbox" o JOIN "SstRestriction" r ON r."id"=o."restrictionId" WHERE r."budgetUnitId" IN (${sstParameters(scope.unitIds)}) AND o."dueAt"<=${now} AND (o."status"='PENDING' OR (o."status"='FAILED' AND o."attempts"<3 AND o."nextAttemptAt"<=${now} AND o."lastAttemptAt">${new Date(now.getTime()-23*3600000)})) AND NOT EXISTS (SELECT 1 FROM "SstRestrictionFollowup" f WHERE f."restrictionId"=r."id" AND f."data"->>'outcome'='RELEASE') ORDER BY o."dueAt",o."id" LIMIT 1 FOR UPDATE OF o SKIP LOCKED`)).rows;
      if (row) await tx.execute(sql`UPDATE "SstRestrictionEmailOutbox" SET "status"='SENDING',"claimedAt"=${now},"lastAttemptAt"=${now},"attempts"="attempts"+1,"nextAttemptAt"=NULL WHERE "id"=${row.id}`);
      return row;
    });
    if (!message) break;
    try {
      const result = await send({ to:message.recipient, subject:"SST: restrição próxima do término", text:`A restrição ocupacional ${message.restrictionId} está próxima do término. Consulte a ficha na área SST autorizada.`, idempotencyKey:message.id });
      if (!result.receipt) throw new Error("Provedor sem comprovante de aceite.");
      await connection.db.execute(sql`UPDATE "SstRestrictionEmailOutbox" SET "status"='SENT',"providerReceipt"=${result.receipt},"sentAt"=${new Date()},"lastError"=NULL,"claimedAt"=NULL WHERE "id"=${message.id} AND "status"='SENDING'`);
      sent++;
    } catch {
      await connection.db.execute(sql`UPDATE "SstRestrictionEmailOutbox" SET "status"='FAILED',"lastError"='Provedor não confirmou aceite; tentativa limitada e idempotente',"claimedAt"=NULL,"nextAttemptAt"=${new Date(now.getTime()+15*60000)} WHERE "id"=${message.id} AND "status"='SENDING'`);
      failed++;
    }
  }
  const [blocked] = (await connection.db.execute<{ count:number }>(sql`SELECT COUNT(*)::int count FROM "SstRestrictionEmailOutbox" o JOIN "SstRestriction" r ON r."id"=o."restrictionId" WHERE r."budgetUnitId" IN (${sstParameters(scope.unitIds)}) AND (o."status"='SENDING' OR (o."status"='FAILED' AND (o."attempts">=3 OR o."lastAttemptAt"<=${new Date(now.getTime()-23*3600000)})))`)).rows;
  return { sent, failed, reconciliationRequired:blocked.count, actorId:scope.actorId };
}
