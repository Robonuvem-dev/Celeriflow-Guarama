import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { enforcementCaseWhere, enforcementActLabels, enforcementServiceLabels } from "@/lib/obras/construction-enforcement-policy";
import { ConstructionEnforcementOperations } from "../ConstructionEnforcementClient";
import { EnforcementHistoryFilters } from "../EnforcementHistoryFilters";

const formatDate = (date: Date) => date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
export default async function ConstructionEnforcementDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const record = await context.prisma.constructionEnforcementCase.findFirst({ where: { AND: [{ id }, enforcementCaseWhere(access)] }, include: { realEstate: true, process: { include: { currentDepartment: { select: { name: true } }, documents: { where: { documentId: { not: null } }, select: { document: { select: { id: true, title: true } } } } } } } });
  if (!record) notFound();
  const rawParams = await searchParams;
  const values = Object.fromEntries(["actQ", "actPage", "actKind", "actScience", "visitQ", "visitPage", "visitEvidence", "assignmentQ", "assignmentPage", "assignmentEmployee", "scienceQ", "sciencePage", "scienceMethod"].map((key) => [key, typeof rawParams[key] === "string" ? rawParams[key].trim().slice(0, 160) : ""]));
  const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
  const actWhere: Prisma.ConstructionEnforcementActWhereInput = { caseId: id, ...(values.actQ ? { OR: [{ number: contains(values.actQ) }, { reason: contains(values.actQ) }, { legalBasis: contains(values.actQ) }, { createdBy: contains(values.actQ) }] } : {}), ...(values.actKind in enforcementActLabels ? { kind: values.actKind } : {}), ...(values.actScience === "PENDING" ? { acknowledgements: { none: {} } } : values.actScience === "RECORDED" ? { acknowledgements: { some: {} } } : {}) };
  const visitWhere: Prisma.ConstructionEnforcementVisitWhereInput = { caseId: id, ...(values.visitQ ? { OR: [{ findings: contains(values.visitQ) }, { createdBy: contains(values.visitQ) }] } : {}), ...(values.visitEvidence === "PHOTO" ? { evidence: { some: { kind: "PHOTO" } } } : values.visitEvidence === "NONE" ? { evidence: { none: {} } } : {}) };
  const assignmentWhere: Prisma.ConstructionEnforcementAssignmentWhereInput = { caseId: id, ...(values.assignmentQ ? { OR: [{ reason: contains(values.assignmentQ) }, { createdBy: contains(values.assignmentQ) }] } : {}), ...(values.assignmentEmployee ? { employeeId: values.assignmentEmployee } : {}) };
  const scienceWhere: Prisma.ConstructionEnforcementAcknowledgementWhereInput = { act: { caseId: id }, ...(values.scienceQ ? { OR: [{ recipient: contains(values.scienceQ) }, { notes: contains(values.scienceQ) }, { act: { number: contains(values.scienceQ) } }] } : {}), ...(values.scienceMethod in enforcementServiceLabels ? { method: values.scienceMethod } : {}) };
  const [actTotal, visitTotal, assignmentTotal, scienceTotal] = await Promise.all([context.prisma.constructionEnforcementAct.count({ where: actWhere }), context.prisma.constructionEnforcementVisit.count({ where: visitWhere }), context.prisma.constructionEnforcementAssignment.count({ where: assignmentWhere }), context.prisma.constructionEnforcementAcknowledgement.count({ where: scienceWhere })]);
  const pageFor = (prefix: string, total: number) => Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(values[`${prefix}Page`] || "1", 10) || 1));
  const pages = { act: pageFor("act", actTotal), visit: pageFor("visit", visitTotal), assignment: pageFor("assignment", assignmentTotal), science: pageFor("science", scienceTotal) };
  const [acts, visits, assignments, science, actOptions, visitOptions, assignmentOptions] = await Promise.all([
    context.prisma.constructionEnforcementAct.findMany({ where: actWhere, orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip: (pages.act - 1) * 20, take: 20, include: { relatedAct: { select: { number: true } }, evidence: { include: { document: { select: { title: true } } } }, _count: { select: { acknowledgements: true } } } }),
    context.prisma.constructionEnforcementVisit.findMany({ where: visitWhere, orderBy: [{ visitedAt: "desc" }, { id: "asc" }], skip: (pages.visit - 1) * 20, take: 20, include: { evidence: { include: { document: { select: { title: true } } } } } }),
    context.prisma.constructionEnforcementAssignment.findMany({ where: assignmentWhere, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (pages.assignment - 1) * 20, take: 20 }),
    context.prisma.constructionEnforcementAcknowledgement.findMany({ where: scienceWhere, orderBy: [{ acknowledgedAt: "desc" }, { id: "asc" }], skip: (pages.science - 1) * 20, take: 20, include: { act: { select: { number: true } }, evidence: { include: { document: { select: { title: true } } } } } }),
    context.prisma.constructionEnforcementAct.findMany({ where: { caseId: id }, select: { id: true, kind: true, number: true }, orderBy: [{ issuedAt: "desc" }, { id: "asc" }] }),
    context.prisma.constructionEnforcementVisit.findMany({ where: { caseId: id }, select: { id: true, visitedAt: true, findings: true }, orderBy: [{ visitedAt: "desc" }, { id: "asc" }] }),
    context.prisma.constructionEnforcementAssignment.findMany({ where: { caseId: id }, select: { employeeId: true }, distinct: ["employeeId"] }),
  ]);
  const item = { ...record, acts, visits, assignments };
  const pageHref = (prefix: string, target: number) => { const query = new URLSearchParams(Object.entries(values).filter(([, value]) => Boolean(value))); query.set(`${prefix}Page`, String(target)); return `?${query}#history-${prefix}`; };
  const pagination = (prefix: keyof typeof pages, total: number, label: string) => <ErpPagination page={pages[prefix]} total={total} pageSize={20} previousHref={pageHref(prefix, pages[prefix] - 1)} nextHref={pageHref(prefix, pages[prefix] + 1)} label={label} />;
  const day = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const inspectors = item.process.currentDepartmentId ? await context.prisma.constructionStaffRole.findMany({ where: { departmentId: item.process.currentDepartmentId, role: "INSPECTOR", isActive: true, startsAt: { lte: day }, OR: [{ endsAt: null }, { endsAt: { gte: day } }], employee: { isActive: true, departmentId: item.process.currentDepartmentId }, department: { isActive: true } }, select: { employeeId: true, employee: { select: { name: true } } } }) : [];
  const active = !item.process.completedAt && Boolean(item.process.currentDepartmentId) && !["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(item.process.status);
  const canAssign = active && (access.administrator || access.roles.includes("MANAGER"));
  const canRecord = active && item.assignedEmployeeId === access.employeeId && inspectors.some((inspector) => inspector.employeeId === access.employeeId);
  const employees = await context.prisma.employee.findMany({ where: { id: { in: [...new Set([item.assignedEmployeeId, ...assignmentOptions.map((row) => row.employeeId), ...item.assignments.map((row) => row.previousEmployeeId), ...item.visits.map((row) => row.employeeId), ...item.acts.map((row) => row.employeeId)].filter((value): value is string => Boolean(value)))] } }, select: { id: true, name: true } });
  const employeeName = (employeeId: string | null) => employees.find((employee) => employee.id === employeeId)?.name || employeeId || "Não designado";
  const documents = [...new Map(item.process.documents.flatMap((row) => row.document ? [[row.document.id, { id: row.document.id, label: row.document.title }] as const] : [])).values()];
  return <PageFrame className="space-y-3 p-3"><PageHeader title={`Fiscalização — ${item.process.protocolNumber}`} icon={<ShieldCheck className="size-4" />} action={<Link className="text-xs text-blue-700 underline" href="/obras/construcao-civil/fiscalizacao">Voltar</Link>} />
    <section className="space-y-2 rounded border p-3 text-xs"><p className="font-medium text-amber-700">DEMONSTRATIVO — atos sem modelo legal oficial</p><p>Imóvel: {item.realEstate.municipalInsc || item.realEstate.id} — {item.realEstate.streetName}, {item.realEstate.number || "s/n"} • {item.locationType === "RURAL" ? "Rural" : "Urbana"}</p><p>{item.permitStatus === "WITHOUT_PERMIT" ? "SEM ALVARÁ" : item.permitStatus === "UNKNOWN" ? "Alvará não verificado" : "Alvará informado, sujeito à conferência"} • {item.status === "EMBARGOED" ? "EMBARGADA" : "Em fiscalização"} • Protocolo: {item.process.status}</p><p>Setor: {item.process.currentDepartment?.name || "—"} • Fiscal: {employeeName(item.assignedEmployeeId)}</p><p className="whitespace-pre-wrap">Motivo inicial: {item.reason}</p><p><Link href={`/protocolos/processos/${item.processId}`} className="text-blue-700 underline">Abrir processo central — recebimento, tramitação, GED e anexação de fotos/comprovantes</Link></p>{item.permitCaseId && <Link href={`/obras/construcao-civil/${item.permitCaseId}`} className="text-blue-700 underline">Processo de obra relacionado (vínculo não comprova alvará)</Link>}</section>
    <ConstructionEnforcementOperations caseId={item.id} revision={item.revision} canAssign={canAssign} canRecord={canRecord} inspectors={[...new Map(inspectors.map((row) => [row.employeeId, { id: row.employeeId, label: row.employee.name }])).values()]} documents={documents} visits={visitOptions.map((visit) => ({ id: visit.id, label: `${formatDate(visit.visitedAt)} — ${visit.findings.slice(0, 70)}` }))} acts={actOptions.map((act) => ({ id: act.id, kind: act.kind, label: act.number }))} />
    <section id="history-act" className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Atos — histórico imutável</h2>
      <EnforcementHistoryFilters prefix="act" label="número, motivo, fundamento ou autor" values={values} filters={[{ name: "actKind", label: "Tipo de ato", options: Object.entries(enforcementActLabels).map(([id, label]) => ({ id, label })) }, { name: "actScience", label: "Ciência", options: [{ id: "PENDING", label: "Pendente" }, { id: "RECORDED", label: "Registrada" }] }]} />
      {item.acts.map((act) => <article key={act.id} className="space-y-1 rounded border p-3 text-xs">
        <h3 className="font-medium">{enforcementActLabels[act.kind as keyof typeof enforcementActLabels]} — {act.number}</h3>
        <Link className="text-blue-700 underline" href={`/obras/construcao-civil/fiscalizacao/${item.id}/atos/${act.id}`}>Emitir espelho / imprimir PDF demonstrativo</Link>
        <p>Emissão: {formatDate(act.issuedAt)} • Fiscal: {employeeName(act.employeeId)} • Autor: {act.createdBy} • Setor: {act.departmentId}</p>
        <p>Prazo: {act.deadlineAt ? formatDate(act.deadlineAt) : "Não fixado neste ato"}{act.relatedAct ? ` • Ato relacionado: ${act.relatedAct.number}` : ""}</p>
        <p className="whitespace-pre-wrap">Motivo: {act.reason}</p><p className="whitespace-pre-wrap">Fundamento informado: {act.legalBasis}</p>
        <p>Evidências GED: {act.evidence.map((entry) => entry.document.title).join(", ") || "Nenhuma"}</p>
        <p className={act._count.acknowledgements ? "" : "text-amber-700"}>{act._count.acknowledgements ? `${act._count.acknowledgements} registro(s) de ciência — consulte o histórico de ciência abaixo.` : "Ciência ainda não registrada."}</p>
      </article>)}
      {!item.acts.length && <p className="text-xs text-slate-500">Nenhum ato encontrado para os filtros.</p>}{pagination("act", actTotal, "atos")}
    </section>
    <section id="history-science" className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Histórico de ciência / recusa</h2>
      <EnforcementHistoryFilters prefix="science" label="ato, destinatário ou observações" values={values} filters={[{ name: "scienceMethod", label: "Forma de ciência", options: Object.entries(enforcementServiceLabels).map(([id, label]) => ({ id, label })) }]} />
      {science.map((ack) => <article key={ack.id} className="space-y-1 rounded border p-3 text-xs"><p className="font-medium">{ack.act.number} • {formatDate(ack.acknowledgedAt)}</p><p>{enforcementServiceLabels[ack.method as keyof typeof enforcementServiceLabels]} • Destinatário: {ack.recipient} • Autor: {ack.createdBy}</p><p className="whitespace-pre-wrap">{ack.notes}</p><p>Comprovantes GED: {ack.evidence.map((entry) => entry.document.title).join(", ")}</p></article>)}
      {!science.length && <p className="text-xs text-slate-500">Nenhuma ciência encontrada para os filtros.</p>}{pagination("science", scienceTotal, "registros de ciência")}
    </section>
    <section id="history-visit" className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Diligências / evidências fotográficas</h2>
      <EnforcementHistoryFilters prefix="visit" label="constatações ou autor" values={values} filters={[{ name: "visitEvidence", label: "Evidências", options: [{ id: "PHOTO", label: "Com fotos" }, { id: "NONE", label: "Sem evidências" }] }]} />
      {item.visits.map((visit) => <article key={visit.id} className="rounded border p-2 text-xs"><p className="font-medium">{formatDate(visit.visitedAt)} • {employeeName(visit.employeeId)} • Autor: {visit.createdBy}</p><p className="whitespace-pre-wrap">{visit.findings}</p><p>GED: {visit.evidence.map((entry) => `${entry.kind === "PHOTO" ? "Foto" : "Documento"}: ${entry.document.title}`).join(", ") || "Sem evidências anexadas"}</p></article>)}
      {!item.visits.length && <p className="text-xs text-slate-500">Nenhuma diligência encontrada para os filtros.</p>}{pagination("visit", visitTotal, "diligências")}
    </section>
    <section id="history-assignment" className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Histórico de designações</h2>
      <EnforcementHistoryFilters prefix="assignment" label="motivo ou autor" values={values} filters={[{ name: "assignmentEmployee", label: "Fiscal designado", options: assignmentOptions.map((row) => ({ id: row.employeeId, label: employeeName(row.employeeId) })) }]} />
      {item.assignments.map((assignment) => <article key={assignment.id} className="rounded border p-2 text-xs"><p>{formatDate(assignment.createdAt)} • {employeeName(assignment.previousEmployeeId)} → {employeeName(assignment.employeeId)} • Autor: {assignment.createdBy} • Vínculo: {assignment.staffRoleId}</p><p className="whitespace-pre-wrap">{assignment.reason}</p></article>)}
      {!item.assignments.length && <p className="text-xs text-slate-500">Nenhuma designação encontrada para os filtros.</p>}{pagination("assignment", assignmentTotal, "designações")}
    </section>
  </PageFrame>;
}
