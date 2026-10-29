import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { asc, count, desc } from "drizzle-orm";
import { transparencyAccesses, transparencyPublications } from "@/db/schema/transparency";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
const columns: OperationalColumn[] = ([["date", "Data", 210, 160], ["query", "Consulta", 220, 110], ["entity", "Entidade", 140, 90], ["year", "Exercício", 100, 85], ["source", "Fonte", 150, 100], ["ip", "IP", 180, 120]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]) => ({ key, label, initialWidth, minWidth, maxWidth: 650, type: "text", resizable: true, sortable: false, details: "overflow" }));
export default async function AccessReportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await getTenantContextForModule("TRANSPARENCIA");
  const params = await searchParams;
  const [[{ total }], publications] = await Promise.all([
    db.select({ total: count() }).from(transparencyAccesses),
    db.select({ entity: transparencyPublications.entity, year: transparencyPublications.year, status: transparencyPublications.status, _count: count() }).from(transparencyPublications).groupBy(transparencyPublications.entity, transparencyPublications.year, transparencyPublications.status),
  ]);
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE))) : 1;
  const entries = await db.select().from(transparencyAccesses).orderBy(desc(transparencyAccesses.createdAt), asc(transparencyAccesses.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
  return <OperationalListFrame label="Inventário e acessos" actions={<Link className={styles.dialogButton} href="/transparencia">Gestão</Link>} toolbar={<><span>{total} visualizações nos últimos 90 dias; não são pessoas únicas.</span><OperationalFilters label="Inventário documental"><div className={styles.filterFields}>{publications.map(row => <p key={`${row.entity}:${row.year}:${row.status}`}>{row.entity} · {row.year} · {row.status}: {row._count} documento(s)</p>)}</div><p>IPs são restritos à gestão.</p></OperationalFilters></>} pagination={<OperationalLinkPagination pathname="/transparencia/acessos" page={page} total={total} />}>
    <OperationalTable columns={columns} preferenceId="transparencia.acessos" caption="Visualizações registradas — IPs restritos à gestão" emptyMessage="Nenhuma visualização registrada." rows={entries.map(row => ({ id: row.id, label: `${row.collectionSlug} ${row.createdAt.toISOString()}`, values: { date: row.createdAt.toISOString(), query: row.collectionSlug, entity: row.entity, year: String(row.year), source: row.source, ip: row.ip || "—" } }))} />
  </OperationalListFrame>;
}
