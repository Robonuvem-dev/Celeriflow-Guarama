import { desc, eq } from "drizzle-orm";
import { purchaseDemandEvents } from "@/db/schema/procurement-requests";
import type { DatabaseExecutor } from "@/db/transaction";

type Status = typeof purchaseDemandEvents.$inferSelect.status;

export const demandStatusLabel: Record<Status, string> = {
  EM_ANALISE: "Em análise",
  DEVOLVIDO: "Devolvido para revisão",
  APROVADO: "Aprovado",
};

export function listDemandEvents(db: DatabaseExecutor, versionId: string) {
  return db.select().from(purchaseDemandEvents)
    .where(eq(purchaseDemandEvents.demandVersionId, versionId))
    .orderBy(desc(purchaseDemandEvents.step));
}

export async function advanceDemandWorkflow(
  db: DatabaseExecutor,
  versionId: string,
  actorId: string,
  expectedStep: number,
  status: Status,
  reason: string,
  documentVersionId: string | null,
) {
  const [latest] = await listDemandEvents(db, versionId);
  if ((latest?.step ?? 0) !== expectedStep) throw new Error("Tramitação atualizada. Reabra o DFD.");
  if (!latest ? status !== "EM_ANALISE" : latest.status !== "EM_ANALISE" || status === "EM_ANALISE") {
    throw new Error("Transição de tramitação inválida.");
  }
  if (!reason.trim() || reason.length > 2000) throw new Error("Informe uma justificativa de até 2.000 caracteres.");
  if (status === "EM_ANALISE" && !documentVersionId) throw new Error("Selecione uma versão final do GED.");
  if (status !== "EM_ANALISE" && latest?.actorId === actorId) throw new Error("A decisão deve ser registrada por outro usuário.");
  await db.insert(purchaseDemandEvents).values({
    demandVersionId: versionId, step: expectedStep + 1, status, reason: reason.trim(), actorId,
    documentVersionId: latest?.documentVersionId ?? documentVersionId,
  });
}
