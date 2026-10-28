import Link from "next/link";
import Image from "next/image";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getPatientRegistrationPolicy, scopedPatient } from "@/lib/saude/patient-registration-service";
import { registrationValidity } from "@/lib/saude/patient-registration-policy";
import { PatientRegistrationForms } from "./PatientRegistrationForms";
import { db } from "@/db/client";
import { and, desc, eq, inArray } from "drizzle-orm";
import { healthPatientCalls, healthPatientContacts, healthPatientDocuments, healthPatientRegistrationChanges } from "@/db/schema/health-registration";
import { healthTeams, healthUnits } from "@/db/schema/health-workforce";
import { documents as gedDocuments } from "@/db/schema/registry";

export default async function PatientRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id), context = await getTenantContextForModule("SAUDE");
  const database = context.database ?? db;
  const patient = await scopedPatient(database, context, id), policy = await getPatientRegistrationPolicy(database, patient.referenceUnitId);
  const profile = patient.registrationProfile, validity = registrationValidity(policy, profile?.stage || "COMPLETE", profile?.reviewedAt || patient.createdAt);
  const scope = context.user.hasHealthAccessScope ? inArray(healthUnits.id, context.user.allowedHealthUnitIds || []) : undefined;
  const [contacts, documents, changes, units, teams] = await Promise.all([
    database.select().from(healthPatientContacts).where(eq(healthPatientContacts.patientId, id)).orderBy(desc(healthPatientContacts.createdAt)),
    database.select({ id: healthPatientDocuments.id, kind: healthPatientDocuments.kind, document: { id: gedDocuments.id, title: gedDocuments.title } }).from(healthPatientDocuments).innerJoin(gedDocuments, eq(gedDocuments.id, healthPatientDocuments.documentId)).where(eq(healthPatientDocuments.patientId, id)).orderBy(desc(healthPatientDocuments.createdAt)),
    database.select().from(healthPatientRegistrationChanges).where(eq(healthPatientRegistrationChanges.patientId, id)).orderBy(desc(healthPatientRegistrationChanges.createdAt)),
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(scope, eq(healthUnits.isActive, true))),
    database.select({ id: healthTeams.id, name: healthTeams.name, unitId: healthTeams.unitId }).from(healthTeams).where(eq(healthTeams.isActive, true)),
  ]);
  const p = patient.person;
  const phoneCalls = await database.select().from(healthPatientCalls).where(eq(healthPatientCalls.patientId, id)).orderBy(desc(healthPatientCalls.calledAt));
  const values = { personId: patient.personId, cns: patient.cns || "", bloodType: patient.bloodType || "", bloodDonor: Boolean(patient.bloodDonor), referenceUnitId: patient.referenceUnitId || "", teamId: patient.teamId || "", stage: profile?.stage || "COMPLETE", fullName: p.fullName, cpf: p.cpf || "", birthDate: p.birthDate?.toISOString().slice(0, 10) || "", gender: p.gender || "", raceColor: p.raceColor || "", motherName: p.motherName || "", fatherName: p.fatherName || "", motherUnknown: p.motherUnknown, fatherUnknown: p.fatherUnknown, phonePrimary: p.phonePrimary || "", whatsapp: p.whatsapp || "", email: p.email || "", profession: p.profession || "", workplace: profile?.workplace || "", socialMotherName: profile?.socialMotherName || "", socialFatherName: profile?.socialFatherName || "", contactStartTime: profile?.contactStartTime || "", contactEndTime: profile?.contactEndTime || "" };
  const documentPath = (documentId: string) => `/api/saude/pacientes/${encodeURIComponent(id)}/anexo/${encodeURIComponent(documentId)}`;
  return <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
    <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="font-semibold">Cadastro do paciente · {p.fullName}</h1><Link href="/saude/pacientes" className="text-sm underline">Pacientes</Link></header>
    {profile?.photoDocumentId && <Image src={documentPath(profile.photoDocumentId)} width={128} height={160} unoptimized alt={`Foto de ${p.fullName}`} className="rounded border object-contain" />}
    <p className="text-sm">{patient.status} · {values.stage === "PRE" ? "Pré-cadastro" : "Cadastro completo"} · {validity.expired ? "Atualização exigida" : "Dentro da validade configurada"}{validity.expiresAt ? ` · vencimento ${validity.expiresAt.toLocaleDateString("pt-BR")}` : ""}</p>
    <div className="flex gap-3 text-sm"><Link href={`/api/saude/pacientes/${encodeURIComponent(id)}/documento?kind=REGISTRATION`} className="underline">Imprimir ficha cadastral</Link><Link href={`/api/saude/pacientes/${encodeURIComponent(id)}/documento?kind=CARD`} className="underline">Emitir cartão de saúde</Link></div>
    <PatientRegistrationForms patientId={id} unitId={patient.referenceUnitId} values={values} policy={policy} units={units} teams={teams} />
    <section className="rounded border bg-white p-3"><h2 className="font-semibold">Contatos telefônicos realizados</h2>{phoneCalls.map(call => <p key={call.id}>{call.calledAt.toLocaleString("pt-BR")} · {call.phone} · {call.result} · {call.notes || ""} · usuário {call.actorUsuarioId}</p>)}</section>
    <section className="rounded border bg-white p-3"><h2 className="font-semibold">Endereços e histórico</h2>{p.addresses.map(address => <p key={address.id}>{address.addressType} · {address.street?.type || ""} {address.streetName} · {address.number} · {address.neighborhood?.name} · {address.neighborhood?.city}/{address.neighborhood?.state} · CEP {address.zipCode} · registrado em {address.createdAt.toLocaleDateString("pt-BR")}</p>)}</section>
    <section className="rounded border bg-white p-3"><h2 className="font-semibold">Contatos e relações</h2>{contacts.map(contact => <p key={contact.id}>{contact.name} · {contact.phone} · {contact.kinship} · {contact.relationshipKind === "SOCIOAFFECTIVE" ? "Socioafetivo" : "Familiar"} · {contact.startTime || ""}–{contact.endTime || ""}</p>)}</section>
    <section className="rounded border bg-white p-3"><h2 className="font-semibold">Pasta documental</h2>{documents.map(document => <p key={document.id}><Link href={documentPath(document.document.id)} className="underline">{document.document.title}</Link> · {document.kind}</p>)}</section>
    <section className="rounded border bg-white p-3"><h2 className="font-semibold">Histórico de alterações cadastrais</h2>{changes.map(change => <details key={change.id} className="border-b py-2 text-sm"><summary>{change.createdAt.toLocaleString("pt-BR")} · usuário {change.actorUsuarioId}</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(change.changes, null, 2)}</pre></details>)}</section>
  </div>;
}
