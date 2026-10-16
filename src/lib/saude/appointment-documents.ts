import PDFDocument from "pdfkit";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";

export async function appointmentReceipt(context: AppContext, appointmentId: string) {
  const appointment = await context.prisma.healthAppointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { patient: { include: { person: true } }, unit: { include: { address: { include: { neighborhood: true } } } }, professional: { include: { employee: true } }, schedule: true, regulationRequest: { include: { procedure: true, requestUnit: true, quota: { include: { provider: { include: { company: true, person: true } } } } } } } });
  assertHealthUnitAccess(context.user, appointment.unitId);
  const institution = await context.prisma.institution.findFirst();
  const document = new PDFDocument({ size: "A4", margin: 40 }), chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => { document.on("data", data => chunks.push(Buffer.from(data))); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  document.fontSize(15).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").moveDown().fontSize(16).text("Comprovante de agendamento").moveDown().fontSize(11);
  const location = appointment.schedule?.locationUnitId ? await context.prisma.healthUnit.findUnique({ where: { id: appointment.schedule.locationUnitId }, include: { address: { include: { neighborhood: true } } } }) : appointment.unit;
  const request = appointment.regulationRequest;
  for (const [label, value] of Object.entries({ Paciente: appointment.patient.person.fullName, CNS: appointment.patient.cns, Data: appointment.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), Horário: appointment.schedule?.fixedReceiptTime || appointment.date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }), Unidade: appointment.unit.name, Local: location?.name, Endereço: location?.address ? [location.address.streetName, location.address.number, location.address.neighborhood?.name, location.address.neighborhood?.city].filter(Boolean).join(", ") : null, Telefone: location?.phone, Profissional: appointment.professional?.employee.name, Procedimento: request?.procedure ? `${request.procedure.code} · ${request.procedure.description}` : appointment.specialty, Solicitante: request?.requestUnit?.name, Prestador: request?.quota?.provider.company?.corporateName || request?.quota?.provider.person?.fullName, Protocolo: request?.protocolNumber, Preparo: request?.preparation, Situação: appointment.status })) document.text(`${label}: ${value || "Não informado"}`);
  document.moveDown().fontSize(8).text(`Emitido em ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id} · agendamento ${appointment.id}`);
  document.end(); return completed;
}
