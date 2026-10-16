import type { Prisma } from "@prisma/client";

export async function openCitizenChannelProcess(tx: Prisma.TransactionClient, kind: "ESIC" | "OUVIDORIA" | "ACESSO", departmentId: string | null, dueAt: Date | null) {
  const key = kind.toLowerCase(), label = kind === "ESIC" ? "Acesso à Informação (e-SIC)" : kind === "ACESSO" ? "Solicitação de acesso ao Autoatendimento" : "Ouvidoria — tratamento restrito";
  const type = await tx.processType.upsert({ where: { id: `portal-channel-${key}` }, create: { id: `portal-channel-${key}`, name: label, requiresInterested: false }, update: {} });
  const subject = await tx.subject.upsert({ where: { id: `portal-channel-subject-${key}` }, create: { id: `portal-channel-subject-${key}`, name: label, processTypeId: type.id }, update: {} });
  if (!type.isActive || !subject.isActive) throw new Error("Canal de protocolo desativado.");
  if (departmentId && !await tx.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } })) throw new Error("Setor de atendimento desativado.");
  const year = new Date().getFullYear(), sequence = await tx.processSequence.upsert({ where: { year }, create: { year, nextNumber: 2 }, update: { nextNumber: { increment: 1 } }, select: { nextNumber: true } });
  const status = departmentId ? "Aguardando Recebimento" : "Aguardando Distribuição";
  return tx.process.create({ data: {
    protocolNumber: `PROC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`, processTypeId: type.id, subjectId: subject.id, status,
    portalOrigin: "AUTOATENDIMENTO", portalPurpose: kind, expectedCompletionAt: dueAt, currentDepartmentId: departmentId,
    description: kind === "ESIC" ? "Pedido de informação. Conteúdo e resposta disponíveis no canal e-SIC autorizado." : kind === "ACESSO" ? "Solicitação de habilitação. Identidade e comprovação disponíveis à administração de acessos." : "Manifestação restrita. Conteúdo e identidade protegidos no canal de Ouvidoria.",
    ...(departmentId ? { movements: { create: { toDepartmentId: departmentId, reason: "Recebimento pelo canal externo", status: "AWAITING_RECEIPT", dueAt } } } : {}),
    events: { create: { eventType: "CITIZEN_CHANNEL_OPENED", newStatus: status, description: departmentId ? "Pedido externo encaminhado ao setor configurado." : "Pedido recebido; distribuição pendente de configuração do setor do canal." } },
  }, select: { id: true, protocolNumber: true } });
}
