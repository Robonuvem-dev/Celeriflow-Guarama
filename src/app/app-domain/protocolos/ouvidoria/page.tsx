import Link from "next/link";
import { Eye } from "lucide-react";
import { and, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { ombudsmans } from "@/db/schema/attendance-portals";
import { ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { listOmbudsmanSummaries } from "@/db/repositories/attendance-portals/queries";
import { canViewOmbudsmanIdentity, getOmbudsmanContextForProtocols } from "@/lib/attendance/access";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
type QueryValue = string | string[] | undefined;
type SearchParams = { q?: QueryValue; type?: QueryValue; status?: QueryValue; page?: QueryValue };
type ListingFilters = { q: string; type: string; status: string };
function valueOf(value: QueryValue) { return (Array.isArray(value) ? value[0] : value || "").trim(); }
const columns: OperationalColumn[] = [
  ...([["protocol", "Protocolo", 160, 110], ["priority", "Prioridade", 110, 80], ["type", "Tipo", 150, 100], ["subject", "Assunto", 300, 120], ["identity", "Manifestante", 190, 110], ["status", "Situação", 170, 100], ["date", "Abertura", 110, 95]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 700, type: key === "status" ? "status" : key === "protocol" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 75, minWidth: 65, maxWidth: 90, resizable: false, sortable: false, details: "none" },
];
export default async function OuvidoriaProtocolosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getOmbudsmanContextForProtocols();
  const raw = await searchParams;
  const filters: ListingFilters = { q: valueOf(raw.q).slice(0, 120), type: valueOf(raw.type).slice(0, 80), status: valueOf(raw.status).slice(0, 80) };
  const requestedPage = Number.parseInt(valueOf(raw.page), 10);
  const conditions: (SQL | undefined)[] = [ombudsmanScopeCondition(context)];
  if (filters.type) conditions.push(eq(ombudsmans.type, filters.type));
  if (filters.status) conditions.push(eq(ombudsmans.status, filters.status));
  if (filters.q) { const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`; conditions.push(or(ilike(ombudsmans.protocolNumber, pattern), ilike(ombudsmans.subject, pattern))); }
  const where = and(...conditions);
  const [{ total }] = await db.select({ total: count() }).from(ombudsmans).where(where);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
  const manifestacoes = await listOmbudsmanSummaries(db, where, context.user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, stableOrder: true });
  const safeManifestacoes = manifestacoes.map(manifestacao => ({ ...manifestacao, person: canViewOmbudsmanIdentity(context, manifestacao.isConfidential, manifestacao.accessGrants.some(grant => grant.canViewIdentity)) ? manifestacao.person : null }));
  const canCreateOmbudsman = context.attendanceAccess.isOmbudsman && context.attendanceAccess.canCreate;
  const returnTo = `/protocolos/ouvidoria?${new URLSearchParams({ ...filters, page: String(page) })}`;
  return <OperationalListFrame label="Ouvidoria" actions={canCreateOmbudsman && <Link className={styles.newButton} href="/protocolos/ouvidoria/nova">Nova manifestação</Link>}
    toolbar={<><form action="/protocolos/ouvidoria" className={styles.searchForm}><input name="q" defaultValue={filters.q} aria-label="Protocolo ou assunto" placeholder="Protocolo ou assunto…" className={styles.searchInput} /><input type="hidden" name="type" value={filters.type} /><input type="hidden" name="status" value={filters.status} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!filters.type) + Number(!!filters.status)}><p>Identidade e narrativa confidenciais só aparecem para pessoas autorizadas.</p><form action="/protocolos/ouvidoria" className={styles.filterFields}><input type="hidden" name="q" value={filters.q} /><label>Tipo<select name="type" defaultValue={filters.type}><option value="">Todos</option><option>Denúncia</option><option>Reclamação</option><option>Sugestão</option><option>Elogio</option><option>Solicitação</option><option>Ocorrência</option></select></label><label>Situação<select name="status" defaultValue={filters.status}><option value="">Todas</option><option>Recebida</option><option>Em Triagem</option><option>Encaminhada</option><option>Em Apuração</option><option>Aguardando Resposta</option><option>Concluída</option><option>Cancelada</option></select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/protocolos/ouvidoria">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/protocolos/ouvidoria" values={filters} />}>
    <OperationalTable columns={columns} preferenceId="protocolos.ouvidoria" caption="Manifestações no recorte autorizado" emptyMessage="Nenhuma manifestação encontrada." rows={safeManifestacoes.map(item => ({ id: item.id, label: item.protocolNumber, values: { protocol: item.protocolNumber, priority: item.priority, type: item.type, subject: item.subject, identity: item.isAnonymous ? "Anônimo" : item.person?.fullName || "Identidade restrita", status: item.status, date: new Date(item.createdAt).toLocaleDateString("pt-BR") }, actions: <Link className={styles.iconButton} aria-label={`Abrir manifestação ${item.protocolNumber}`} href={`/protocolos/ouvidoria/${item.id}?returnTo=${encodeURIComponent(returnTo)}`}><Eye /></Link> }))} />
  </OperationalListFrame>;
}
