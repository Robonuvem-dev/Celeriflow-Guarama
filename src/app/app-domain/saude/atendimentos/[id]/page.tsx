import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { findHealthCareRecord } from "@/db/repositories/health/care";
import { healthPatientConditions, healthOngoingMedications, healthDiagnoses, healthClinicalEvolutions, healthExamRequests, healthPerformedProcedures, healthReferrals, healthClinicalDocuments } from "@/db/schema/health-care";
import { healthPregnancies } from "@/db/schema/health-care-lines";
import { medicines as medicineTable, healthPrescriptions, healthPrescriptionItems } from "@/db/schema/health-prescriptions";
import { healthSpecialties, healthServices } from "@/db/schema/health-administration";
import { healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { healthSusProcedures, healthSusReferences } from "@/db/schema/health-catalogs";
import { employees } from "@/db/schema/administration";
import { documents } from "@/db/schema/registry";
import { Stethoscope } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ClinicalRecordClient from "./ClinicalRecordClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("SAUDE");
  const database = context.database ?? db, base = await findHealthCareRecord(database, id);
  if (!base) notFound();
  if (context.user.hasHealthAccessScope && !context.user.allowedHealthUnitIds?.includes(base.unit.id)) notFound();
  const [clinicalConditions, ongoingMedications, pregnancies, diagnoses, evolutionRows, prescriptionRows, itemRows, examRequests, procedures, referrals, clinicalDocuments] = await Promise.all([
    database.select({ id: healthPatientConditions.id, kind: healthPatientConditions.kind, label: healthPatientConditions.label }).from(healthPatientConditions).where(and(eq(healthPatientConditions.patientId, base.patientId), isNull(healthPatientConditions.endedAt))),
    database.select({ id: healthOngoingMedications.id, name: healthOngoingMedications.name, dosage: healthOngoingMedications.dosage }).from(healthOngoingMedications).where(and(eq(healthOngoingMedications.patientId, base.patientId), isNull(healthOngoingMedications.endedAt))),
    database.select({ id: healthPregnancies.id, estimatedDeliveryDate: healthPregnancies.estimatedDeliveryDate }).from(healthPregnancies).where(and(eq(healthPregnancies.patientId, base.patientId), eq(healthPregnancies.status, "ACTIVE"))),
    database.select({ id: healthDiagnoses.id, isPrimary: healthDiagnoses.isPrimary, notes: healthDiagnoses.notes, cidReference: { code: healthSusReferences.code, description: healthSusReferences.description } }).from(healthDiagnoses).innerJoin(healthSusReferences, eq(healthSusReferences.id, healthDiagnoses.cidReferenceId)).where(eq(healthDiagnoses.medicalRecordId, id)).orderBy(desc(healthDiagnoses.isPrimary), desc(healthDiagnoses.createdAt)),
    database.select({ id: healthClinicalEvolutions.id, content: healthClinicalEvolutions.content, createdAt: healthClinicalEvolutions.createdAt, employee: { name: employees.name } }).from(healthClinicalEvolutions).innerJoin(healthProfessionals, eq(healthProfessionals.id, healthClinicalEvolutions.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(eq(healthClinicalEvolutions.medicalRecordId, id)).orderBy(desc(healthClinicalEvolutions.createdAt)),
    database.select({ id: healthPrescriptions.id, createdAt: healthPrescriptions.createdAt }).from(healthPrescriptions).where(eq(healthPrescriptions.medicalRecordId, id)).orderBy(desc(healthPrescriptions.createdAt)),
    database.select({ prescriptionId: healthPrescriptionItems.prescriptionId, id: healthPrescriptionItems.id, medicineName: healthPrescriptionItems.medicineName, dose: healthPrescriptionItems.dose, frequency: healthPrescriptionItems.frequency, duration: healthPrescriptionItems.duration }).from(healthPrescriptionItems).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId)).where(eq(healthPrescriptions.medicalRecordId, id)),
    database.select({ id: healthExamRequests.id, examName: healthExamRequests.examName, priority: healthExamRequests.priority, indication: healthExamRequests.indication, createdAt: healthExamRequests.createdAt }).from(healthExamRequests).where(eq(healthExamRequests.medicalRecordId, id)).orderBy(desc(healthExamRequests.createdAt)),
    database.select({ id: healthPerformedProcedures.id, quantity: healthPerformedProcedures.quantity, notes: healthPerformedProcedures.notes, performedAt: healthPerformedProcedures.performedAt, procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description } }).from(healthPerformedProcedures).innerJoin(healthSusProcedures, eq(healthSusProcedures.id, healthPerformedProcedures.procedureId)).where(eq(healthPerformedProcedures.medicalRecordId, id)).orderBy(desc(healthPerformedProcedures.performedAt)),
    database.select({ id: healthReferrals.id, specialty: healthReferrals.specialty, priority: healthReferrals.priority, reason: healthReferrals.reason, createdAt: healthReferrals.createdAt }).from(healthReferrals).where(eq(healthReferrals.medicalRecordId, id)).orderBy(desc(healthReferrals.createdAt)),
    database.select({ id: healthClinicalDocuments.id, kind: healthClinicalDocuments.kind, createdAt: healthClinicalDocuments.createdAt, document: { id: documents.id, title: documents.title, status: documents.status } }).from(healthClinicalDocuments).innerJoin(documents, eq(documents.id, healthClinicalDocuments.documentId)).where(eq(healthClinicalDocuments.medicalRecordId, id)).orderBy(desc(healthClinicalDocuments.createdAt)),
  ]);
  const record = {
    id: base.id, date: base.date, chiefComplaint: base.chiefComplaint, anamnesis: base.anamnesis, assessment: base.assessment, evolution: base.evolution, conduct: base.conduct, observations: base.observations, outcome: base.outcome, completedAt: base.completedAt,
    bloodPressure: base.bloodPressure, temperature: base.temperature, weight: base.weight, height: base.height, heartRate: base.heartRate, respiratoryRate: base.respiratoryRate, oxygenSaturation: base.oxygenSaturation, bloodGlucose: base.bloodGlucose,
    patient: { cns: base.patient.cns, knownAllergies: base.patient.knownAllergies, person: { fullName: base.patient.person.fullName, birthDate: base.patient.person.birthDate }, clinicalConditions, ongoingMedications, pregnancies }, unit: { id: base.unit.id, name: base.unit.name }, professional: { employee: base.professional.employee }, appointment: base.appointment ? { origin: base.appointment.origin, status: base.appointment.status, triage: base.appointment.triage ? { riskClassification: base.appointment.triage.riskClassification } : null } : null, observation: base.observation ? { id: base.observation.id, status: base.observation.status } : null,
    diagnoses, evolutions: evolutionRows.map(row => ({ id: row.id, content: row.content, createdAt: row.createdAt, professional: { employee: row.employee } })), prescriptions: prescriptionRows.map(row => ({ ...row, items: itemRows.filter(item => item.prescriptionId === row.id).map(item => ({ id: item.id, medicineName: item.medicineName, dose: item.dose, frequency: item.frequency, duration: item.duration })) })), examRequests, procedures, referrals, clinicalDocuments,
  };
  const [medicines, specialties, services, units] = await Promise.all([
    database.select({ id: medicineTable.id, name: medicineTable.name, presentation: medicineTable.presentation }).from(medicineTable).where(eq(medicineTable.isActive, true)).orderBy(asc(medicineTable.name)),
    database.select({ id: healthSpecialties.id, name: healthSpecialties.name }).from(healthSpecialties).where(eq(healthSpecialties.isActive, true)).orderBy(asc(healthSpecialties.name)),
    database.select({ id: healthServices.id, name: healthServices.name }).from(healthServices).where(eq(healthServices.isActive, true)).orderBy(asc(healthServices.name)),
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(eq(healthUnits.isActive, true)).orderBy(asc(healthUnits.name)),
  ]);
  const serialized = { ...record, date: record.date.toISOString(), completedAt: record.completedAt?.toISOString() || null, patient: { ...record.patient, person: { ...record.patient.person, birthDate: record.patient.person.birthDate?.toISOString() || null } }, evolutions: record.evolutions.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })), prescriptions: record.prescriptions.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })), examRequests: record.examRequests.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })), procedures: record.procedures.map(item => ({ ...item, performedAt: item.performedAt.toISOString() })), referrals: record.referrals.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })), clinicalDocuments: record.clinicalDocuments.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })) };
  return <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden"><PageHeader title="Prontuário do Atendimento" icon={<Stethoscope className="size-4 text-emerald-600" />} />
    <aside aria-label="Indicativos clínicos" className="flex shrink-0 flex-wrap gap-2 text-xs">
      {record.patient.knownAllergies && <span className="rounded border border-red-300 bg-red-50 p-2 font-semibold text-red-900">Alergias cadastradas: {record.patient.knownAllergies}</span>}
      {record.patient.clinicalConditions.map(condition => <span key={condition.id} className={`rounded border p-2 font-semibold ${condition.kind === "ALLERGY" ? "border-red-300 bg-red-50 text-red-900" : "bg-amber-50"}`}>{condition.kind === "ALLERGY" ? "Alergia" : "Condição"}: {condition.label}</span>)}
      {record.patient.ongoingMedications.map(medication => <span key={medication.id} className="rounded border bg-blue-50 p-2">Uso contínuo: {medication.name} · {medication.dosage}</span>)}
      {record.patient.pregnancies.map(pregnancy => <span key={pregnancy.id} className="rounded border bg-violet-100 p-2 font-semibold">Gestação ativa · DPP {pregnancy.estimatedDeliveryDate.toLocaleDateString("pt-BR")}</span>)}
    </aside><ClinicalRecordClient record={serialized} medicines={medicines} specialties={specialties} services={services} units={units} /></PageFrame>;
}
