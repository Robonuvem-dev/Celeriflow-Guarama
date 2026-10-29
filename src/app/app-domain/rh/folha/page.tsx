import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { FolhaRowActions } from "./FolhaRowActions";
import { db } from "@/db/client";
import { readPayrollsPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

const columns = [rhColumn("competence", "Competência", 220, 130), rhColumn("type", "Tipo", 220, 140), rhColumn("amount", "Valor total", 200, 130, "text", "right"), rhColumn("status", "Status", 120, 90, "status"), rhColumn("actions", "Ações", 110, 90, "actions", "right")];

export default async function FolhaPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { q = "", page } = await searchParams;
  const { total, pagination, payrolls } = await readPayrollsPage(context.database ?? db, { q, page });
  return <OperationalListFrame label="Folha de pagamento" actions={<><Link href="/rh/folha/eventos" className={styles.filterButton}>Configurar eventos</Link><RhNewLink href="/rh/folha/novo">Nova folha</RhNewLink></>}
    toolbar={<form action="/rh/folha" method="GET" className={styles.searchForm}><input name="q" aria-label="Buscar por competência, tipo ou status" defaultValue={q} placeholder="Competência, tipo ou status" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button><Link href="/rh/folha" className={styles.filterButton}>Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/folha" values={{ q }} />}>
    <OperationalTable preferenceId="rh-folha" columns={columns} caption="Folha de pagamento" emptyMessage="Nenhuma folha cadastrada." rows={payrolls.map(folha => ({ id: folha.id, label: folha.competence, values: { competence: folha.competence, type: folha.type, amount: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(folha.totalValue), status: folha.status }, actions: <FolhaRowActions folha={folha} /> }))} />
  </OperationalListFrame>;
}
