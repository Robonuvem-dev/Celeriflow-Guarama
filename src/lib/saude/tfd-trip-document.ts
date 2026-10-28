import PDFDocument from "pdfkit";
import { and, asc, eq, getTableColumns } from "drizzle-orm";
import type { HealthTfdContext as AppContext } from "@/lib/contracts/health-tfd";
import { db } from "@/db/client";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees, institutions } from "@/db/schema/administration";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { fleetBookings, fleetTrips, fleetUnits } from "@/db/schema/fleet";
import * as t from "@/db/schema/health-tfd";
import { activeTfdPassengerWhere, readTfdTrip, requiredTfdRecord } from "@/db/repositories/health-tfd/records";

export async function tfdTripDocument(context: AppContext, tripId: string, executor: DatabaseExecutor = db) {
  const record = requiredTfdRecord(await readTfdTrip(executor, context.user, tripId));
  const employee = async (id: string | null) => id ? (await executor.select().from(employees).where(eq(employees.id, id)).limit(1))[0] ?? null : null;
  const [fleetUnit, fleetBooking, driverEmployee, assistantEmployee, responsibleEmployee, passengerRows, events] = await Promise.all([
    executor.select().from(fleetUnits).where(eq(fleetUnits.id, record.fleetUnitId)).limit(1).then(rows => requiredTfdRecord(rows[0])),
    record.fleetBookingId ? executor.select().from(fleetBookings).where(eq(fleetBookings.id, record.fleetBookingId)).limit(1).then(rows => rows[0] ?? null) : null,
    employee(record.driverEmployeeId), employee(record.assistantEmployeeId), employee(record.responsibleEmployeeId),
    executor.select({ passenger: getTableColumns(t.healthTfdPassengers), patient: getTableColumns(patients), person: getTableColumns(people) }).from(t.healthTfdPassengers).innerJoin(patients, eq(patients.id, t.healthTfdPassengers.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(and(eq(t.healthTfdPassengers.tripId, tripId), activeTfdPassengerWhere)),
    executor.select().from(t.healthTfdTripEvents).where(eq(t.healthTfdTripEvents.tripId, tripId)).orderBy(asc(t.healthTfdTripEvents.createdAt)),
  ]);
  const trip = { ...record, fleetUnit, fleetBooking, driverEmployee, assistantEmployee, responsibleEmployee, passengers: passengerRows.map(row => ({ ...row.passenger, patient: { ...row.patient, person: row.person } })), events };
  const [institution] = await executor.select().from(institutions).limit(1);
  const fleetMovement = trip.fleetBookingId ? (await executor.select().from(fleetTrips).where(eq(fleetTrips.bookingId, trip.fleetBookingId)).limit(1))[0] ?? null : null;
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
