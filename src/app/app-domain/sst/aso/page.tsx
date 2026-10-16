import Link from "next/link";
import { z } from "zod";
import { getTenantContextForModule, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { sstUnitWhere } from "@/lib/sst/access";
import { asoKinds, asoResults, asoGroupSnapshot, sstCivilDate, formatSstCivilDate } from "@/lib/sst/aso-policy";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { AsoForm } from "./AsoForm";
import type { Prisma } from "@prisma/client";
import { questionnaireQuestions } from "@/lib/sst/questionnaire-policy";
import { SstForm } from "../SstForm";
import { saveSstAsoSettings, saveSstAsoVacationSource } from "./actions";

type Search = { budgetUnitId?: string; q?: string; personQ?: string; laboratoryQ?: string; expiresFrom?: string; expiresTo?: string; page?: string };

export default async function SstAsoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const units = await context.prisma.budgetUnit.findMany({ where: {
    ...sstUnitWhere(context),
    ...(isSystemAdministrator(context.user) ? {} : { sstAccessGrants: { some: { usuarioId: context.user.id, isActive: true, canReadClinical: true } } }),
  }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const unit = units.find((item) => item.id === params.budgetUnitId);
  const from = params.expiresFrom ? sstCivilDate.safeParse(params.expiresFrom) : null;
  const to = params.expiresTo ? sstCivilDate.safeParse(params.expiresTo) : null;
  const invalidDates = (from && !from.success) || (to && !to.success) || (from?.success && to?.success && from.data > to.data);
  const where: Prisma.SstAsoWhereInput = {
    budgetUnitId: { in: invalidDates ? [] : params.budgetUnitId ? unit ? [unit.id] : [] : units.map((item) => item.id) },
    ...(params.q?.trim() ? { person: { fullName: { contains: params.q.trim().slice(0, 200), mode: "insensitive" } } } : {}),
    validUntil: { ...(from?.success ? { gte: from.data } : {}), ...(to?.success ? { lte: to.data } : {}) },
  };
  const total = await context.prisma.sstAso.count({ where });
  const requestedPage = Number(params.page);
  const page = Math.min(Number.isFinite(requestedPage) ? Math.max(1, Math.trunc(requestedPage)) : 1, Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.sstAso.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ performedAt: "desc" }, { id: "asc" }], select: { id: true, kind: true, result: true, performedAt: true, validUntil: true, snapshot: true } });
  if (units.length) await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_ASO_LIST", targetId: unit?.id || "AUTHORIZED_UNITS" });
  const grant = unit && !isSystemAdministrator(context.user) ? await context.prisma.sstAccessGrant.findUnique({ where: { usuarioId_budgetUnitId: { usuarioId: context.user.id, budgetUnitId: unit.id } }, select: { canAssess: true } }) : null;
  const canCreate = !!unit && canPerformModuleOperation(context.user, "SST", "create") && (isSystemAdministrator(context.user) || !!grant?.canAssess);
  const personTerms = canCreate ? (params.personQ || "").split(";").map((term) => term.trim().slice(0, 200)).filter((term) => term.length >= 3).slice(0, 5) : [];
  const personMatches = await Promise.all(personTerms.map((term) => context.prisma.person.findMany({ where: { fullName: { contains: term, mode: "insensitive" } }, take: 20, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true } })));
  const people = [...new Map(personMatches.flat().map((person) => [person.id, person])).values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
  const laboratories = canCreate && params.laboratoryQ && params.laboratoryQ.trim().length >= 3 ? await context.prisma.company.findMany({ where: { corporateName: { contains: params.laboratoryQ.trim().slice(0, 200), mode: "insensitive" } }, take: 20, orderBy: [{ corporateName: "asc" }, { id: "asc" }], select: { id: true, corporateName: true } }) : [];
  const groups = canCreate && unit ? await context.prisma.sstProgramExposureGroup.findMany({ where: { program: { budgetUnitId: unit.id, kind: "PCMSO" } }, take: 200, orderBy: [{ program: { createdAt: "desc" } }, { id: "asc" }], include: { program: { select: { code: true, version: true } } } }) : [];
  const programs = groups.map((entry) => { const group = asoGroupSnapshot.parse(entry.groupSnapshot); return { id: entry.id, label: `${entry.program.code} v${entry.program.version} · ${group.code} · ${group.name}`, exams: z.array(z.object({ name: z.string(), occasion: z.string() })).parse(entry.exams) }; });
  const questionnaireRecords = canCreate && unit ? await context.prisma.sstQuestionnaireVersion.findMany({ where: { budgetUnitId: unit.id, discipline: "MEDICINE" }, take: 200, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }) : [];
  const questionnaires = questionnaireRecords.map((q) => ({ id: q.id, title: q.title, version: q.version, questions: questionnaireQuestions.parse(q.questions) }));
  const periods = canCreate && unit && people.length ? await context.prisma.$queryRaw<{ id: string; employeeName: string; contractReference: string; governmentEntityId: string; startsAt: Date; endsAt: Date }[]>`SELECT p.id,e.name AS "employeeName",p."contractReference",p."governmentEntityId",p."startsAt",p."endsAt" FROM "HrEmployeeFunctionalPeriod" p JOIN "Employee" e ON e.id=p."employeeId" WHERE p."budgetUnitId"=${unit.id} AND e."personId"=ANY(${people.map((p) => p.id)}::text[]) AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) ORDER BY p."startsAt" DESC,p.id LIMIT 200` : [];
  const functionalPeriods = periods.map((p) => ({ ...p, startsAt: p.startsAt.toISOString().slice(0, 10), endsAt: p.endsAt.toISOString().slice(0, 10) }));
  const [settings] = unit ? await context.prisma.$queryRaw<{ suggestedResults: string[]; vacationWarningDays: number }[]>`SELECT "suggestedResults","vacationWarningDays" FROM "SstAsoFlowSettings" WHERE "budgetUnitId"=${unit.id}` : [];
  const href = (value: number) => `/sst/aso?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", q: params.q || "", personQ: params.personQ || "", laboratoryQ: params.laboratoryQ || "", expiresFrom: params.expiresFrom || "", expiresTo: params.expiresTo || "", page: String(value) })}`;
  const field = "min-w-0 rounded border p-2";
  return <div className="space-y-4 p-4">
    <header><h1 className="text-xl font-semibold">Exames ocupacionais e ASO</h1><p className="text-sm">Consulta clínica por UG, com vencimentos e versões do PCMSO.</p></header>
    {!units.length && <p role="status" className="rounded border p-3">Não há unidade gestora com autorização clínica ocupacional para este perfil.</p>}
    <form className="grid gap-3 rounded border p-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1">Unidade gestora<select name="budgetUnitId" defaultValue={params.budgetUnitId} className={field}><option value="">Todas as UGs autorizadas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1">Nome do servidor/candidato<input name="q" defaultValue={params.q} className={field}/></label>
      <label className="grid gap-1">Vencimento inicial<input type="date" name="expiresFrom" defaultValue={params.expiresFrom} className={field}/></label>
      <label className="grid gap-1">Vencimento final<input type="date" name="expiresTo" defaultValue={params.expiresTo} className={field}/></label>
      <label className="grid gap-1">Pessoa e profissionais (até 5 nomes separados por ;)<input name="personQ" defaultValue={params.personQ} placeholder="Nome do candidato; Nome do médico" className={field}/></label>
      <label className="grid gap-1">Laboratórios para o formulário (mínimo 3 letras)<input name="laboratoryQ" defaultValue={params.laboratoryQ} className={field}/></label>
      <button className="w-fit rounded border px-4 py-2">Filtrar e carregar opções</button>
    </form>
    {invalidDates && <p role="alert">Informe um intervalo de vencimentos válido.</p>}
    {params.budgetUnitId && !unit && <p role="alert">A UG selecionada não está entre as unidades clínicas autorizadas.</p>}
    {unit && canPerformModuleOperation(context.user, "SST", "issueReports") && <Link className="underline" href={`/sst/aso/branco?budgetUnitId=${unit.id}`}>Imprimir ASO em branco da UG</Link>}
    {canCreate && unit && <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Registrar ASO e exames</summary><p className="my-3 text-sm">Carregue a pessoa e os profissionais antes de preencher. Habilitação administrativa, vínculo histórico e anamnese de Medicina serão conferidos antes da emissão.</p><AsoForm key={`${unit.id}:${params.personQ || ""}:${params.laboratoryQ || ""}`} budgetUnitId={unit.id} people={people} laboratories={laboratories} programs={programs} questionnaires={questionnaires} functionalPeriods={functionalPeriods}/></details>}
    {unit && canPerformModuleOperation(context.user, "SST", "update") && <details className="rounded border p-3"><summary>Parâmetros do acompanhamento ASO</summary><SstForm action={saveSstAsoSettings} label="Salvar parâmetros"><input type="hidden" name="budgetUnitId" value={unit.id}/>{Object.entries(asoResults).map(([value, label]) => <label key={value} className="block"><input type="checkbox" name="suggestedResults" value={value} defaultChecked={settings?.suggestedResults.includes(value)}/> Sugerir agenda: {label}</label>)}<label>Alerta de vencimento de férias (dias)<input type="number" min={0} max={365} name="vacationWarningDays" required defaultValue={settings?.vacationWarningDays ?? 0} className={field}/></label></SstForm></details>}
    {unit && canPerformModuleOperation(context.user, "RH", "update") && <details className="rounded border p-3"><summary>Registrar fonte RH do prazo concessivo de férias</summary><SstForm action={saveSstAsoVacationSource} label="Registrar prazo canônico RH"><input type="hidden" name="budgetUnitId" value={unit.id}/><input name="vacationId" required placeholder="ID das férias canônicas RH" className={field}/><input name="functionalPeriodId" required placeholder="ID do vínculo funcional" className={field}/><input type="date" name="expiresAt" required className={field}/><input name="sourceReference" required minLength={10} placeholder="Fonte RH do prazo concessivo" className={field}/></SstForm></details>}
    <p className="text-sm">{total} ASO(s) no filtro · 20 registros por página</p>
    <table className="w-full table-fixed text-left text-sm"><thead><tr><th className="p-2">Pessoa / tipo</th><th className="p-2">Realização</th><th className="p-2">Vencimento</th><th className="p-2">Conclusão</th><th className="p-2">Ficha</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-b"><td className="break-words p-2">{z.object({ personName: z.string() }).parse(record.snapshot).personName}<br/>{asoKinds[record.kind as keyof typeof asoKinds]}</td><td className="p-2">{formatSstCivilDate(record.performedAt)}</td><td className="p-2">{formatSstCivilDate(record.validUntil)}</td><td className="break-words p-2">{asoResults[record.result as keyof typeof asoResults]}</td><td className="p-2"><Link className="underline" href={`/sst/aso/${record.id}`}>Abrir</Link></td></tr>)}</tbody></table>
    {!records.length && <p className="rounded border p-3">Nenhum ASO encontrado.</p>}
    <ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/>
  </div>;
}
