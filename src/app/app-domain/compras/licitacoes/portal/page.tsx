import Link from "next/link";
import { FileText, LogIn } from "lucide-react";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { biddingStatusLabel } from "@/lib/compras/bidding-workflow";
import { databaseConnection } from "@/db/client";
import { listSupplierBiddingParticipations } from "@/db/repositories/procurement/bidding";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { ComprasRouteFilters } from "../../_components/ComprasRouteFilters";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { comprasColumn } from "../../_components/columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
type SearchValues = { q?: string | string[]; status?: string | string[]; page?: string | string[] };
function valueOf(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function supplierName(supplier: { company: { corporateName: string; tradeName: string | null } | null; person: { fullName: string } | null }) {
  return supplier.company?.tradeName || supplier.company?.corporateName || supplier.person?.fullName || "Fornecedor";
}
function PortalUnavailable() {
  return <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-xl items-center px-4 py-8"><section className="w-full rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm"><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-800"><LogIn className="size-5" /></div><h1 className="mt-4 text-lg font-semibold text-slate-900">Portal do fornecedor</h1><p className="mt-2 text-sm leading-6 text-slate-600">Entre com uma conta vinculada a um fornecedor participante para visualizar suas licitações.</p><Link href="/login" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Entrar</Link></section></main>;
}
async function loadPortalData(searchValues: SearchValues) {
  try {
    const context = await getCurrentTenantContext();
    const query = valueOf(searchValues.q).trim().toLocaleLowerCase("pt-BR");
    const statusFilter = valueOf(searchValues.status).trim();
    const requestedPage = Number(valueOf(searchValues.page));
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const participations = await listSupplierBiddingParticipations(databaseConnection.db, context.user.id);
    const statuses = [...new Set(participations.map((participant) => participant.bidding.status))].sort((left, right) => left.localeCompare(right, "pt-BR"));
    const filtered = participations.filter((participant) => (!statusFilter || participant.bidding.status === statusFilter) && (!query || [participant.bidding.number, participant.bidding.process.number, participant.bidding.process.object, supplierName(participant.supplier), participant.displayCode || ""].join(" ").toLocaleLowerCase("pt-BR").includes(query)));
    const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
    return { query, statusFilter, statuses, filtered, items: filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE), activePage };
  } catch { return null; }
}
const columns = [
  comprasColumn("number", "Licitação", 100, 140, "identifier"), comprasColumn("process", "Processo", 100, 130),
  comprasColumn("supplier", "Fornecedor", 140, 200), comprasColumn("code", "Credenciamento", 110, 150),
  comprasColumn("object", "Objeto", 160, 280), comprasColumn("lots", "Lotes", 55, 65, "text", "right"),
  comprasColumn("deadline", "Prazo", 140, 170), comprasColumn("status", "Situação", 110, 140, "status"), comprasColumn("actions", "Acesso", 72, 90, "actions"),
];

export default async function SupplierBiddingPortalListPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const portal = await loadPortalData(await searchParams);
  if (!portal) return <PortalUnavailable />;
  return <OperationalListFrame label="Portal do fornecedor" actions={<Link href="/login" className={styles.filterButton}>Trocar conta</Link>}
    toolbar={<ComprasRouteFilters key={`${portal.query}:${portal.statusFilter}`} pathname="/compras/licitacoes/portal" query={portal.query} placeholder="Licitação, processo ou fornecedor" filters={[{ name: "status", label: "Situação", value: portal.statusFilter, options: portal.statuses.map((status) => ({ value: status, label: biddingStatusLabel(status) })) }]} />}
    pagination={<OperationalLinkPagination page={portal.activePage} total={portal.filtered.length} pathname="/compras/licitacoes/portal" values={{ q: portal.query, status: portal.statusFilter }} />}>
    <OperationalTable preferenceId="compras-portal-fornecedor" columns={columns} caption="Participações do fornecedor autenticado"
      rows={portal.items.map((participant) => ({ id: participant.id, label: participant.bidding.number, values: { number: participant.bidding.number, process: participant.bidding.process.number, supplier: supplierName(participant.supplier), code: participant.displayCode || "Participante credenciado", object: participant.bidding.process.object, lots: String(participant.bidding._count.biddingLots), deadline: participant.bidding.sessionDate ? dateTime.format(participant.bidding.sessionDate) : "Não definido", status: biddingStatusLabel(participant.bidding.status) }, actions: <Link href={`/compras/licitacoes/portal/${participant.id}`} className={styles.iconButton} aria-label={`Acessar ${participant.bidding.number}`} title="Acessar"><FileText /></Link> }))} />
  </OperationalListFrame>;
}
