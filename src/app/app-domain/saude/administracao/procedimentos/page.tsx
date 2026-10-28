import { and, asc, count, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthSusProcedures, healthSusImportBatches } from "@/db/schema/health-catalogs";
import Link from "next/link";
import { ListFilter } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ProcedureCatalog, type ProcedureRow } from "./ProcedureCatalog";

const PAGE_SIZE = 20;
type SearchParams = { q?: string | string[]; page?: string | string[]; source?: string | string[]; competence?: string | string[]; status?: string | string[]; group?: string | string[]; subgroup?: string | string[] };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pageNumber(value: string | undefined) { return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1; }
function href(page: number, values: Record<string, string>) {
  const params = new URLSearchParams(Object.entries({ ...values, page: String(page) }).filter(([, value]) => value));
  return `/saude/administracao/procedimentos?${params}`;
}

export default async function HealthProceduresPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getTenantContextForModule("SAUDE"), database = context.database ?? db;
  const params = await searchParams;
  const query = (first(params.q) || "").trim().slice(0, 120);
  const source = ["SIA", "SIGTAP"].includes(first(params.source) || "") ? first(params.source)! : "";
  const competence = /^\d{4}-(0[1-9]|1[0-2])$/.test(first(params.competence) || "") ? first(params.competence)! : "";
  const status = ["ativo", "inativo"].includes(first(params.status) || "") ? first(params.status)! : "";
  const group = (first(params.group) || "").trim().slice(0, 40), subgroup = (first(params.subgroup) || "").trim().slice(0, 40);
  const where = and(eq(healthSusProcedures.isCurrent, true), query ? or(sql`strpos(lower(${healthSusProcedures.code}), lower(${query})) > 0`, sql`strpos(lower(${healthSusProcedures.description}), lower(${query})) > 0`) : undefined, source ? eq(healthSusProcedures.source, source) : undefined, competence ? eq(healthSusProcedures.competence, competence) : undefined, status ? eq(healthSusProcedures.isActive, status === "ativo") : undefined, group ? eq(healthSusProcedures.groupCode, group) : undefined, subgroup ? eq(healthSusProcedures.subgroupCode, subgroup) : undefined);
  const [{ total }] = await database.select({ total: count() }).from(healthSusProcedures).where(where);
  const requestedPage = pageNumber(first(params.page));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const [procedureRows, competences, groups, subgroups] = await Promise.all([
    database.select({ procedure: healthSusProcedures, sourceBatch: { origin: healthSusImportBatches.origin, fileName: healthSusImportBatches.fileName } }).from(healthSusProcedures).innerJoin(healthSusImportBatches, eq(healthSusImportBatches.id, healthSusProcedures.sourceBatchId)).where(where).orderBy(asc(healthSusProcedures.code), desc(healthSusProcedures.competence), asc(healthSusProcedures.id)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    database.selectDistinct({ competence: healthSusProcedures.competence }).from(healthSusProcedures).orderBy(desc(healthSusProcedures.competence)),
    database.selectDistinctOn([healthSusProcedures.groupCode], { groupCode: healthSusProcedures.groupCode, groupName: healthSusProcedures.groupName }).from(healthSusProcedures).where(and(eq(healthSusProcedures.isCurrent, true), isNotNull(healthSusProcedures.groupCode), source ? eq(healthSusProcedures.source, source) : undefined, competence ? eq(healthSusProcedures.competence, competence) : undefined)).orderBy(asc(healthSusProcedures.groupCode)),
    database.selectDistinctOn([healthSusProcedures.subgroupCode], { subgroupCode: healthSusProcedures.subgroupCode, subgroupName: healthSusProcedures.subgroupName }).from(healthSusProcedures).where(and(eq(healthSusProcedures.isCurrent, true), isNotNull(healthSusProcedures.subgroupCode), group ? eq(healthSusProcedures.groupCode, group) : undefined, source ? eq(healthSusProcedures.source, source) : undefined, competence ? eq(healthSusProcedures.competence, competence) : undefined)).orderBy(asc(healthSusProcedures.subgroupCode)),
  ]);
  const procedures = procedureRows.map(row => ({ ...row.procedure, sourceBatch: row.sourceBatch }));
  const versionRecords = procedures.length ? await database.select({ id: healthSusProcedures.id, source: healthSusProcedures.source, code: healthSusProcedures.code, competence: healthSusProcedures.competence, isCurrent: healthSusProcedures.isCurrent, createdAt: healthSusProcedures.createdAt, sourceBatch: { origin: healthSusImportBatches.origin, fileName: healthSusImportBatches.fileName } }).from(healthSusProcedures).innerJoin(healthSusImportBatches, eq(healthSusImportBatches.id, healthSusProcedures.sourceBatchId)).where(or(...procedures.map(item => and(eq(healthSusProcedures.source, item.source), eq(healthSusProcedures.code, item.code))))).orderBy(desc(healthSusProcedures.createdAt), desc(healthSusProcedures.id)) : [];
  const rows: ProcedureRow[] = procedures.map(item => ({
    id: item.id, source: item.source, competence: item.competence, code: item.code, description: item.description,
    group: [item.groupCode, item.groupName].filter(Boolean).join(" · "), subgroup: [item.subgroupCode, item.subgroupName].filter(Boolean).join(" · "),
    complexity: item.complexity || "", registrationInstrument: item.registrationInstrument || "", unitValue: item.unitValue?.toString() || null,
    minimumAge: item.minimumAge, maximumAge: item.maximumAge, allowedSex: item.allowedSex || "", financing: item.financing || "",
    cidCodes: item.cidCodes || "", cboCodes: item.cboCodes || "", serviceCodes: item.serviceCodes || "", classificationCodes: item.classificationCodes || "",
    isActive: item.isActive, origin: item.sourceBatch.origin, fileName: item.sourceBatch.fileName,
    versions: versionRecords.filter(version => version.source === item.source && version.code === item.code).map(version => ({ id: version.id, competence: version.competence, isCurrent: version.isCurrent, createdAt: version.createdAt.toISOString(), origin: version.sourceBatch.origin, fileName: version.sourceBatch.fileName })),
  }));
  const values = { q: query, source, competence, status, group, subgroup };
  return <PageFrame className="flex h-full min-h-0 max-w-none flex-1 flex-col gap-2 overflow-hidden">
    <PageHeader title="Procedimentos Ambulatoriais" icon={<ListFilter className="size-4 shrink-0 text-emerald-700" />} className="mb-0 shrink-0" action={<div className="flex gap-1"><Link href="/saude/administracao/importacoes" className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cargas SUS</Link><Link href="/saude/administracao" className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Administração</Link></div>} />
    <form method="get" className="grid shrink-0 gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <input name="q" defaultValue={query} placeholder="Código ou descrição" className="h-8 rounded border border-slate-300 px-2.5 text-xs" />
      <select name="source" defaultValue={source} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas as origens</option><option value="SIA">SIA/SUS</option><option value="SIGTAP">SIGTAP</option></select>
      <select name="competence" defaultValue={competence} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas as competências</option>{competences.map(item => <option key={item.competence} value={item.competence}>{item.competence}</option>)}</select>
      <select name="status" defaultValue={status} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas as situações</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option></select>
      <select name="group" aria-label="Grupo de procedimentos" defaultValue={group} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todos os grupos</option>{groups.map(item => <option key={item.groupCode} value={item.groupCode || ""}>{item.groupCode} · {item.groupName}</option>)}</select>
      <select name="subgroup" aria-label="Subgrupo de procedimentos" defaultValue={subgroup} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todos os subgrupos</option>{subgroups.map(item => <option key={item.subgroupCode} value={item.subgroupCode || ""}>{item.subgroupCode} · {item.subgroupName}</option>)}</select>
      <button type="submit" className="h-8 rounded bg-slate-800 px-4 text-xs font-bold text-white hover:bg-slate-900">Consultar</button>
    </form>
    <ProcedureCatalog rows={rows} />
    <div className="shrink-0 px-1"><ErpPagination page={page} total={total} pageSize={PAGE_SIZE} previousHref={href(Math.max(1, page - 1), values)} nextHref={href(page + 1, values)} label="procedimentos" jumpTo={{ pathname: "/saude/administracao/procedimentos", values }} /></div>
  </PageFrame>;
}
