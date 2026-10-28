import { and, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { processTypes, processSubjects, processSequences, processes, processMovements, processEvents } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";

export async function openCitizenChannelProcess(tx: DatabaseTransaction, kind: "ESIC" | "OUVIDORIA" | "ACESSO", departmentId: string | null, dueAt: Date | null): Promise<{ id: string; protocolNumber: string }> {
  const key = kind.toLowerCase(), label = kind === "ESIC" ? "Acesso à Informação (e-SIC)" : kind === "ACESSO" ? "Solicitação de acesso ao Autoatendimento" : "Ouvidoria — tratamento restrito";
  const typeId = `portal-channel-${key}`, subjectId = `portal-channel-subject-${key}`;
  await tx.insert(processTypes).values({ id: typeId, name: label, requiresInterested: false }).onConflictDoNothing({ target: processTypes.id });
  const [type] = await tx.select().from(processTypes).where(eq(processTypes.id, typeId)).limit(1);
  await tx.insert(processSubjects).values({ id: subjectId, name: label, processTypeId: type.id }).onConflictDoNothing({ target: processSubjects.id });
  const [subject] = await tx.select().from(processSubjects).where(eq(processSubjects.id, subjectId)).limit(1);
  if (!type.isActive || !subject.isActive) throw new Error("Canal de protocolo desativado.");
  if (departmentId && !(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.isActive, true))).limit(1))[0]) throw new Error("Setor de atendimento desativado.");
  const year = new Date().getFullYear(), [sequence] = await tx.insert(processSequences).values({ year, nextNumber: 2 }).onConflictDoUpdate({ target: processSequences.year, set: { nextNumber: sql`${processSequences.nextNumber} + 1`, updatedAt: new Date() } }).returning({ nextNumber: processSequences.nextNumber });
  const status = departmentId ? "Aguardando Recebimento" : "Aguardando Distribuição";
  const [process] = await tx.insert(processes).values({
    protocolNumber: `PROC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`, processTypeId: type.id, subjectId: subject.id, status,
    portalOrigin: "AUTOATENDIMENTO", portalPurpose: kind, expectedCompletionAt: dueAt, currentDepartmentId: departmentId,
    description: kind === "ESIC" ? "Pedido de informação. Conteúdo e resposta disponíveis no canal e-SIC autorizado." : kind === "ACESSO" ? "Solicitação de habilitação. Identidade e comprovação disponíveis à administração de acessos." : "Manifestação restrita. Conteúdo e identidade protegidos no canal de Ouvidoria.",
  }).returning({ id: processes.id, protocolNumber: processes.protocolNumber });
  if (departmentId) await tx.insert(processMovements).values({ processId: process.id, toDepartmentId: departmentId, reason: "Recebimento pelo canal externo", status: "AWAITING_RECEIPT", dueAt });
  await tx.insert(processEvents).values({ processId: process.id, eventType: "CITIZEN_CHANNEL_OPENED", newStatus: status, description: departmentId ? "Pedido externo encaminhado ao setor configurado." : "Pedido recebido; distribuição pendente de configuração do setor do canal." });
  return process;
}
