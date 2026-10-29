import Link from "next/link";
import { db } from "@/db/client";
import { and, avg, count, eq, gte, lt } from "drizzle-orm";
import { transparencyCitizenRequests, transparencySatisfactions } from "@/db/schema/citizen-channels";
import { tickets, ombudsmans } from "@/db/schema/attendance-portals";
import { PageFeedbackSummary } from "@/components/transparencia/PageFeedbackSummary";
import { PublicOperationalList } from "../../PublicOperationalList";
export const dynamic = "force-dynamic";

export default async function CitizenStatisticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams, requestedYear = Number(raw.year), year = Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 2200 ? requestedYear : new Date().getUTCFullYear(), period = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
  const [rows, [satisfactionRow]] = await Promise.all([
    db.select({ type: transparencyCitizenRequests.type, entity: transparencyCitizenRequests.entity, status: transparencyCitizenRequests.status, outcome: transparencyCitizenRequests.outcome, name: transparencyCitizenRequests.name, nativeTicket: { resolvedAt: tickets.resolvedAt }, nativeOmbudsman: { respondedAt: ombudsmans.respondedAt } }).from(transparencyCitizenRequests).leftJoin(tickets, eq(tickets.id, transparencyCitizenRequests.nativeTicketId)).leftJoin(ombudsmans, eq(ombudsmans.id, transparencyCitizenRequests.nativeOmbudsmanId)).where(and(gte(transparencyCitizenRequests.createdAt, period.gte), lt(transparencyCitizenRequests.createdAt, period.lt))),
    db.select({ _count: count(), rating: avg(transparencySatisfactions.rating).mapWith(Number) }).from(transparencySatisfactions).where(and(gte(transparencySatisfactions.createdAt, period.gte), lt(transparencySatisfactions.createdAt, period.lt))),
  ]);
  const aggregates = ["prefeitura", "camara"].flatMap((entity) => ["ESIC", "OUVIDORIA"].map((type) => {
    const selected = rows.filter((row) => row.entity === entity && (type === "ESIC" ? row.type === "ESIC" : row.type !== "ESIC"));
    const answered = selected.filter((row) => row.status === "RESPONDIDO" || row.nativeTicket?.resolvedAt || row.nativeOmbudsman?.respondedAt);
    return { id: `${entity}:${type}`, label: `${entity} — ${type}`, values: { entity, type, received: String(selected.length), answered: String(answered.length), denied: String(answered.filter((row) => row.outcome === "INDEFERIDO").length), partial: String(answered.filter((row) => row.outcome === "PARCIAL").length), unclassified: String(answered.filter((row) => !row.outcome).length), identified: String(selected.filter((row) => Boolean(row.name)).length), anonymous: String(selected.filter((row) => !row.name).length) } };
  }));
  return <main className="mx-auto max-w-6xl space-y-2 p-3"><Link href="/portal/portaldatransparencia" className="underline">← Transparência</Link><h1 className="text-xl font-bold">Estatísticas de pedidos e satisfação</h1><p>Dados agregados dos pedidos registrados por este portal. Identidade, narrativa, protocolos, chaves e comentários individuais não são divulgados.</p>
    <PublicOperationalList id="estatisticas" caption={`Pedidos recebidos no exercício ${year}`}
      toolbar={<form className="flex min-w-0 items-center gap-2"><label className="flex items-center gap-2">Exercício<input type="number" name="year" defaultValue={year} min={1900} max={2200} className="h-7 w-24 rounded border px-2" /></label><button className="h-7 rounded border px-2">Consultar</button></form>}
      columns={[["entity", "Entidade", 130, 90], ["type", "Canal", 120, 80], ["received", "Recebidos", 110, 80, "text", "right"], ["answered", "Atendidos", 110, 80, "text", "right"], ["denied", "Indeferidos", 120, 90, "text", "right"], ["partial", "Parciais", 100, 70, "text", "right"], ["unclassified", "Sem classificação", 160, 100, "text", "right"], ["identified", "Identificados", 140, 90, "text", "right"], ["anonymous", "Anônimos", 110, 80, "text", "right"]]} rows={aggregates} />
    <section className="rounded border p-3"><h2 className="font-bold">Satisfação com o atendimento</h2><p>{satisfactionRow._count} avaliação(ões). Média: {satisfactionRow.rating === null ? "Sem avaliações registradas" : satisfactionRow.rating.toFixed(2)} / 5.</p><p className="text-sm">Cada pedido respondido pode receber uma avaliação de seu titular com a chave de acompanhamento. Atualizações da mesma avaliação não criam votos adicionais.</p></section><PageFeedbackSummary year={year} />
  </main>;
}
