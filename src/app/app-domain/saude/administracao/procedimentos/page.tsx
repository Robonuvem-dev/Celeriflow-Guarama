import { and, asc, count, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { healthSusProcedures, healthSusImportBatches } from "@/db/schema/health-catalogs";
import Link from "next/link";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ProcedureCatalog, type ProcedureRow } from "./ProcedureCatalog";

type SearchParams = { q?: string | string[]; page?: string | string[]; source?: string | string[]; competence?: string | string[]; status?: string | string[]; group?: string | string[]; subgroup?: string | string[] };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function pageNumber(value: string | undefined) { return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1; }

export default async function HealthProceduresPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getTenantContextForModule("SAUDE"), database = context.database ?? db;
  const params = await searchParams;
  const query = (first(params.q) || "").trim().slice(0, 120);
  const source = ["SIA", "SIGTAP"].includes(first(params.source) || "") ? first(params.source)! : "";
  const competence = /^\d{4}-(0[1-9]|1[0-2])$/.test(first(params.competence) || "") ? first(params.competence)! : "";
  const status = ["ativo", "inativo"].includes(first(params.status) || "") ? first(params.status)! : "";
  const group = (first(params.group) || "").trim().slice(0, 40), subgroup = (first(params.subgroup) || "").trim().slice(0, 40);
  const where = and(eq(healthSusProcedures.isCurrent, true), query ? or(ilike(healthSusProcedures.code, `%${query}%`), ilike(healthSusProcedures.description, `%${query}%`)) : undefined, source ? eq(healthSusProcedures.source, source) : undefined, competence ? eq(healthSusProcedures.competence, competence) : undefined, status ? eq(healthSusProcedures.isActive, status === "ativo") : undefined, group ? eq(healthSusProcedures.groupCode, group) : undefined, subgroup ? eq(healthSusProcedures.subgroupCode, subgroup) : undefined);
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
  return <OperationalListFrame label="Procedimentos ambulatoriais" actions={<><Link href="/saude/administracao/importacoes">Cargas SUS</Link><Link href="/saude/administracao">Administração</Link></>} toolbar={<><form className={styles.searchForm}><input aria-label="Código ou descrição" name="q" defaultValue={query} placeholder="Código ou descrição" className={styles.searchInput} />{Object.entries({ source, competence, status, group, subgroup }).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={[source, competence, status, group, subgroup].filter(Boolean).length}>
    <form method="get" className={styles.filterFields}>
      <input type="hidden" name="q" value={query} />
      <select name="source" defaultValue={source} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas as origens</option><option value="SIA">SIA/SUS</option><option value="SIGTAP">SIGTAP</option></select>
      <select name="competence" defaultValue={competence} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas as competências</option>{competences.map(item => <option key={item.competence} value={item.competence}>{item.competence}</option>)}</select>
      <select name="status" defaultValue={status} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todas as situações</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option></select>
      <select name="group" aria-label="Grupo de procedimentos" defaultValue={group} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todos os grupos</option>{groups.map(item => <option key={item.groupCode} value={item.groupCode || ""}>{item.groupCode} · {item.groupName}</option>)}</select>
      <select name="subgroup" aria-label="Subgrupo de procedimentos" defaultValue={subgroup} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"><option value="">Todos os subgrupos</option>{subgroups.map(item => <option key={item.subgroupCode} value={item.subgroupCode || ""}>{item.subgroupCode} · {item.subgroupName}</option>)}</select>
      <button type="submit" className="h-8 rounded bg-slate-800 px-4 text-xs font-bold text-white hover:bg-slate-900">Consultar</button>
    <Link href="/saude/administracao/procedimentos">Limpar filtros</Link></form></OperationalFilters></>} pagination={<OperationalLinkPagination page={page} total={total} values={values} />}>
    <ProcedureCatalog rows={rows} />
  </OperationalListFrame>;
}
