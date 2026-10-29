import Link from "next/link";
import { format } from "date-fns";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LicencaRowActions } from "./LicencaRowActions";
import { db } from "@/db/client";
import { readLeavesPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

const columns = [rhColumn("employee", "Servidor", 260, 150), rhColumn("type", "Tipo", 190, 120), rhColumn("period", "Período", 200, 155), rhColumn("status", "Status", 115, 90, "status"), rhColumn("actions", "Ações", 90, 80, "actions", "right")];

export default async function LicencasPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { q, status, page } = await searchParams;
  const { total, pagination, leaves } = await readLeavesPage(context.database ?? db, { q, status, page });
  return <OperationalListFrame label="Licenças e afastamentos" actions={<RhNewLink href="/rh/licencas/novo">Registrar licença</RhNewLink>}
    toolbar={<><form action="/rh/licencas" method="GET" className={styles.searchForm}><input type="hidden" name="status" value={status || ""} /><input name="q" aria-label="Buscar servidor" defaultValue={q} placeholder="Servidor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!status)}><form action="/rh/licencas" method="GET" className={styles.filterFields}><input type="hidden" name="q" value={q || ""} /><label>Status<select name="status" defaultValue={status}><option value="">Todos</option>{["Ativa", "Encerrada", "Cancelada"].map(value => <option key={value}>{value}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/rh/licencas">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/licencas" values={{ q, status }} />}>
    <OperationalTable preferenceId="rh-licencas" columns={columns} caption="Licenças e afastamentos" emptyMessage="Nenhuma licença registrada." rows={leaves.map(leave => ({ id: leave.id, label: leave.employee?.name || leave.id, values: { employee: leave.employee?.name || "—", type: leave.type, period: `${format(new Date(leave.startDate), "dd/MM/yy")} – ${format(new Date(leave.endDate), "dd/MM/yy")}`, status: leave.status }, actions: <LicencaRowActions leave={leave} /> }))} />
  </OperationalListFrame>;
}
