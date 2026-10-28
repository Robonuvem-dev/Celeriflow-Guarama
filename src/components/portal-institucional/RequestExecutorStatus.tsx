import Link from "next/link";
import { db } from "@/db/client";
import { and, eq, sql } from "drizzle-orm";
import { culturalReservations, culturalSpaces } from "@/db/schema/culture";
import { portalTaxAssessments, portalTaxGuides, portalOccasionalRequests, portalItbiDeclarations, portalItbiParties } from "@/db/schema/portal-fiscal";
import { readOwnPortalRequest } from "@/lib/portal-cidadao/requests";
import { AccessError } from "@/lib/platform/tenant-context";

export async function RequestExecutorStatus({ actorId, requestId }: { actorId: string; requestId: string }) {
  const request = await readOwnPortalRequest(db, actorId, requestId).catch((error) => { if (error instanceof AccessError) return null; throw error; });
  if (!request?.executorId) return null;
  if (request.executorType === "RESERVA") {
    const [reservation] = await db.select({ status: culturalReservations.status, startsAt: culturalReservations.startsAt, endsAt: culturalReservations.endsAt, space: { nome: culturalSpaces.nome } }).from(culturalReservations).innerJoin(culturalSpaces, eq(culturalSpaces.id, culturalReservations.spaceId)).where(eq(culturalReservations.id, request.executorId)).limit(1);
    return reservation ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Reserva — fonte Cultura/Esporte</h2><p className="mt-3 text-sm">{reservation.space.nome} • {reservation.status} • {reservation.startsAt.toLocaleString("pt-BR")} — {reservation.endsAt.toLocaleString("pt-BR")}</p></section> : null;
  }
  if (!request.taxpayerId) return null;
  if (request.executorType === "GUIA") {
    const [guide] = await db.select({ id: portalTaxGuides.id, guideNumber: portalTaxGuides.guideNumber, status: portalTaxGuides.status, totalValueDecimal: portalTaxGuides.totalValueDecimal, dueDate: portalTaxGuides.dueDate }).from(portalTaxGuides).innerJoin(portalTaxAssessments, eq(portalTaxAssessments.id, portalTaxGuides.assessmentId)).where(and(eq(portalTaxGuides.id, request.executorId), eq(portalTaxAssessments.taxpayerId, request.taxpayerId))).limit(1);
    return guide ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Resultado tributário</h2><p className="mt-3 text-sm">Guia {guide.guideNumber} • {guide.status} • R$ {guide.totalValueDecimal?.toFixed(2) || "Valor não conciliado"} • vencimento {guide.dueDate.toLocaleDateString("pt-BR")}</p><Link href={`/api/portal/tributos/guias/${guide.id}`} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">Consultar / imprimir guia</Link></section> : null;
  }
  if (request.executorType === "NFSE_AVULSA") {
    const [origin] = await db.select({ requestNumber: portalOccasionalRequests.requestNumber, status: portalOccasionalRequests.status, guideId: portalOccasionalRequests.guideId, invoiceId: portalOccasionalRequests.invoiceId }).from(portalOccasionalRequests).where(and(eq(portalOccasionalRequests.id, request.executorId), eq(portalOccasionalRequests.providerTaxpayerId, request.taxpayerId))).limit(1);
    return origin ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">NFS-e avulsa — fonte fiscal</h2><p className="mt-3 text-sm">{origin.requestNumber} • {origin.status}</p>{origin.guideId && <Link href={`/api/portal/tributos/guias/${origin.guideId}`} className="mt-3 inline-block text-sm text-emerald-800 underline">Consultar guia da solicitação</Link>}<Link href="/portal/nfse" className="ml-4 inline-block text-sm text-emerald-800 underline">Notas próprias emitidas</Link></section> : null;
  }
  if (request.executorType === "ITBI") {
    const [origin] = await db.select({ declarationNumber: portalItbiDeclarations.declarationNumber, status: portalItbiDeclarations.status, guideId: portalItbiDeclarations.guideId }).from(portalItbiDeclarations).where(and(eq(portalItbiDeclarations.id, request.executorId), eq(portalItbiDeclarations.processId, request.processId), sql`EXISTS(SELECT 1 FROM ${portalItbiParties} WHERE ${portalItbiParties.declarationId}=${portalItbiDeclarations.id} AND ${portalItbiParties.taxpayerId}=${request.taxpayerId})`)).limit(1);
    return origin ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">ITBI — fonte fiscal</h2><p className="mt-3 text-sm">{origin.declarationNumber} • {origin.status}</p>{origin.guideId && <Link href={`/api/portal/tributos/guias/${origin.guideId}`} className="mt-3 inline-block text-sm text-emerald-800 underline">Consultar DAM</Link>}</section> : null;
  }
  return null;
}
