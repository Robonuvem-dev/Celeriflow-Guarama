import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { ownReleasedStatementIds } from "@/lib/portal-servidor/payroll-publication";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
type SearchParams = { competence?: string | string[]; page?: string | string[] };
function firstValue(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
function parseCompetence(value: string | string[] | undefined) {
  const raw = firstValue(value).trim();
  if (/^(0[1-9]|1[0-2])\/\d{4}$/.test(raw)) return raw;
  const isoMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  return isoMatch ? isoMatch[2] + "/" + isoMatch[1] : "";
}
function formatCurrency(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }

export default async function FolhaPortalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Demonstrativo de folha indisponível. Seu acesso ainda não está vinculado a um cadastro funcional ativo.</p>;
  if (!await arePortalPayrollStatementsEnabled(access.context.database ?? db)) return <p className="p-4">Demonstrativos temporariamente indisponíveis. A disponibilização de demonstrativos foi desativada pela configuração do RH.</p>;
  const params = await searchParams;
  const competence = parseCompetence(params.competence);
  const { context, employee } = access;
  const executor = context.database ?? db;
  const statementIds = await ownReleasedStatementIds(executor, employee.id, competence || undefined);
  const where = sql`i."employeeId"=${employee.id} ${competence ? sql`AND p.competence=${competence}` : sql``} AND EXISTS(SELECT 1 FROM "HrPayrollItemOrigin" o WHERE o."payrollItemId"=i.id AND o."statementId"=ANY(${sql.param(statementIds)}::text[]))`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "PayrollItem" i JOIN "Payroll" p ON p.id=i."payrollId" WHERE ${where}`);
  const requested = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE))) : 1;
  const itemRows = await portalRows<{ id: string; value: number; reference: string | null; createdAt: Date; competence: string; payrollType: string; payrollStatus: string; payrollCreatedAt: Date; code: string; eventName: string; eventType: string }>(executor, sql`SELECT i.id,i.value,i.reference,i."createdAt",p.competence,p.type AS "payrollType",p.status AS "payrollStatus",p."createdAt" AS "payrollCreatedAt",e.code,e.name AS "eventName",e.type AS "eventType" FROM "PayrollItem" i JOIN "Payroll" p ON p.id=i."payrollId" JOIN "PayrollEvent" e ON e.id=i."eventId" WHERE ${where} ORDER BY p."createdAt" DESC,i."createdAt" DESC,i.id DESC LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  const pageTotals = itemRows.reduce((totals, item) => { if (item.eventType === "Vencimento") totals.proventos += item.value; if (item.eventType === "Desconto") totals.descontos += item.value; return totals; }, { proventos: 0, descontos: 0 });
  return <PortalOperationalList id="folha" label="Demonstrativo de folha" page={page} total={total} values={{ competence }} actions={<Link href="/portal-servidor/demonstrativos">Demonstrativos completos</Link>} toolbar={<><form className={styles.searchForm} role="search"><input aria-label="Competência" name="competence" defaultValue={competence} inputMode="numeric" pattern="(0[1-9]|1[0-2])/[0-9]{4}" placeholder="Competência (MM/AAAA)" className={styles.searchInput} /><button className={styles.filterButton}>Aplicar</button><Link href="/portal-servidor/folha">Limpar</Link></form><OperationalFilters label="Totais da página"><p>Totais dos itens exibidos nesta página: Proventos {formatCurrency(pageTotals.proventos)} · Descontos {formatCurrency(pageTotals.descontos)}</p><p>Lançamentos próprios conciliados com demonstrativos liberados e não revogados pelo RH.</p></OperationalFilters></>} columns={[portalColumn("competence", "Competência", 130, 100), portalColumn("payrollType", "Tipo folha", 130, 90), portalColumn("payrollStatus", "Situação folha", 140, 105, "status"), portalColumn("event", "Evento", 240, 110), portalColumn("code", "Código", 90, 70, "identifier"), portalColumn("reference", "Referência", 140, 90), portalColumn("type", "Tipo", 110, 80), portalColumn("value", "Valor", 140, 100, "text", "right")]} rows={itemRows.map(item => ({ id: item.id, label: item.eventName, values: { competence: item.competence, payrollType: item.payrollType, payrollStatus: item.payrollStatus, event: item.eventName, code: item.code, reference: item.reference || "—", type: item.eventType === "Vencimento" ? "Provento" : item.eventType, value: formatCurrency(item.value) } }))} />;
}
