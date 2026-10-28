export type InternalNotificationPriority = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";
export type InternalNotificationInput = {
  actorUsuarioId: string; recipientUserIds: string[]; sourceModule: string; entityType: string; entityId: string; processId?: string | null;
  type: string; title: string; message: string; priority?: InternalNotificationPriority; dedupeDiscriminator: string;
};
export type InternalNotificationRecord = {
  id: string; userId: string; processId: string | null; sourceModule: string; entityType: string; entityId: string; type: string; title: string; message: string;
  priority: string; dedupeKey: string | null; readAt: Date | null; createdAt: Date;
};
