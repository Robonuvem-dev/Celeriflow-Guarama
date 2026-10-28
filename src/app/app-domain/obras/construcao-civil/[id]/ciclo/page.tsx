import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { findPageLifecycle, listPageLifecycleRequests, loadPageLifecycleHistory } from "@/db/repositories/works-pages/lifecycle";
import { listPageProcessDocuments } from "@/db/repositories/works-pages/cases";
import { latestPageDefinition, listPageCatalogNames } from "@/db/repositories/works-pages/settings";
import { listPageSubjects } from "@/db/repositories/works-pages/shared";
import { z } from "zod";
import { getConstructionPropertyDebts } from "@/lib/obras/construction-taxation";
import ConstructionLifecycleClient from "./ConstructionLifecycleClient";
import { ConstructionLifecycleFilters, ConstructionLifecyclePagination } from "@/components/construction/ConstructionLifecycleListControls";
import { lifecycleFilter, lifecycleSearch, type LifecycleListQuery } from "@/lib/obras/construction-lifecycle-list";
import { getConstructionInspectionCorrections } from "@/lib/obras/construction-lifecycle-deadlines";

export default async function ConstructionLifecyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<LifecycleListQuery> }) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const database = context.database ?? db;
  const record = await findPageLifecycle(database, access, id);
  if (!record) notFound();
  const inspectionSearch = lifecycleSearch(query.inspectionQ);
  const completionSearch = lifecycleSearch(query.completionQ);
  const inspectionStatus = lifecycleFilter(query.inspectionStatus, ["REQUESTED", "APPROVED", "FAILED"]);
  const completionKind = lifecycleFilter(query.completionKind, ["PARTIAL", "TOTAL"]);
  const planTypes = record.inspectionPlan ? z.array(z.object({ id: z.string(), name: z.string() })).parse(record.inspectionPlan.inspectionTypes) : undefined;
  const inspectionTypeId = lifecycleFilter(query.inspectionType, (planTypes || []).map((type) => type.id));
  const { inspectionTotal, completionTotal, totalCompletion, inspectionPage, completionPage, inspections, completions } = await loadPageLifecycleHistory(database, id, {
    inspection: { q: inspectionSearch, status: inspectionStatus, inspectionTypeId }, completion: { q: completionSearch, kind: completionKind }, inspectionPage: query.inspectionPage, completionPage: query.completionPage,
  });
  const [types, definitions, docs, subjects, debts, serviceRequests, corrections] = await Promise.all([
    listPageCatalogNames(database, "INSPECTION_TYPE", false),
    latestPageDefinition(database, "COMPLETION").then(row => row ? [row] : []),
    listPageProcessDocuments(database, record.processId),
    listPageSubjects(database, undefined, false).then(rows => rows.map(({ id, name, processTypeId }) => ({ id, name, processTypeId }))),
    record.configuration.checkPropertyDebts ? database.transaction((tx) => getConstructionPropertyDebts(tx, id)) : Promise.resolve({ checked: false }),
    listPageLifecycleRequests(database, id),
    database.transaction((tx) => getConstructionInspectionCorrections(tx, id)),
  ]);
  return <main className="space-y-6 p-6"><div><Link href={`/obras/construcao-civil/${id}`} className="underline">Voltar à solicitação</Link><h1 className="text-2xl font-bold">Ciclo de execução — {record.process.protocolNumber}</h1><p>{record.category === "SUBDIVISION" ? "Parcelamento" : "Obra"} · Área aprovada: {record.totalArea.toFixed(4)} m² · {record.reviewStatus}</p><Link className="underline" href="/obras/construcao-civil/vistorias">Fila de vistorias e atualizações cadastrais</Link></div>
    <ConstructionLifecycleClient data={JSON.parse(JSON.stringify({ record: { ...record, inspections, completions }, hasTotalCompletion: Boolean(totalCompletion), types, definitions, docs, subjects, debts, serviceRequests, corrections, canRegularize: Boolean(access.employeeId) && (access.administrator || access.roles.includes("MANAGER")), nowISO: new Date().toISOString() }))}
      inspectionFilters={<ConstructionLifecycleFilters query={query} pageKey="inspectionPage" filters={[{ key: "inspectionQ", label: "Buscar observações" }, { key: "inspectionStatus", label: "Situação", options: [{ value: "REQUESTED", label: "Pendente" }, { value: "APPROVED", label: "Aprovada" }, { value: "FAILED", label: "Reprovada" }] }, { key: "inspectionType", label: "Tipo", options: (planTypes || []).map((type) => ({ value: type.id, label: type.name })) }]} />}
      inspectionPagination={<ConstructionLifecyclePagination query={query} pageKey="inspectionPage" page={inspectionPage} total={inspectionTotal} label="vistorias" />}
      completionFilters={<ConstructionLifecycleFilters query={query} pageKey="completionPage" filters={[{ key: "completionQ", label: "Buscar número / observações" }, { key: "completionKind", label: "Tipo de conclusão", options: [{ value: "PARTIAL", label: "Parcial" }, { value: "TOTAL", label: "Total" }] }]} />}
      completionPagination={<ConstructionLifecyclePagination query={query} pageKey="completionPage" page={completionPage} total={completionTotal} label="conclusões" />} />
  </main>;
}
