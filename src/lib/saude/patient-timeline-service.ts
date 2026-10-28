import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { healthTimestamp } from "@/db/repositories/health/timestamp";

export type TimelineEvent = {
  id: string;
  date: Date;
  kind: string;
  title: string;
  detail: string | null;
  href: string | null;
};

type Appointment = { id: string; date: string; status: string; specialty: string | null; unit: { name: string } };
type RecordEvent = { id: string; date: string; type: string; outcome: string | null; unit: { name: string }; diagnoses: { cidReference: { code: string } }[]; prescriptions: { id: string }[] };
type Dispensation = { id: string; date: string; quantity: number; status: string; cancellationReason: string | null; medicine: { name: string }; unit: { name: string } | null };
type Vaccination = { id: string; date: string; doseNumber: number; vaccine: { name: string }; unit: { name: string } };
type Exam = { id: string; date: string; examName: string; status: string };
type LabOrder = { id: string; createdAt: string; status: string; examRequest: { examName: string } | null; examModel: { name: string } | null };
type Report = { id: string; createdAt: string; status: string; publishedAt: string | null; document: { title: string }; orderId: string };
type Referral = { id: string; date: string; specialty: string; status: string };
type Regulation = { id: string; createdAt: string; status: string; guideNumber: string | null; specialty: { name: string } | null; service: { name: string } | null };
type Tfd = { id: string; createdAt: string; destination: string; status: string };
type Visit = { id: string; visitedAt: string; actions: string };
type Plan = { id: string; startedAt: string; status: string; team: { name: string } };

