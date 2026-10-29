import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import type { PortalLeave, PortalVacation } from "@/db/repositories/portal-servidor/reports";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
type SearchParams = { view?: string | string[]; status?: string | string[]; page?: string | string[] };
function firstValue(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
function formatDate(value: Date | null) { return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value) : "A definir"; }

export default async function FeriasPortalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Consulta indisponível. Seu acesso ainda não está vinculado a um cadastro funcional ativo.</p>;
  const params = await searchParams;
  const view = firstValue(params.view) === "afastamentos" ? "afastamentos" : "ferias";
  const statuses = view === "ferias" ? ["A vencer", "Disponível", "Programada", "Em gozo", "Concluída"] : ["Ativa", "Concluída", "Cancelada"];
  const rawStatus = firstValue(params.status);
  const status = statuses.includes(rawStatus) ? rawStatus : "";
  const { context, employee } = access;
  const executor = context.database ?? db;
  const where = sql`"employeeId"=${employee.id} ${status ? sql`AND status=${status}` : sql``}`;
  const total = view === "afastamentos" ? await portalCount(executor, sql`SELECT count(*) FROM "Leave" WHERE ${where}`) : await portalCount(executor, sql`SELECT count(*) FROM "Vacation" WHERE ${where}`);
  const requested = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE))) : 1;
  const toolbar = <><nav className="flex gap-2" aria-label="Tipo de histórico"><Link href="?view=ferias">Férias</Link><Link href="?view=afastamentos">Afastamentos</Link></nav><form className={styles.searchForm}><input type="hidden" name="view" value={view} /><select name="status" defaultValue={status} aria-label="Situação"><option value="">Todas as situações</option>{statuses.map(value => <option key={value}>{value}</option>)}</select><button className={styles.filterButton}>Aplicar</button><Link href={`?view=${view}`}>Limpar</Link></form></>;
  const actions = <Link href="/portal-servidor/ponto">Meu ponto</Link>;
  if (view === "afastamentos") {
    const records = await portalRows<PortalLeave>(executor, sql`SELECT * FROM "Leave" WHERE ${where} ORDER BY "startDate" DESC,id DESC LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
    return <PortalOperationalList id="afastamentos" label="Meus afastamentos" page={page} total={total} values={{ view, status }} toolbar={toolbar} actions={actions} columns={[portalColumn("start", "Início", 180, 100), portalColumn("end", "Término", 180, 100), portalColumn("status", "Situação", 180, 100, "status")]} rows={records.map(record => ({ id: record.id, label: formatDate(record.startDate), values: { start: formatDate(record.startDate), end: formatDate(record.endDate), status: record.status } }))} />;
  }
  const records = await portalRows<PortalVacation>(executor, sql`SELECT * FROM "Vacation" WHERE ${where} ORDER BY "acquisitionStart" DESC,id DESC LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  return <PortalOperationalList id="ferias" label="Minhas férias" page={page} total={total} values={{ view, status }} toolbar={toolbar} actions={actions} columns={[portalColumn("acquisitionStart", "Início aquisitivo", 160, 115), portalColumn("acquisitionEnd", "Fim aquisitivo", 150, 110), portalColumn("enjoymentStart", "Início gozo", 140, 100), portalColumn("enjoymentEnd", "Fim gozo", 140, 100), portalColumn("days", "Dias", 80, 60, "text", "right"), portalColumn("status", "Situação", 140, 90, "status")]} rows={records.map(record => ({ id: record.id, label: formatDate(record.acquisitionStart), values: { acquisitionStart: formatDate(record.acquisitionStart), acquisitionEnd: formatDate(record.acquisitionEnd), enjoymentStart: formatDate(record.enjoymentStart), enjoymentEnd: record.enjoymentEnd ? formatDate(record.enjoymentEnd) : "—", days: String(record.days), status: record.status } }))} />;
}
