import { redirect } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getPatientPortalAccess } from "@/lib/portal-paciente/access";
import { portalDispensations, portalDocuments, portalLabReports, portalReferralsRegulation } from "@/lib/saude/patient-portal-service";
import { getVaccinationCard } from "@/lib/saude/vaccination-registry-service";
import { vaccinationStatusNames } from "@/lib/saude/vaccination-document-service";

const box = "rounded border bg-white p-2";

export default async function PortalSaudePage() {
  const access = await getPatientPortalAccess();
  if (access.status !== "AVAILABLE") redirect("/app-domain/login");
  const ownContext = { ...access.context, user: { ...access.context.user, hasHealthAccessScope: false } };
  const [vaccinationCard, reports, dispensations, refreg, documents, campaigns] = await Promise.all([
    getVaccinationCard(ownContext, access.patient.id),
    portalLabReports(access.context, access.patient.id),
    portalDispensations(access.context, access.patient.id),
    portalReferralsRegulation(access.context, access.patient.id),
    portalDocuments(access.context, access.patient.id),
    access.context.prisma.healthVaccinationCampaign.findMany({ where: { startsAt: { lte: new Date() }, endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
  return (
    <PageFrame className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Minha saúde" />
      <div className="flex shrink-0 flex-wrap gap-3 text-xs"><a href="/api/portal-paciente/vacinacao/documento" className="rounded border bg-white p-2 font-semibold underline">Imprimir carteira de vacinação</a>{vaccinationCard.configured && !vaccinationCard.birthDateMissing && <a href="/api/portal-paciente/vacinacao/documento?kind=CERTIFICATE" className="rounded border bg-white p-2 font-semibold underline">Certidão de regularidade vacinal</a>}</div>
      <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto md:grid-cols-2">
        <div className={box}><h2 className="text-xs font-bold uppercase text-slate-500">Caderneta de vacinação</h2>
          <p className="my-2 text-xs">{!vaccinationCard.configured ? "Calendário vigente a cadastrar" : vaccinationCard.birthDateMissing ? "Nascimento a complementar para cálculo" : vaccinationCard.regular ? "Sem doses obrigatórias exigíveis pendentes" : "Há doses obrigatórias exigíveis pendentes"}</p>
          {vaccinationCard.rows.map(row => <p key={row.ruleId} className="border-b py-1 text-xs"><strong>{row.vaccineName}</strong> · dose {row.doseNumber} · {vaccinationStatusNames[row.status]}{row.scheduledFor ? ` · aprazamento ${row.scheduledFor.toLocaleDateString("pt-BR")}` : ""}</p>)}
          {vaccinationCard.records.map(record => <p key={record.id} className="border-b py-1 text-xs"><strong>{record.vaccine.name}</strong> · dose {record.doseNumber} · aplicação {record.date.toLocaleDateString("pt-BR")} · {record.unit.name}</p>)}
          {vaccinationCard.events.filter(event => event.kind === "RESCUE" && !event.revokedAt).map(event => <p key={event.id} className="border-b py-1 text-xs"><strong>{event.vaccine.name}</strong> · dose {event.doseNumber} · resgate histórico {event.occurredAt.toLocaleDateString("pt-BR")}</p>)}
        </div>
        {campaigns.length > 0 && <div className={box}><h2 className="text-xs font-bold uppercase text-slate-500">Campanhas de vacinação</h2>{campaigns.map(campaign => <p key={campaign.id} className="border-b py-2 text-xs"><strong>{campaign.name}</strong> · {campaign.startsAt.toLocaleDateString("pt-BR")} a {campaign.endsAt.toLocaleDateString("pt-BR")} · {campaign.publicInformation}</p>)}</div>}
        <div className={box}><h2 className="text-xs font-bold uppercase text-slate-500">Laudos liberados</h2>{reports.map(r => <p key={r.id} className="border-b py-1 text-xs"><strong>{r.document.title}</strong> · {r.releasedAt?.toLocaleDateString("pt-BR")} · <a href={r.document.fileUrl} className="text-sky-700 underline">Abrir</a></p>)}{reports.length === 0 && <p className="text-xs text-slate-400">Nenhum laudo liberado para você.</p>}</div>
        <div className={box}><h2 className="text-xs font-bold uppercase text-slate-500">Medicamentos dispensados</h2>{dispensations.map(d => <p key={d.id} className="border-b py-1 text-xs"><strong>{d.medicine.name}</strong> · {d.quantity} · {d.date.toLocaleDateString("pt-BR")} · {d.unit?.name}{d.nextWithdrawalAt ? ` · retorno ${d.nextWithdrawalAt.toLocaleDateString("pt-BR")}` : ""}</p>)}{dispensations.length === 0 && <p className="text-xs text-slate-400">Sem dispensações.</p>}</div>
        <div className={box}><h2 className="text-xs font-bold uppercase text-slate-500">Encaminhamentos e regulação</h2>{refreg.referrals.map(r => <p key={r.id} className="border-b py-1 text-xs"><strong>{r.specialty}</strong> · {r.status} · {r.date.toLocaleDateString("pt-BR")}</p>)}{refreg.regulations.map(r => <p key={r.id} className="border-b py-1 text-xs"><strong>{r.specialty?.name || r.service?.name}</strong> · {r.status}{r.guideNumber ? ` · guia ${r.guideNumber}` : ""}</p>)}{(refreg.referrals.length + refreg.regulations.length) === 0 && <p className="text-xs text-slate-400">Sem registros.</p>}</div>
        <div className={`${box} md:col-span-2`}><h2 className="text-xs font-bold uppercase text-slate-500">Documentos clínicos</h2>{documents.map(d => <p key={d.id} className="border-b py-1 text-xs"><strong>{d.document.title}</strong> · {d.kind} · <a href={d.document.fileUrl} className="text-sky-700 underline">Abrir</a></p>)}{documents.length === 0 && <p className="text-xs text-slate-400">Sem documentos.</p>}</div>
      </div>
    </PageFrame>
  );
}
