import { notFound } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ClinicalRecordClient from "./ClinicalRecordClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("SAUDE");
  const record = await context.prisma.medicalRecord.findUnique({
    where: { id },
    select: {
      id: true, date: true, chiefComplaint: true, anamnesis: true, assessment: true, evolution: true, conduct: true, observations: true, outcome: true, completedAt: true,
      bloodPressure: true, temperature: true, weight: true, height: true, heartRate: true, respiratoryRate: true, oxygenSaturation: true, bloodGlucose: true,
      patient: { select: { cns: true, knownAllergies: true, clinicalConditions: { where: { endedAt: null }, select: { id: true, kind: true, label: true } }, ongoingMedications: { where: { endedAt: null }, select: { id: true, name: true, dosage: true } }, pregnancies: { where: { status: "ACTIVE" }, select: { id: true, estimatedDeliveryDate: true } }, person: { select: { fullName: true, birthDate: true } } } }, unit: { select: { id: true, name: true } }, professional: { select: { employee: { select: { name: true } } } },
      appointment: { select: { origin: true, status: true, triage: { select: { riskClassification: true } } } },
      diagnoses: { orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }], select: { id: true, isPrimary: true, notes: true, cidReference: { select: { code: true, description: true } } } },
      evolutions: { orderBy: { createdAt: "desc" }, select: { id: true, content: true, createdAt: true, professional: { select: { employee: { select: { name: true } } } } } },
      prescriptions: { orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, items: { select: { id: true, medicineName: true, dose: true, frequency: true, duration: true } } } },
      examRequests: { orderBy: { createdAt: "desc" }, select: { id: true, examName: true, priority: true, indication: true, createdAt: true } },
      procedures: { orderBy: { performedAt: "desc" }, select: { id: true, quantity: true, notes: true, performedAt: true, procedure: { select: { code: true, description: true } } } },
      referrals: { orderBy: { createdAt: "desc" }, select: { id: true, specialty: true, priority: true, reason: true, createdAt: true } },
      clinicalDocuments: { orderBy: { createdAt: "desc" }, select: { id: true, kind: true, createdAt: true, document: { select: { id: true, title: true, status: true } } } },
      observation: { select: { id: true, status: true } },
    },
  });
  if (!record) notFound();
  if (context.user.hasHealthAccessScope && !context.user.allowedHealthUnitIds?.includes(record.unit.id)) notFound();
  const [medicines, specialties, services, units] = await Promise.all([
    context.prisma.medicine.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, presentation: true } }),
    context.prisma.healthSpecialty.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    context.prisma.healthService.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    context.prisma.healthUnit.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
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
