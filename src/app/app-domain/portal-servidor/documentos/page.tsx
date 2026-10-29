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
type SearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] };
function firstValue(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || "" : value || ""; }
const statuses: Record<string, string> = { PENDING: "Pendente", SIGNED: "Assinado", REJECTED: "Recusado", CANCELLED: "Cancelado" };

export default async function DocumentosPortalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Documentos indisponíveis. Seu acesso ainda não está vinculado a um cadastro funcional ativo.</p>;
  const params = await searchParams;
  const q = firstValue(params.q).trim().slice(0, 120);
  const rawStatus = firstValue(params.status).toUpperCase();
  const status = Object.hasOwn(statuses, rawStatus) ? rawStatus : "";
  const { context, employee } = access;
  const executor = context.database ?? db;
  const where = sql`s."signerEmployeeId"=${employee.id} ${status ? sql`AND s.status=${status}` : sql``} ${q ? sql`AND (strpos(lower(d.title),lower(${q}))>0 OR strpos(lower(d."documentType"),lower(${q}))>0)` : sql``}`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "DocumentSignature" s JOIN "Document" d ON d.id=s."documentId" WHERE ${where}`);
  const requested = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE))) : 1;
  const signatureRows = await portalRows<{ id: string; status: string; requestedAt: Date; signedAt: Date | null; rejectedAt: Date | null; title: string; documentType: string; documentStatus: string }>(executor, sql`SELECT s.id,s.status,s."requestedAt",s."signedAt",s."rejectedAt",d.title,d."documentType",d.status AS "documentStatus" FROM "DocumentSignature" s JOIN "Document" d ON d.id=s."documentId" WHERE ${where} ORDER BY s."requestedAt" DESC,s.id DESC LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  return <PortalOperationalList id="documentos" label="Documentos e assinaturas" page={page} total={total} values={{ q, status }} actions={<Link href="/portal-servidor/ficha-funcional">Minha ficha</Link>} toolbar={<form className={styles.searchForm} role="search"><input aria-label="Buscar documento" name="q" defaultValue={q} placeholder="Documento ou tipo" className={styles.searchInput} /><select name="status" defaultValue={status} aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className={styles.filterButton}>Aplicar</button><Link href="/portal-servidor/documentos">Limpar</Link></form>} columns={[portalColumn("title", "Documento", 340, 140), portalColumn("type", "Tipo", 220, 110), portalColumn("status", "Situação", 140, 90, "status"), portalColumn("date", "Solicitado em", 140, 105)]} rows={signatureRows.map(row => ({ id: row.id, label: row.title, values: { title: row.title, type: row.documentType || "Documento", status: statuses[row.status] || row.status, date: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(row.requestedAt) } }))} />;
}
