import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import type { AttendanceRecord } from "@/lib/contracts/personnel";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
type SearchParams = { month?: string | string[]; page?: string | string[] };
function firstValue(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
function formatTime(value: Date | null) { return value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(value) : "—"; }
function formatHours(value: number) { return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " h"; }

export default async function PontoPortalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Espelho de ponto indisponível. Seu acesso ainda não está vinculado a um cadastro funcional ativo.</p>;
  const params = await searchParams;
  const rawMonth = firstValue(params.month);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : "";
  const { context, employee } = access;
  const executor = context.database ?? db;
  const [year, monthNumber] = month.split("-").map(Number);
  const where = sql`"employeeId"=${employee.id} ${month ? sql`AND date>=${new Date(Date.UTC(year, monthNumber - 1, 1))} AND date<${new Date(Date.UTC(year, monthNumber, 1))}` : sql``}`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "AttendanceRecord" WHERE ${where}`);
  const requested = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE))) : 1;
  const records = await portalRows<AttendanceRecord>(executor, sql`SELECT * FROM "AttendanceRecord" WHERE ${where} ORDER BY date DESC,id DESC LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  return <PortalOperationalList id="ponto" label="Meu espelho de ponto" page={page} total={total} values={{ month }} actions={<Link href="/portal-servidor/ferias">Férias e afastamentos</Link>} toolbar={<form className={styles.searchForm} role="search"><input type="month" name="month" defaultValue={month} aria-label="Competência" className={styles.searchInput} /><button className={styles.filterButton}>Aplicar</button><Link href="/portal-servidor/ponto">Limpar</Link></form>} columns={[portalColumn("date", "Data", 130, 100), portalColumn("entry", "Entrada", 100, 75), portalColumn("exit", "Saída", 100, 75), portalColumn("hours", "Horas", 120, 85, "text", "right"), portalColumn("extra", "Extras", 120, 85, "text", "right"), portalColumn("bank", "Banco de horas", 150, 110, "text", "right"), portalColumn("status", "Situação", 130, 90, "status")]} rows={records.map(record => ({ id: record.id, label: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(record.date), values: { date: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(record.date), entry: formatTime(record.entryTime), exit: formatTime(record.exitTime), hours: formatHours(record.hoursWorked), extra: formatHours(record.extraHours), bank: formatHours(record.bankHours), status: record.status } }))} />;
}
