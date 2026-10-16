import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { readOwnPortalRequest } from "@/lib/portal-cidadao/requests";
import { AccessError } from "@/lib/platform/tenant-context";

export async function RequestExecutorStatus({ actorId, requestId }: { actorId: string; requestId: string }) {
  const request = await readOwnPortalRequest(prisma, actorId, requestId).catch((error) => { if (error instanceof AccessError) return null; throw error; });
  if (!request?.executorId) return null;
  if (request.executorType === "RESERVA") {
    const reservation = await prisma.culturaReserva.findUnique({ where: { id: request.executorId }, select: { status: true, startsAt: true, endsAt: true, space: { select: { nome: true } } } });
    return reservation ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Reserva — fonte Cultura/Esporte</h2><p className="mt-3 text-sm">{reservation.space.nome} • {reservation.status} • {reservation.startsAt.toLocaleString("pt-BR")} — {reservation.endsAt.toLocaleString("pt-BR")}</p></section> : null;
  }
  if (!request.taxpayerId) return null;
  if (request.executorType === "GUIA") {
    const guide = await prisma.taxGuide.findFirst({ where: { id: request.executorId, assessment: { taxpayerId: request.taxpayerId } }, select: { id: true, guideNumber: true, status: true, totalValueDecimal: true, dueDate: true } });
    return guide ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Resultado tributário</h2><p className="mt-3 text-sm">Guia {guide.guideNumber} • {guide.status} • R$ {guide.totalValueDecimal?.toFixed(2) || "Valor não conciliado"} • vencimento {guide.dueDate.toLocaleDateString("pt-BR")}</p><Link href={`/api/portal/tributos/guias/${guide.id}`} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">Consultar / imprimir guia</Link></section> : null;
  }
  if (request.executorType === "NFSE_AVULSA") {
    const origin = await prisma.nfseOccasionalRequest.findFirst({ where: { id: request.executorId, providerTaxpayerId: request.taxpayerId }, select: { requestNumber: true, status: true, guideId: true, invoiceId: true } });
    return origin ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">NFS-e avulsa — fonte fiscal</h2><p className="mt-3 text-sm">{origin.requestNumber} • {origin.status}</p>{origin.guideId && <Link href={`/api/portal/tributos/guias/${origin.guideId}`} className="mt-3 inline-block text-sm text-emerald-800 underline">Consultar guia da solicitação</Link>}<Link href="/portal/nfse" className="ml-4 inline-block text-sm text-emerald-800 underline">Notas próprias emitidas</Link></section> : null;
  }
  if (request.executorType === "ITBI") {
    const origin = await prisma.itbiDeclaration.findFirst({ where: { id: request.executorId, processId: request.processId, parties: { some: { taxpayerId: request.taxpayerId } } }, select: { declarationNumber: true, status: true, guideId: true } });
    return origin ? <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">ITBI — fonte fiscal</h2><p className="mt-3 text-sm">{origin.declarationNumber} • {origin.status}</p>{origin.guideId && <Link href={`/api/portal/tributos/guias/${origin.guideId}`} className="mt-3 inline-block text-sm text-emerald-800 underline">Consultar DAM</Link>}</section> : null;
  }
  return null;
}
