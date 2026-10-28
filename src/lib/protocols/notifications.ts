import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { users, accessProfiles, userModulePermissions, modules } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";
import { insertInternalNotifications } from "@/db/repositories/platform/notifications";
import type { InternalNotificationPriority } from "@/lib/contracts/notifications";
import { canViewModule, type AppContext } from "@/lib/platform/tenant-context";

type NotificationInput = {
  processId: string;
  type: string;
  title: string;
  message: string;
  priority?: InternalNotificationPriority;
  dedupeDiscriminator: string;
};

type NotificationRecipient = {
  id: string;
  perfil: { codigo: string; permissoes: string; ativo: boolean; nome: string };
  permissoesModulo: { modulo: { codigo: string }; canView: boolean; canEdit: boolean }[];
};

function hasProcessModuleAccess(recipient: NotificationRecipient) {
  const user: AppContext["user"] = {
    id: recipient.id,
    firebaseUid: "",
    email: "",
    name: "",
    role: recipient.perfil.nome,
    profileCode: recipient.perfil.codigo,
    permissions: recipient.perfil.permissoes,
    modulePermissions: recipient.permissoesModulo.map((permission) => ({
      code: permission.modulo.codigo.toUpperCase(),
      canView: permission.canView,
      canEdit: permission.canEdit,
    })),
    allowedBudgetUnitIds: [],
    employeeId: null,
    departmentId: null,
    secretariatId: null,
  };
  return recipient.perfil.ativo && canViewModule(user, "PROCESSOS");
}

async function eligibleProtocolRecipients(tx: DatabaseTransaction, selection: { departmentId: string } | { userIds: string[] }): Promise<NotificationRecipient[]> {
  const recipients = await tx.select({ id: users.id, perfil: { codigo: accessProfiles.codigo, permissoes: accessProfiles.permissoes, ativo: accessProfiles.ativo, nome: accessProfiles.nome } }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).leftJoin(employees, eq(employees.id, users.employeeId)).where(and(eq(users.ativo, true), "departmentId" in selection ? and(eq(employees.isActive, true), eq(employees.departmentId, selection.departmentId)) : inArray(users.id, selection.userIds)));
  if (!recipients.length) return [];
  const permissions = await tx.select({ usuarioId: userModulePermissions.usuarioId, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit, codigo: modules.codigo }).from(userModulePermissions).innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(inArray(userModulePermissions.usuarioId, recipients.map(row => row.id)));
  return recipients.map(row => ({ ...row, permissoesModulo: permissions.filter(permission => permission.usuarioId === row.id).map(permission => ({ canView: permission.canView, canEdit: permission.canEdit, modulo: { codigo: permission.codigo } })) })).filter(hasProcessModuleAccess);
}

export async function notifyProtocolDepartment(
  tx: DatabaseTransaction,
  actorUsuarioId: string,
  departmentId: string,
  notification: NotificationInput,
) {
  const eligibleRecipients = await eligibleProtocolRecipients(tx, { departmentId });
  if (!eligibleRecipients.length) return { created: 0 };

  return insertInternalNotifications(tx, {
    actorUsuarioId,
    recipientUserIds: eligibleRecipients.map((recipient) => recipient.id),
    sourceModule: "PROCESSOS",
    entityType: "PROCESS",
    entityId: notification.processId,
    ...notification,
  });
}

export async function notifyProtocolUsers(
  tx: DatabaseTransaction,
  actorUsuarioId: string,
  userIds: string[],
  notification: NotificationInput,
) {
  const requestedIds = [...new Set(userIds)].filter(Boolean);
  if (!requestedIds.length) return { created: 0 };
  const eligibleRecipients = await eligibleProtocolRecipients(tx, { userIds: requestedIds });
  if (!eligibleRecipients.length) return { created: 0 };

  return insertInternalNotifications(tx, {
    actorUsuarioId,
    recipientUserIds: eligibleRecipients.map((recipient) => recipient.id),
    sourceModule: "PROCESSOS",
    entityType: "PROCESS",
    entityId: notification.processId,
    ...notification,
  });
}