// Visão cronológica unificada do paciente. Cada evento preserva seu tipo
// original (não converte tudo em "consulta") e aponta para a origem.
export async function listPatientTimeline(db: DatabaseExecutor, patientId: string, limit = 200): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const [appointments, records, dispensations, vaccinations, examRequests, labOrders, reports, referrals, regulations, tfdRequests, visitParts, plans] = await Promise.all([
    db.execute<Appointment>(sql`SELECT a.id,a.date,a.status,a.specialty,json_build_object('name',u.name) AS unit FROM "HealthAppointment" a JOIN "HealthUnit" u ON u.id=a."unitId" WHERE a."patientId"=${patientId} ORDER BY a.date DESC LIMIT 100`).then(r => r.rows),
    db.execute<RecordEvent>(sql`SELECT m.id,m.date,m.type,m.outcome,json_build_object('name',u.name) AS unit,COALESCE((SELECT json_agg(json_build_object('cidReference',json_build_object('code',c.code))) FROM "HealthDiagnosis" d JOIN "HealthSusReference" c ON c.id=d."cidReferenceId" WHERE d."medicalRecordId"=m.id),'[]'::json) AS diagnoses,COALESCE((SELECT json_agg(json_build_object('id',p.id)) FROM "HealthPrescription" p WHERE p."medicalRecordId"=m.id),'[]'::json) AS prescriptions FROM "MedicalRecord" m JOIN "HealthUnit" u ON u.id=m."unitId" WHERE m."patientId"=${patientId} ORDER BY m.date DESC LIMIT 100`).then(r => r.rows),
    db.execute<Dispensation>(sql`SELECT d.id,d.date,d.quantity,d.status,d."cancellationReason",json_build_object('name',m.name) AS medicine,CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('name',u.name) END AS unit FROM "MedicineDispensation" d JOIN "Medicine" m ON m.id=d."medicineId" LEFT JOIN "HealthUnit" u ON u.id=d."unitId" WHERE d."patientId"=${patientId} ORDER BY d.date DESC LIMIT 100`).then(r => r.rows),
    db.execute<Vaccination>(sql`SELECT r.id,r.date,r."doseNumber",json_build_object('name',v.name) AS vaccine,json_build_object('name',u.name) AS unit FROM "VaccinationRecord" r JOIN "Vaccine" v ON v.id=r."vaccineId" JOIN "HealthUnit" u ON u.id=r."unitId" WHERE r."patientId"=${patientId} ORDER BY r.date DESC LIMIT 100`).then(r => r.rows),
    db.execute<Exam>(sql`SELECT id,date,"examName",status FROM "HealthExamRequest" WHERE "patientId"=${patientId} ORDER BY date DESC LIMIT 100`).then(r => r.rows),
    db.execute<LabOrder>(sql`SELECT o.id,o."createdAt",o.status,CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('examName',r."examName") END AS "examRequest",CASE WHEN m.id IS NULL THEN NULL ELSE json_build_object('name',m.name) END AS "examModel" FROM "HealthLabOrder" o LEFT JOIN "HealthExamRequest" r ON r.id=o."examRequestId" LEFT JOIN "HealthLabExamModel" m ON m.id=o."examModelId" WHERE o."patientId"=${patientId} ORDER BY o."createdAt" DESC LIMIT 100`).then(r => r.rows),
    db.execute<Report>(sql`SELECT r.id,r."createdAt",r.status,r."publishedAt",json_build_object('title',d.title) AS document,r."orderId" FROM "HealthLabReport" r JOIN "HealthLabOrder" o ON o.id=r."orderId" JOIN "Document" d ON d.id=r."documentId" WHERE o."patientId"=${patientId} ORDER BY r."createdAt" DESC LIMIT 100`).then(r => r.rows),
    db.execute<Referral>(sql`SELECT id,date,specialty,status FROM "HealthReferral" WHERE "patientId"=${patientId} ORDER BY date DESC LIMIT 100`).then(r => r.rows),
    db.execute<Regulation>(sql`SELECT r.id,r."createdAt",r.status,r."guideNumber",CASE WHEN sp.id IS NULL THEN NULL ELSE json_build_object('name',sp.name) END AS specialty,CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('name',s.name) END AS service FROM "HealthRegulationRequest" r LEFT JOIN "HealthSpecialty" sp ON sp.id=r."specialtyId" LEFT JOIN "HealthService" s ON s.id=r."serviceId" WHERE r."patientId"=${patientId} ORDER BY r."createdAt" DESC LIMIT 100`).then(r => r.rows),
    db.execute<Tfd>(sql`SELECT id,"createdAt",destination,status FROM "HealthTfdRequest" WHERE "patientId"=${patientId} ORDER BY "createdAt" DESC LIMIT 100`).then(r => r.rows),
    db.execute<Visit>(sql`SELECT v.id,v."visitedAt",v.actions FROM "HealthHomeVisitParticipant" p JOIN "HealthHomeVisit" v ON v.id=p."visitId" WHERE p."patientId"=${patientId} ORDER BY v."visitedAt" DESC LIMIT 100`).then(r => r.rows),
    db.execute<Plan>(sql`SELECT p.id,p."startedAt",p.status,json_build_object('name',t.name) AS team FROM "SpecializedTherapeuticPlan" p JOIN "HealthTeam" t ON t.id=p."teamId" WHERE p."patientId"=${patientId} ORDER BY p."startedAt" DESC LIMIT 50`).then(r => r.rows),
  ]);
  for (const a of appointments) events.push({ id: `agendamento:${a.id}`, date: healthTimestamp(a.date), kind: "AGENDAMENTO", title: `Agendamento${a.specialty ? ` · ${a.specialty}` : ""} · ${a.status}`, detail: a.unit?.name || null, href: "/saude/agenda" });
  // Acolhimento/triagem vinculado ao agendamento
  const triages = appointments.length ? (await db.execute<{ appointmentId: string; chiefComplaint: string | null; riskClassification: string | null; createdAt: string }>(sql`SELECT "appointmentId","chiefComplaint","riskClassification","createdAt" FROM "HealthTriage" WHERE "appointmentId" IN (${sql.join(appointments.map(a => sql`${a.id}`), sql`, `)})`)).rows : [];
  for (const t of triages) events.push({ id: `acolhimento:${t.appointmentId}`, date: healthTimestamp(t.createdAt), kind: "ACOLHIMENTO", title: `Acolhimento · ${t.riskClassification || "sem classificação"}`, detail: t.chiefComplaint?.slice(0, 120) || null, href: "/saude/acolhimento" });
  for (const r of records) {
    events.push({ id: `atendimento:${r.id}`, date: healthTimestamp(r.date), kind: "ATENDIMENTO", title: `${r.type} · ${r.unit?.name || ""}`.trim(), detail: r.outcome || null, href: `/saude/atendimentos/${r.id}` });
    for (const d of r.diagnoses) events.push({ id: `diagnostico:${r.id}:${d.cidReference.code}`, date: healthTimestamp(r.date), kind: "DIAGNOSTICO", title: `CID ${d.cidReference.code}`, detail: null, href: `/saude/atendimentos/${r.id}` });
    for (const p of r.prescriptions) events.push({ id: `receita:${p.id}`, date: healthTimestamp(r.date), kind: "PRESCRICAO", title: "Receita emitida", detail: null, href: `/saude/atendimentos/${r.id}` });
  }
  for (const d of dispensations) events.push({ id: `dispensacao:${d.id}`, date: healthTimestamp(d.date), kind: "DISPENSACAO", title: `${d.medicine.name} · ${d.quantity}${d.status === "CANCELLED" ? " · cancelada" : ""}`, detail: d.status === "CANCELLED" ? d.cancellationReason : d.unit?.name || null, href: "/saude/farmacia/dispensacoes" });
  for (const v of vaccinations) events.push({ id: `vacina:${v.id}`, date: healthTimestamp(v.date), kind: "VACINA", title: `${v.vaccine.name} · dose ${v.doseNumber}`, detail: v.unit?.name || null, href: "/saude/vacinacao" });
  for (const e of examRequests) events.push({ id: `exame:${e.id}`, date: healthTimestamp(e.date), kind: "EXAME", title: `${e.examName} · ${e.status}`, detail: null, href: "/saude/laboratorio" });
  for (const o of labOrders) events.push({ id: `coleta:${o.id}`, date: healthTimestamp(o.createdAt), kind: "COLETA", title: `${o.examRequest?.examName || o.examModel?.name || "Exame"} · ${o.status}`, detail: null, href: "/saude/laboratorio" });
  for (const l of reports) events.push({ id: `laudo:${l.id}`, date: healthTimestamp(l.createdAt), kind: "LAUDO", title: `${l.document.title} · ${l.publishedAt ? "liberado" : l.status}`, detail: null, href: "/saude/laboratorio" });
  for (const r of referrals) events.push({ id: `encaminhamento:${r.id}`, date: healthTimestamp(r.date), kind: "ENCAMINHAMENTO", title: `${r.specialty} · ${r.status}`, detail: null, href: "/saude/regulacao" });
  for (const r of regulations) events.push({ id: `regulacao:${r.id}`, date: healthTimestamp(r.createdAt), kind: "REGULACAO", title: `${r.specialty?.name || r.service?.name || "Solicitação"} · ${r.status}${r.guideNumber ? ` · guia ${r.guideNumber}` : ""}`, detail: null, href: "/saude/regulacao" });
  for (const t of tfdRequests) events.push({ id: `tfd:${t.id}`, date: healthTimestamp(t.createdAt), kind: "TFD", title: `TFD → ${t.destination} · ${t.status}`, detail: null, href: "/saude/tfd" });
  for (const v of visitParts) events.push({ id: `visita:${v.id}`, date: healthTimestamp(v.visitedAt), kind: "VISITA", title: "Visita domiciliar", detail: v.actions.slice(0, 120), href: "/saude/territorio" });
  for (const p of plans) events.push({ id: `plano:${p.id}`, date: healthTimestamp(p.startedAt), kind: "CENTRO_ESPECIALIZADO", title: `Plano terapêutico · ${p.team.name} · ${p.status}`, detail: null, href: "/saude/centro-especializado" });
  return events.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
