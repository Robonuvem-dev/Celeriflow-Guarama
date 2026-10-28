import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { AccessError } from "@/lib/platform/tenant-context";
import { createHealthAppointment, transitionHealthAppointment } from "./appointment-service";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { eq } from "drizzle-orm";
import { people } from "@/db/schema/people";
import { createPortalManifestation, findPortalActiveUnit, findPortalAppointmentOwner, readPortalAppointments, readPortalDispensations, readPortalDocuments, readPortalLabReports, readPortalManifestations, readPortalOpenSchedules, readPortalReferralsRegulation, readPortalVaccinations } from "@/db/repositories/health/patient-portal";
import { PatientPortalError } from "@/lib/contracts/patient-portal";

export { PatientPortalError } from "@/lib/contracts/patient-portal";

// Todas as funções recebem o patientId resolvido exclusivamente da sessão
// (getPatientPortalAccess). Nenhum ID vindo do navegador é aceito.

export async function portalAppointments(context: AppContext, patientId: string) {
  return readPortalAppointments(context.database ?? db, patientId);
}

export async function portalRequestAppointment(context: AppContext, patientId: string, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), specialty: z.string().max(200).nullable().optional(), scheduleId: z.string().min(1).nullable().optional() }).strict().parse(raw);
  const unit = await findPortalActiveUnit(context.database ?? db, input.unitId);
  if (!unit) throw new PatientPortalError("Unidade de saúde inválida.");
  return createHealthAppointment(context, { patientId, unitId: unit.id, professionalId: null, date: input.date, specialty: input.specialty || null, schedulingGroupId: null, specialtyId: null, serviceId: null, scheduleId: input.scheduleId || null, priority: "Normal" });
}

export async function portalOpenSchedules(context: AppContext) {
  return readPortalOpenSchedules(context.database ?? db);
}

export async function portalTransitionAppointment(context: AppContext, patientId: string, appointmentId: string, status: "Confirmado" | "Cancelado", cancellationReason?: string | null) {
  const appointment = await findPortalAppointmentOwner(context.database ?? db, appointmentId);
  if (!appointment || appointment.patientId !== patientId) throw new AccessError("Agendamento não encontrado.", 404);
  return transitionHealthAppointment(context, { appointmentId, status, cancellationReason: cancellationReason || null });
}

export async function portalVaccinations(context: AppContext, patientId: string) {
  return readPortalVaccinations(context.database ?? db, patientId);
}

export async function portalDispensations(context: AppContext, patientId: string) {
  return readPortalDispensations(context.database ?? db, patientId);
}

// Somente laudos LIBERADOS com publicação ao paciente aparecem.
export async function portalLabReports(context: AppContext, patientId: string) {
  return readPortalLabReports(context.database ?? db, patientId);
}

export async function portalReferralsRegulation(context: AppContext, patientId: string) {
  return readPortalReferralsRegulation(context.database ?? db, patientId);
}

export async function portalDocuments(context: AppContext, patientId: string) {
  return readPortalDocuments(context.database ?? db, patientId);
}

const contactSchema = z.object({
  phonePrimary: z.string().trim().max(30).nullable().optional(),
  phoneSecondary: z.string().trim().max(30).nullable().optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
}).strict();

// Atualização cadastral restrita a contatos. Identidade clínica e
// documentos permanecem sob fluxo administrativo.
export async function portalUpdateContact(context: AppContext, personId: string, raw: unknown) {
  const input = contactSchema.parse(raw);
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PatientPortalError("E-mail inválido.");
  const [person] = await (context.database ?? db).update(people).set({ phonePrimary: input.phonePrimary?.trim() || null, phoneSecondary: input.phoneSecondary?.trim() || null, whatsapp: input.whatsapp?.trim() || null, email }).where(eq(people.id, personId)).returning({ id: people.id });
  if (!person) throw new PatientPortalError("Pessoa não encontrada.");
  return person;
}

const manifestationSchema = z.object({
  type: z.enum(["Denúncia", "Reclamação", "Sugestão", "Elogio"]),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(4000),
  isAnonymous: z.boolean().default(false),
}).strict();

export async function portalCreateManifestation(context: AppContext, personId: string, raw: unknown) {
  const input = manifestationSchema.parse(raw);
  return withDatabaseTransaction(databaseConnection, tx => createPortalManifestation(tx, context.user.id, personId, input));
}

export async function portalManifestations(context: AppContext, personId: string) {
  return readPortalManifestations(context.database ?? db, personId);
}
