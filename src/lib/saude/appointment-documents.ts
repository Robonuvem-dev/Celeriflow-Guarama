import PDFDocument from "pdfkit";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthAppointments, healthCareSchedules } from "@/db/schema/health-agenda";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";
import { employees, institutions } from "@/db/schema/administration";
import { addresses } from "@/db/schema/registry";
import { neighborhoods } from "@/db/schema/localities";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";

export async function appointmentReceipt(context: AppContext, appointmentId: string) {
  const database = context.database ?? db;
  const [row] = await database.select({ appointment: healthAppointments, patient: { cns: patients.cns }, person: { fullName: people.fullName }, schedule: healthCareSchedules, professional: { name: employees.name } }).from(healthAppointments).innerJoin(patients, eq(patients.id, healthAppointments.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthCareSchedules, eq(healthCareSchedules.id, healthAppointments.scheduleId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthAppointments.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(eq(healthAppointments.id, appointmentId)).limit(1);
  if (!row) throw new Error("Agendamento não encontrado.");
  const appointment = { ...row.appointment, patient: { ...row.patient, person: row.person }, schedule: row.schedule, professional: row.professional ? { employee: row.professional } : null };
  assertHealthUnitAccess(context.user, appointment.unitId);
  const [institutionRows, unitRows, regulationResult] = await Promise.all([
    database.select({ name: institutions.name, cnpj: institutions.cnpj }).from(institutions).limit(1),
    database.select({ unit: { name: healthUnits.name, phone: healthUnits.phone }, address: { streetName: addresses.streetName, number: addresses.number }, neighborhood: { name: neighborhoods.name, city: neighborhoods.city } }).from(healthUnits).leftJoin(addresses, eq(addresses.id, healthUnits.addressId)).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).where(eq(healthUnits.id, appointment.unitId)).limit(1),
    database.execute<{ procedureCode: string | null; procedureDescription: string | null; requestUnitName: string | null; providerCompany: string | null; providerPerson: string | null; protocolNumber: string | null; preparation: string | null }>(sql`SELECT p.code AS "procedureCode", p.description AS "procedureDescription", u.name AS "requestUnitName", c."corporateName" AS "providerCompany", x."fullName" AS "providerPerson", r."protocolNumber", r.preparation FROM "HealthRegulationRequest" r LEFT JOIN "HealthSusProcedure" p ON p.id=r."procedureId" LEFT JOIN "HealthUnit" u ON u.id=r."requestUnitId" LEFT JOIN "HealthRegulationQuota" q ON q.id=r."quotaId" LEFT JOIN "Supplier" s ON s.id=q."providerSupplierId" LEFT JOIN "Company" c ON c.id=s."companyId" LEFT JOIN "Person" x ON x.id=s."personId" WHERE r."appointmentId"=${appointmentId} LIMIT 1`),
  ]);
  const institution = institutionRows[0], unit = unitRows[0];
  if (!unit) throw new Error("Unidade do agendamento não encontrada.");
  const locationRow = appointment.schedule?.locationUnitId ? (await database.select({ unit: { name: healthUnits.name, phone: healthUnits.phone }, address: { streetName: addresses.streetName, number: addresses.number }, neighborhood: { name: neighborhoods.name, city: neighborhoods.city } }).from(healthUnits).leftJoin(addresses, eq(addresses.id, healthUnits.addressId)).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).where(eq(healthUnits.id, appointment.schedule.locationUnitId)).limit(1))[0] : unit;
  const location = locationRow ? { ...locationRow.unit, address: locationRow.address ? { ...locationRow.address, neighborhood: locationRow.neighborhood } : null } : null;
  const request = regulationResult.rows[0];
  const document = new PDFDocument({ size: "A4", margin: 40 }), chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => { document.on("data", data => chunks.push(Buffer.from(data))); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  document.fontSize(15).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").moveDown().fontSize(16).text("Comprovante de agendamento").moveDown().fontSize(11);
  for (const [label, value] of Object.entries({ Paciente: appointment.patient.person.fullName, CNS: appointment.patient.cns, Data: appointment.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), Horário: appointment.schedule?.fixedReceiptTime || appointment.date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }), Unidade: unit.unit.name, Local: location?.name, Endereço: location?.address ? [location.address.streetName, location.address.number, location.address.neighborhood?.name, location.address.neighborhood?.city].filter(Boolean).join(", ") : null, Telefone: location?.phone, Profissional: appointment.professional?.employee.name, Procedimento: request?.procedureCode ? `${request.procedureCode} · ${request.procedureDescription}` : appointment.specialty, Solicitante: request?.requestUnitName, Prestador: request?.providerCompany || request?.providerPerson, Protocolo: request?.protocolNumber, Preparo: request?.preparation, Situação: appointment.status })) document.text(`${label}: ${value || "Não informado"}`);
  document.moveDown().fontSize(8).text(`Emitido em ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id} · agendamento ${appointment.id}`);
  document.end(); return completed;
}
