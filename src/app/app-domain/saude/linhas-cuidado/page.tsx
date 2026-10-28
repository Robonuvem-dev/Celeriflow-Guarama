import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, asc, desc, eq, ilike, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { patients as patientTable, healthPatientRegistrations } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthUnits } from "@/db/schema/health-workforce";
import { addresses } from "@/db/schema/registry";
import { neighborhoods } from "@/db/schema/localities";
import { medicalRecords } from "@/db/schema/health-care";
import { healthPregnancies, healthPregnancyVisits, healthPostpartumVisits, healthChronicAssessments, healthClinicalScreenings } from "@/db/schema/health-care-lines";

const kinds = { PREGNANCY: "Gestação e puerpério", HYPERTENSION: "Hipertensão", DIABETES: "Diabetes", CYTOLOGY: "Citopatológico", MAMMOGRAPHY: "Mamografia" };
export default async function CareLinesManager({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { q = "", kind = "PREGNANCY" } = await searchParams;
  const context = await getTenantContextForModule("SAUDE");
  const database = context.database ?? db;
  const filter = and(notInArray(patientTable.status, ["Unificado", "Falecido"]), context.user.hasHealthAccessScope ? inArray(patientTable.referenceUnitId, context.user.allowedHealthUnitIds || []) : undefined, q.trim() ? ilike(people.fullName, `%${q.trim()}%`) : undefined,
    kind === "PREGNANCY" ? sql`EXISTS (SELECT 1 FROM "HealthPregnancy" p WHERE p."patientId"=${patientTable.id})` : kind === "HYPERTENSION" || kind === "DIABETES" ? sql`EXISTS (SELECT 1 FROM "HealthChronicAssessment" a WHERE a."patientId"=${patientTable.id} AND a."conditionKind"=${kind})` : kind === "CYTOLOGY" || kind === "MAMMOGRAPHY" ? sql`EXISTS (SELECT 1 FROM "HealthClinicalScreening" s WHERE s."patientId"=${patientTable.id} AND s.kind=${kind})` : undefined);
  const rows = await database.select({ patient: patientTable, person: people, registrationProfile: healthPatientRegistrations, referenceUnit: { name: healthUnits.name } }).from(patientTable).innerJoin(people, eq(people.id, patientTable.personId)).leftJoin(healthPatientRegistrations, eq(healthPatientRegistrations.patientId, patientTable.id)).leftJoin(healthUnits, eq(healthUnits.id, patientTable.referenceUnitId)).where(filter).orderBy(asc(people.fullName)).limit(200);
  const ids = rows.map(row => row.patient.id);
  const [addressRows, pregnancyRows, assessments, screenings, records] = await Promise.all([
    database.select({ address: addresses, neighborhood: { name: neighborhoods.name, city: neighborhoods.city, state: neighborhoods.state } }).from(addresses).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).where(inArray(addresses.personId, rows.map(row => row.patient.personId))),
    database.select().from(healthPregnancies).where(inArray(healthPregnancies.patientId, ids)).orderBy(desc(healthPregnancies.createdAt)),
    database.select().from(healthChronicAssessments).where(and(inArray(healthChronicAssessments.patientId, ids), kind === "HYPERTENSION" || kind === "DIABETES" ? eq(healthChronicAssessments.conditionKind, kind) : undefined)).orderBy(desc(healthChronicAssessments.assessedAt)),
    database.select().from(healthClinicalScreenings).where(and(inArray(healthClinicalScreenings.patientId, ids), kind === "CYTOLOGY" || kind === "MAMMOGRAPHY" ? eq(healthClinicalScreenings.kind, kind) : undefined)).orderBy(desc(healthClinicalScreenings.requestedAt)),
    database.select({ id: medicalRecords.id, patientId: medicalRecords.patientId }).from(medicalRecords).where(and(inArray(medicalRecords.patientId, ids), context.user.hasHealthAccessScope ? inArray(medicalRecords.unitId, context.user.allowedHealthUnitIds || []) : undefined)).orderBy(desc(medicalRecords.date)),
  ]);
  const [visits, postpartumVisits] = await Promise.all([
    database.select().from(healthPregnancyVisits).where(inArray(healthPregnancyVisits.pregnancyId, pregnancyRows.map(row => row.id))).orderBy(desc(healthPregnancyVisits.occurredAt)),
    database.select().from(healthPostpartumVisits).where(inArray(healthPostpartumVisits.pregnancyId, pregnancyRows.map(row => row.id))),
  ]);
  const patients = rows.map(row => ({ ...row.patient, person: { ...row.person, addresses: addressRows.filter(address => address.address.personId === row.patient.personId).map(address => ({ ...address.address, neighborhood: address.neighborhood })) }, registrationProfile: row.registrationProfile, referenceUnit: row.referenceUnit, pregnancies: pregnancyRows.filter(pregnancy => pregnancy.patientId === row.patient.id).map(pregnancy => ({ ...pregnancy, visits: visits.filter(visit => visit.pregnancyId === pregnancy.id).slice(0, 1), postpartumVisits: postpartumVisits.filter(visit => visit.pregnancyId === pregnancy.id) })), chronicAssessments: assessments.filter(assessment => assessment.patientId === row.patient.id).slice(0, 1), screenings: screenings.filter(screening => screening.patientId === row.patient.id), records: records.filter(record => record.patientId === row.patient.id).slice(0, 1) }));
  return <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"><h1 className="font-semibold">Linhas de cuidado e busca ativa</h1><form className="flex flex-wrap gap-2"><label className="grid gap-1 text-sm">Acompanhamento<select name="kind" defaultValue={kind} className="rounded border p-2">{Object.entries(kinds).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label className="grid gap-1 text-sm">Paciente<input name="q" defaultValue={q} className="rounded border p-2" /></label><button className="self-end rounded border p-2 text-sm">Pesquisar</button></form>
    <p className="text-sm">{patients.length} paciente(s) na consulta{patients.length === 200 ? " · refine os filtros para consultar os demais" : ""}</p>
    {patients.map(patient => {
      const pregnancy = patient.pregnancies[0], chronic = patient.chronicAssessments[0];
      return <article key={patient.id} className="space-y-2 rounded border bg-white p-3 text-sm"><header className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{patient.person.fullName} · {patient.referenceUnit?.name || "Sem unidade de referência"}</h2><div className="flex gap-3"><Link href={`/saude/pacientes/${encodeURIComponent(patient.id)}`} className="underline">Cadastro e contato telefônico</Link>{patient.records[0] && <Link href={`/saude/atendimentos/${encodeURIComponent(patient.records[0].id)}/linhas-cuidado`} className="underline">Histórico e acompanhamento</Link>}</div></header>
        <p>Telefone: {patient.person.phonePrimary || patient.person.phoneSecondary || "Não informado"} · horário preferencial: {patient.registrationProfile?.contactStartTime || "Não informado"}{patient.registrationProfile?.contactEndTime ? ` às ${patient.registrationProfile.contactEndTime}` : ""}</p>
        {patient.person.addresses.map(address => <p key={address.id}>{address.streetName}, {address.number || "s/n"} · {address.neighborhood?.name} · {address.neighborhood?.city}/{address.neighborhood?.state}</p>)}
        {kind === "PREGNANCY" && pregnancy && <><p>{pregnancy.status === "ACTIVE" ? "Gestação ativa" : pregnancy.status === "DELIVERED" ? "Puerpério após parto" : pregnancy.status === "MISCARRIAGE" ? "Abortamento registrado" : "Encerramento administrativo"} · DPP {pregnancy.estimatedDeliveryDate.toLocaleDateString("pt-BR")} · última consulta pré-natal: {pregnancy.visits[0]?.occurredAt.toLocaleDateString("pt-BR") || "Nenhuma registrada"}</p>{pregnancy.status === "ACTIVE" && pregnancy.estimatedDeliveryDate < new Date() && <p className="font-semibold text-amber-800">DPP ultrapassada: conferir a situação gestacional.</p>}{pregnancy.postpartumVisits.map(visit => <p key={visit.id}>Consulta puerperal {visit.occurredAt.toLocaleDateString("pt-BR")} · {visit.clinicalConditions}</p>)}</>}
        {(kind === "HYPERTENSION" || kind === "DIABETES") && chronic && <p>Último acompanhamento: {chronic.assessedAt.toLocaleDateString("pt-BR")} · PA {chronic.systolic ?? "—"}/{chronic.diastolic ?? "—"} mmHg · glicemia {chronic.glucose ?? "—"} mg/dL · HbA1c {chronic.hba1c ?? "—"}% · {chronic.notes}</p>}
        {(kind === "CYTOLOGY" || kind === "MAMMOGRAPHY") && patient.screenings.map(screening => <p key={screening.id}>{screening.requestedAt.toLocaleDateString("pt-BR")} · {!screening.eligible ? "Não elegível" : screening.resultedAt ? "Resultado recebido" : screening.performedAt ? "Aguardando resultado" : "Aguardando realização"} · {screening.result || screening.eligibilityReason} · {screening.followupNotes}</p>)}
      </article>;
    })}
  </div>;
}
