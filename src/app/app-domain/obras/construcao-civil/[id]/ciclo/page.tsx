import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { getConstructionPropertyDebts } from "@/lib/obras/construction-taxation";
import ConstructionLifecycleClient from "./ConstructionLifecycleClient";
import { ConstructionLifecycleFilters, ConstructionLifecyclePagination } from "@/components/construction/ConstructionLifecycleListControls";
import { lifecycleFilter, lifecyclePage, lifecyclePageSize, lifecycleSearch, type LifecycleListQuery } from "@/lib/obras/construction-lifecycle-list";
import { getConstructionInspectionCorrections } from "@/lib/obras/construction-lifecycle-deadlines";

export default async function ConstructionLifecyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<LifecycleListQuery> }) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const record = await context.prisma.constructionCase.findFirst({ where: { AND: [{ id }, constructionCaseWhere(access)] }, include: { configuration: true, process: true, inspectionPlan: true, lifecycleStart: true, reviews: { where: { decision: "APPROVED", reviewType: "PROJECT" }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 }, properties: { include: { realEstate: true } } } });
  if (!record) notFound();
  const inspectionSearch = lifecycleSearch(query.inspectionQ);
  const completionSearch = lifecycleSearch(query.completionQ);
  const inspectionStatus = lifecycleFilter(query.inspectionStatus, ["REQUESTED", "APPROVED", "FAILED"]);
  const completionKind = lifecycleFilter(query.completionKind, ["PARTIAL", "TOTAL"]);
  const planTypes = record.inspectionPlan?.inspectionTypes as { id: string; name: string }[] | undefined;
  const inspectionTypeId = lifecycleFilter(query.inspectionType, (planTypes || []).map((type) => type.id));
  const inspectionWhere = { caseId: id, status: inspectionStatus, inspectionTypeId, ...(inspectionSearch ? { OR: [{ requestNotes: { contains: inspectionSearch, mode: "insensitive" as const } }, { resultNotes: { contains: inspectionSearch, mode: "insensitive" as const } }] } : {}) };
  const completionWhere = { caseId: id, kind: completionKind, ...(completionSearch ? { OR: [{ number: { contains: completionSearch, mode: "insensitive" as const } }, { notes: { contains: completionSearch, mode: "insensitive" as const } }] } : {}) };
  const [inspectionTotal, completionTotal, totalCompletion] = await Promise.all([
    context.prisma.constructionInspection.count({ where: inspectionWhere }),
    context.prisma.constructionCompletion.count({ where: completionWhere }),
    context.prisma.constructionCompletion.findFirst({ where: { caseId: id, kind: "TOTAL" }, select: { id: true } }),
  ]);
  const inspectionPage = lifecyclePage(query.inspectionPage, inspectionTotal);
  const completionPage = lifecyclePage(query.completionPage, completionTotal);
  const [inspections, completions] = await Promise.all([
    context.prisma.constructionInspection.findMany({ where: inspectionWhere, orderBy: { sequence: "desc" }, skip: (inspectionPage - 1) * lifecyclePageSize, take: lifecyclePageSize }),
    context.prisma.constructionCompletion.findMany({ where: completionWhere, include: { propertyUpdate: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (completionPage - 1) * lifecyclePageSize, take: lifecyclePageSize }),
  ]);
  const [types, definitions, docs, subjects, debts, serviceRequests, corrections] = await Promise.all([
    context.prisma.constructionCatalogEntry.findMany({ where: { kind: "INSPECTION_TYPE", isActive: true }, select: { id: true, name: true } }),
    context.prisma.constructionDefinitionVersion.findMany({ where: { kind: "COMPLETION" }, orderBy: { version: "desc" }, take: 1 }),
    context.prisma.document.findMany({ where: { processDocuments: { some: { processId: record.processId } }, status: { in: ["Válido", "Assinado"] } }, select: { id: true, title: true } }),
    context.prisma.subject.findMany({ where: { isActive: true, allowsInternalOpening: true, processType: { isActive: true, allowsInternalOpening: true } }, select: { id: true, name: true, processTypeId: true } }),
    record.configuration.checkPropertyDebts ? context.prisma.$transaction((tx) => getConstructionPropertyDebts(tx, id)) : Promise.resolve({ checked: false }),
    context.prisma.constructionServiceRequest.findMany({ where: { caseId: id, status: "PENDING", kind: { in: ["START", "INSPECTION", "COMPLETION"] } }, select: { id: true, kind: true, notes: true }, orderBy: { createdAt: "asc" } }),
    context.prisma.$transaction((tx) => getConstructionInspectionCorrections(tx, id)),
  ]);
  return <main className="space-y-6 p-6"><div><Link href={`/obras/construcao-civil/${id}`} className="underline">Voltar à solicitação</Link><h1 className="text-2xl font-bold">Ciclo de execução — {record.process.protocolNumber}</h1><p>{record.category === "SUBDIVISION" ? "Parcelamento" : "Obra"} · Área aprovada: {record.totalArea.toFixed(4)} m² · {record.reviewStatus}</p><Link className="underline" href="/obras/construcao-civil/vistorias">Fila de vistorias e atualizações cadastrais</Link></div>
    <ConstructionLifecycleClient data={JSON.parse(JSON.stringify({ record: { ...record, inspections, completions }, hasTotalCompletion: Boolean(totalCompletion), types, definitions, docs, subjects, debts, serviceRequests, corrections, canRegularize: Boolean(access.employeeId) && (access.administrator || access.roles.includes("MANAGER")), nowISO: new Date().toISOString() }))}
      inspectionFilters={<ConstructionLifecycleFilters query={query} pageKey="inspectionPage" filters={[{ key: "inspectionQ", label: "Buscar observações" }, { key: "inspectionStatus", label: "Situação", options: [{ value: "REQUESTED", label: "Pendente" }, { value: "APPROVED", label: "Aprovada" }, { value: "FAILED", label: "Reprovada" }] }, { key: "inspectionType", label: "Tipo", options: (planTypes || []).map((type) => ({ value: type.id, label: type.name })) }]} />}
      inspectionPagination={<ConstructionLifecyclePagination query={query} pageKey="inspectionPage" page={inspectionPage} total={inspectionTotal} label="vistorias" />}
      completionFilters={<ConstructionLifecycleFilters query={query} pageKey="completionPage" filters={[{ key: "completionQ", label: "Buscar número / observações" }, { key: "completionKind", label: "Tipo de conclusão", options: [{ value: "PARTIAL", label: "Parcial" }, { value: "TOTAL", label: "Total" }] }]} />}
      completionPagination={<ConstructionLifecyclePagination query={query} pageKey="completionPage" page={completionPage} total={completionTotal} label="conclusões" />} />
  </main>;
}
