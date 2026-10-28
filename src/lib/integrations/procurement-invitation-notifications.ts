import type { DatabaseTransaction } from "@/db/transaction";
import { insertInternalNotifications } from "@/db/repositories/platform/notifications";
import { listPendingProcurementInvitations } from "@/db/repositories/procurement/invitations";

function supplierName(supplier: {
  person: { fullName: string } | null;
  company: { tradeName: string | null; corporateName: string } | null;
}) {
  return supplier.person?.fullName || supplier.company?.tradeName || supplier.company?.corporateName || "Fornecedor cadastrado";
}

// This is an internal reminder only. It deliberately does not invoke SMTP or claim email delivery.
export async function notifyPendingPriceResearchInvitations(
  tx: DatabaseTransaction,
  input: { actorUsuarioId: string; recipientUserIds: string[] },
) {
  const invitations = await listPendingProcurementInvitations(tx);
  const recipientUserIds = [...new Set(input.recipientUserIds.filter(Boolean))];
  let notificationsCreated = 0;

  for (const invitation of invitations) {
    const result = await insertInternalNotifications(tx, {
      actorUsuarioId: input.actorUsuarioId,
      recipientUserIds,
      sourceModule: "COMPRAS",
      entityType: "PRICE_QUOTE",
      entityId: invitation.id,
      type: "PRICE_RESEARCH_INVITATION_PENDING_DELIVERY",
      title: "Convite de pesquisa de precos pendente de entrega",
      message: `O convite de ${supplierName(invitation.supplier)} para o processo ${invitation.research.process.number} aguarda entrega manual do acesso.`,
      priority: "NORMAL",
      dedupeDiscriminator: "PENDING_DELIVERY",
    });
    notificationsCreated += result.created;
  }

  return {
    pendingInvitations: invitations.length,
    eligibleRecipients: recipientUserIds.length,
    notificationsCreated,
  };
}
