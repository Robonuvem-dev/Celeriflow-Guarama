import Link from "next/link";
import { format } from "date-fns";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { FeriasRowActions } from "./FeriasRowActions";
import { db } from "@/db/client";
import { readVacationsPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

const columns = [rhColumn("employee", "Servidor", 240, 150), rhColumn("acquisition", "Período aquisitivo", 190, 155), rhColumn("enjoyment", "Gozo programado", 190, 155), rhColumn("days", "Dias", 65, 55, "text", "right"), rhColumn("status", "Status", 115, 90, "status"), rhColumn("actions", "Ações", 90, 80, "actions", "right")];

export default async function FeriasPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { q, status, page } = await searchParams;
  const { total, pagination, vacations } = await readVacationsPage(context.database ?? db, { q, status, page });
  return <OperationalListFrame label="Férias" actions={<RhNewLink href="/rh/ferias/novo">Programar férias</RhNewLink>}
    toolbar={<><form action="/rh/ferias" method="GET" className={styles.searchForm}><input type="hidden" name="status" value={status || ""} /><input name="q" aria-label="Buscar servidor" defaultValue={q} placeholder="Servidor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!status)}><form action="/rh/ferias" method="GET" className={styles.filterFields}><input type="hidden" name="q" value={q || ""} /><label>Status<select name="status" defaultValue={status}><option value="">Todos</option>{["Programada", "Em gozo", "Concluída"].map(value => <option key={value}>{value}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/rh/ferias">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/ferias" values={{ q, status }} />}>
    <OperationalTable preferenceId="rh-ferias" columns={columns} caption="Férias" emptyMessage="Nenhuma programação de férias encontrada." rows={vacations.map(vac => ({ id: vac.id, label: vac.employee?.name || vac.id, values: { employee: vac.employee?.name || "—", acquisition: `${format(new Date(vac.acquisitionStart), "dd/MM/yy")} – ${format(new Date(vac.acquisitionEnd), "dd/MM/yy")}`, enjoyment: vac.enjoymentStart ? `${format(new Date(vac.enjoymentStart), "dd/MM/yy")} – ${vac.enjoymentEnd ? format(new Date(vac.enjoymentEnd), "dd/MM/yy") : "—"}` : "A Definir", days: String(vac.days), status: vac.status }, actions: <FeriasRowActions vacation={vac} /> }))} />
  </OperationalListFrame>;
}
