import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readPayrollEventsPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../../_components/operational-columns";
import { RhNewLink } from "../../_components/RhNewLink";

const columns = [rhColumn("code", "Código", 100, 80, "identifier"), rhColumn("name", "Descrição", 240, 140), rhColumn("type", "Tipo", 120, 100, "status"), rhColumn("formula", "Fórmula base", 220, 130, "identifier"), rhColumn("status", "Status", 100, 76, "status"), rhColumn("actions", "Ações", 90, 80, "actions", "right")];

export default async function EventosPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { q = "", page } = await searchParams;
  const { total, pagination, events } = await readPayrollEventsPage(context.database ?? db, { q, page });
  return <OperationalListFrame label="Eventos da folha" actions={<><Link href="/rh/folha" className={styles.filterButton}>Voltar para folha</Link><RhNewLink href="/rh/folha/eventos/novo">Novo evento</RhNewLink></>}
    toolbar={<form action="/rh/folha/eventos" method="GET" className={styles.searchForm}><input name="q" aria-label="Buscar por código, descrição ou tipo" defaultValue={q} placeholder="Código, descrição ou tipo" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button><Link href="/rh/folha/eventos" className={styles.filterButton}>Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/folha/eventos" values={{ q }} />}>
    <OperationalTable preferenceId="rh-folha-eventos" columns={columns} caption="Eventos da folha" emptyMessage="Nenhum evento configurado." rows={events.map(ev => ({ id: ev.id, label: ev.name, values: { code: ev.code, name: ev.name, type: ev.type, formula: ev.formula || "—", status: ev.isActive ? "Ativo" : "Inativo" }, actions: <Link href={`/rh/folha/eventos/${ev.id}/editar`} aria-label={`Editar evento ${ev.code}`}>Editar</Link> }))} />
  </OperationalListFrame>;
}
