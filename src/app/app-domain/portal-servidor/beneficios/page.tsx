import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
type SearchParams = { q?: string | string[]; page?: string | string[] };
function firstValue(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }

export default async function BeneficiosPortalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Benefícios indisponíveis. Seu acesso ainda não está vinculado a um cadastro funcional ativo.</p>;
  const params = await searchParams;
  const q = firstValue(params.q).trim().slice(0, 120);
  const { context, employee } = access;
  const executor = context.database ?? db;
  const where = sql`b."employeeId"=${employee.id} AND b.status='Ativo' AND c."isActive" ${q ? sql`AND (strpos(lower(c.name),lower(${q}))>0 OR strpos(lower(c.type),lower(${q}))>0)` : sql``}`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "PayrollBenefit" b JOIN "BenefitConfig" c ON c.id=b."benefitConfigId" WHERE ${where}`);
  const requested = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE))) : 1;
  const benefitRows = await portalRows<{ id: string; customValue: number | null; createdAt: Date; name: string; type: string; baseValue: number }>(executor, sql`SELECT b.id,b."customValue",b."createdAt",c.name,c.type,c."baseValue" FROM "PayrollBenefit" b JOIN "BenefitConfig" c ON c.id=b."benefitConfigId" WHERE ${where} ORDER BY c.name,b.id LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return <PortalOperationalList id="beneficios" label="Meus benefícios" page={page} total={total} values={{ q }} actions={<Link href="/portal-servidor/ficha-funcional">Minha ficha</Link>} toolbar={<form className={styles.searchForm} role="search"><input aria-label="Buscar benefício ou tipo" name="q" defaultValue={q} placeholder="Benefício ou tipo" className={styles.searchInput} /><button className={styles.filterButton}>Aplicar</button><Link href="/portal-servidor/beneficios">Limpar</Link></form>} columns={[portalColumn("name", "Benefício", 320, 130), portalColumn("type", "Tipo", 220, 110), portalColumn("value", "Valor vigente", 150, 110, "text", "right"), portalColumn("date", "Concedido em", 140, 105)]} rows={benefitRows.map(row => ({ id: row.id, label: row.name, values: { name: row.name, type: row.type, value: currency.format(row.customValue ?? row.baseValue), date: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(row.createdAt) } }))} />;
}
