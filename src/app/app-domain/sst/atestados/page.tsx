import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCertificatesWithFunctionalFilters, type CertificateFunctionalFilters } from "@/lib/sst/functional-certificate-list";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";

const columns = [sstColumn("protocol", "Protocolo", 150, 100, "identifier"), sstColumn("employee", "Servidor", 220, 130), sstColumn("registration", "Matrícula", 110, 90, "identifier"), sstColumn("unit", "UG", 150, 100), sstColumn("startsAt", "Início", 180, 145), sstColumn("endsAt", "Fim", 180, 145), sstColumn("status", "Situação", 115, 90, "status"), sstColumn("leave", "Afastamento", 120, 100, "status"), sstColumn("actions", "Ações", 90, 80, "actions")];

export default async function SstCertificatesPage({ searchParams }: { searchParams: Promise<CertificateFunctionalFilters> }) {
  const context = await getTenantContextForModule("SST");
  const filters = await searchParams;
  const { records, total, page, regimes, locals, centers } = await listCertificatesWithFunctionalFilters(context, filters);
  const units = await listSstUnits(sstDatabase(context), context);
  return <OperationalListFrame label="Atestados ocupacionais" actions={<><Link href="/sst/configuracoes" className={styles.filterButton}>Motivos e acesso clínico</Link><SstNewLink href="/sst/atestados/novo">Registrar atestado</SstNewLink></>}
    toolbar={<><form action="/sst/atestados" method="GET" className={styles.searchForm}>{Object.entries(filters).filter(([key]) => key !== "q" && key !== "page").map(([key, value]) => <input key={key} type="hidden" name={key} value={value || ""} />)}<input name="q" aria-label="Buscar servidor" defaultValue={filters.q} placeholder="Servidor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Object.entries(filters).filter(([key, value]) => key !== "q" && key !== "page" && !!value).length}><form action="/sst/atestados" method="GET" className={styles.filterFields}><input type="hidden" name="q" value={filters.q || ""} /><label>Situação<select name="status" defaultValue={filters.status}><option value="">Todas as situações</option><option value="RECEIVED">Recebido</option><option value="APPROVED">Deferido</option><option value="REJECTED">Indeferido</option><option value="REVOKED">Revogado</option></select></label>{[{ key: "budgetUnitId", label: "UG", options: units }, { key: "employmentRegimeId", label: "Regime histórico", options: regimes }, { key: "localId", label: "Local histórico", options: locals }, { key: "costCenterId", label: "Centro de custo histórico", options: centers }].map(({ key, label, options }) => <label key={key}>{label}<select name={key} defaultValue={filters[key as keyof CertificateFunctionalFilters]}><option value="">Todos</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}<button className={styles.primaryButton}>Aplicar</button><Link href="/sst/atestados">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/atestados" values={filters} />}>
    <OperationalTable columns={columns} preferenceId="sst-atestados" caption="Atestados ocupacionais" emptyMessage="Nenhum atestado encontrado." rows={records.map(record => ({ id: record.id, label: record.employee.name, values: { protocol: record.protocolNumber, employee: record.employee.name, registration: record.employee.registration || "—", unit: record.budgetUnit.name, startsAt: record.startsAt.toLocaleString("pt-BR"), endsAt: record.endsAt.toLocaleString("pt-BR"), status: ({ RECEIVED: "Recebido", APPROVED: "Deferido", REJECTED: "Indeferido" } as Record<string, string>)[record.status] || record.status, leave: record.leaveId ? "Vinculado" : "—" }, actions: <Link href={`/sst/atestados/${record.id}`}>Detalhes</Link> }))} />
  </OperationalListFrame>;
}
