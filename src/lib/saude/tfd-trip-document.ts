import PDFDocument from "pdfkit";
import type { AppContext } from "@/lib/platform/tenant-context";
import { activeTfdPassengerWhere, tfdTripAccessWhere } from "./tfd-service";

export async function tfdTripDocument(context: AppContext, tripId: string) {
  const trip = await context.prisma.healthTfdTrip.findFirstOrThrow({ where: { id: tripId, ...tfdTripAccessWhere(context.user) }, include: { fleetUnit: true, fleetBooking: true, driverEmployee: true, assistantEmployee: true, responsibleEmployee: true, passengers: { where: activeTfdPassengerWhere, include: { patient: { include: { person: true } } } }, events: { orderBy: { createdAt: "asc" } } } });
  const institution = await context.prisma.institution.findFirst();
  const fleetMovement = trip.fleetBookingId ? await context.prisma.fleetTrip.findUnique({ where: { bookingId: trip.fleetBookingId } }) : null;
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "Ordem de tráfego e relação de passageiros TFD" } }), chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.fontSize(14).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").moveDown();
  doc.fontSize(15).text("Ordem de tráfego e relação de passageiros TFD").fontSize(10).text(`Viagem ${trip.id} · ${trip.status}`);
  doc.text(`${trip.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })} · ${trip.origin} → ${trip.destination}`);
  doc.text(`Motivo: ${trip.purpose || "Não informado"}`);
  doc.text(`Veículo: ${trip.fleetUnit.name} · placa ${trip.fleetUnit.plate || "Não informada"} · marca/modelo ${trip.fleetUnit.brand || ""} ${trip.fleetUnit.model || ""}`);
  doc.text(`Motorista: ${trip.driverEmployee?.name || "Consultar motorista identificado em Frotas"} · auxiliar: ${trip.assistantEmployee?.name || "Sem auxiliar"}`);
  doc.text(`Responsável: ${trip.responsibleEmployee?.name || "Não informado"} · integrantes ${trip.passengers.length}/${trip.capacity}`);
  doc.text(`Confirmação: ${trip.confirmedAt ? `${trip.confirmedAt.toLocaleString("pt-BR")} · usuário ${trip.confirmedByUsuarioId}` : "Ainda não confirmada"}`);
  if (trip.fleetBooking) doc.text(`Agenda de Frotas: ${trip.fleetBooking.id} · ${trip.fleetBooking.startsAt.toLocaleString("pt-BR")} a ${trip.fleetBooking.endsAt.toLocaleString("pt-BR")} · ${trip.fleetBooking.status}`);
  if (fleetMovement) doc.text(`Saída de Frotas: ${fleetMovement.departedAt.toLocaleString("pt-BR")} · retorno ${fleetMovement.returnedAt?.toLocaleString("pt-BR") || "Em aberto"} · registro ${fleetMovement.id}`);
  if (trip.advanceRequestId) doc.text(`Adiantamento RH: ${trip.advanceRequestId} · valor autorizado na vinculação R$ ${trip.advanceAuthorizedAmount?.toFixed(2)}. Pagamento e prestação de contas são conferidos na origem RH/Financeiro.`);
  doc.moveDown();
  for (const [index, passenger] of trip.passengers.entries()) {
    doc.font("Helvetica-Bold").text(`${index + 1}. ${passenger.kind === "ACOMPANHANTE" ? passenger.companionName : passenger.patient.person.fullName}`).font("Helvetica");
    doc.text(`Tipo: ${passenger.kind} · paciente vinculado: ${passenger.patient.person.fullName} · solicitação TFD ${passenger.tfdRequestId || "Não vinculada"}`);
    doc.text(`Embarque: ${passenger.boardingLocation || "Não definido"} · presença: ${passenger.presenceStatus}${passenger.presenceAt ? ` · ${passenger.presenceAt.toLocaleString("pt-BR")} · usuário ${passenger.presenceByUsuarioId}` : ""}`).moveDown(0.3);
  }
  doc.moveDown().font("Helvetica-Bold").text("Histórico da viagem").font("Helvetica");
  for (const event of trip.events) doc.fontSize(9).text(`${event.createdAt.toLocaleString("pt-BR")} · ${event.eventType} · usuário ${event.actorUsuarioId} · ${event.reason}`);
  doc.moveDown().fontSize(8).text(`Emissão ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id}`); doc.end();
  return finished;
}
