import type { PlanningContext } from "@/lib/planejamento/access";
import { getPlanningMovementHistory } from "@/lib/planejamento/revisions";
import { PlanningList, planningColumn as col } from "./PlanningList";

export async function PlanningMovementHistory({ context, instrumentId, pathname, asOf, page, linePage }: {
  context: PlanningContext; instrumentId: string; pathname: string; asOf: string; page?: string; linePage: number;
}) {
  const data = await getPlanningMovementHistory(context, instrumentId, page);
  return <PlanningList id={`planning:${context.jurisdiction}:movements`} label="Histórico de alterações legais" pathname={pathname} page={data.page} total={data.total} pageParam="movementPage" values={{ asOf, page: linePage }}
    columns={[col("date", "Vigência", 90, 105), col("code", "Previsão", 80, 110), col("description", "Descrição", 120, 240), col("act", "Ato legal", 85, 110), col("value", "Alteração (R$)", 110, 130, { align: "right" }), col("reason", "Fundamento", 110, 210), col("text", "Texto jurídico", 120, 250), col("created", "Registrado em", 120, 170), col("actor", "Responsável", 100, 160)]}
    rows={data.records.map(row => ({ id: row.id, label: row.line.code, values: { date: row.effectiveAt.toISOString().slice(0, 10), code: row.line.code, description: row.line.description, act: row.legalActNumber, value: row.value.toFixed(2), reason: row.reason, text: row.legalText, created: row.createdAt.toISOString(), actor: row.createdById } }))} emptyMessage="Nenhuma alteração legal registrada." />;
}
