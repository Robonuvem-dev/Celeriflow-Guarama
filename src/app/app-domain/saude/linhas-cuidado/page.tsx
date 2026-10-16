import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";

const kinds = { PREGNANCY: "Gestação e puerpério", HYPERTENSION: "Hipertensão", DIABETES: "Diabetes", CYTOLOGY: "Citopatológico", MAMMOGRAPHY: "Mamografia" };
export default async function CareLinesManager({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { q = "", kind = "PREGNANCY" } = await searchParams;
  const context = await getTenantContextForModule("SAUDE");
  const filter: Prisma.PatientWhereInput = { status: { notIn: ["Unificado", "Falecido"] } };
  if (context.user.hasHealthAccessScope) filter.referenceUnitId = { in: context.user.allowedHealthUnitIds || [] };
  if (q.trim()) filter.person = { fullName: { contains: q.trim(), mode: "insensitive" } };
  if (kind === "PREGNANCY") filter.pregnancies = { some: {} };
  else if (kind === "HYPERTENSION" || kind === "DIABETES") filter.chronicAssessments = { some: { conditionKind: kind } };
  else if (kind === "CYTOLOGY" || kind === "MAMMOGRAPHY") filter.screenings = { some: { kind } };
  const patients = await context.prisma.patient.findMany({ where: filter, orderBy: { person: { fullName: "asc" } }, take: 200, include: {
    person: { include: { addresses: { include: { neighborhood: true } } } }, registrationProfile: true, referenceUnit: true,
    pregnancies: { orderBy: { createdAt: "desc" }, include: { visits: { orderBy: { occurredAt: "desc" }, take: 1 }, postpartumVisits: true } },
    chronicAssessments: { where: kind === "HYPERTENSION" || kind === "DIABETES" ? { conditionKind: kind } : {}, orderBy: { assessedAt: "desc" }, take: 1 },
    screenings: { where: kind === "CYTOLOGY" || kind === "MAMMOGRAPHY" ? { kind } : {}, orderBy: { requestedAt: "desc" } },
    records: { where: context.user.hasHealthAccessScope ? { unitId: { in: context.user.allowedHealthUnitIds || [] } } : {}, orderBy: { date: "desc" }, take: 1, select: { id: true } },
  } });
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
