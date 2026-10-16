import Link from "next/link";
import Image from "next/image";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getPatientRegistrationPolicy, scopedPatient } from "@/lib/saude/patient-registration-service";
import { registrationValidity } from "@/lib/saude/patient-registration-policy";
import { PatientRegistrationForms } from "./PatientRegistrationForms";

export default async function PatientRegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id), context = await getTenantContextForModule("SAUDE");
  const patient = await scopedPatient(context.prisma, context, id), policy = await getPatientRegistrationPolicy(context.prisma, patient.referenceUnitId);
  const profile = patient.registrationProfile, validity = registrationValidity(policy, profile?.stage || "COMPLETE", profile?.reviewedAt || patient.createdAt);
  const scope = context.user.hasHealthAccessScope ? { id: { in: context.user.allowedHealthUnitIds || [] } } : {};
  const [contacts, documents, changes, units, teams] = await Promise.all([
    context.prisma.healthPatientContact.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    context.prisma.healthPatientDocument.findMany({ where: { patientId: id }, include: { document: { select: { title: true, id: true } } }, orderBy: { createdAt: "desc" } }),
    context.prisma.healthPatientRegistrationChange.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
    context.prisma.healthUnit.findMany({ where: { ...scope, isActive: true }, select: { id: true, name: true } }),
    context.prisma.healthTeam.findMany({ where: { isActive: true }, select: { id: true, name: true, unitId: true } }),
  ]);
  const p = patient.person;
  const phoneCalls = await context.prisma.healthPatientCall.findMany({ where: { patientId: id }, orderBy: { calledAt: "desc" } });
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
