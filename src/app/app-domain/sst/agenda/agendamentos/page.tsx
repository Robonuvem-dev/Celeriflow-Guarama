import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { readSstAppointmentsPage } from "@/db/repositories/sst-pages/agenda";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../../_components/operational-columns";
import { SstNewLink } from "../../_components/SstNewLink";

const columns = [sstColumn("employee", "Servidor", 240, 140), sstColumn("professional", "Profissional", 210, 130), sstColumn("unit", "Local", 180, 110), sstColumn("date", "Data/hora", 180, 145), sstColumn("status", "Situação", 120, 90, "status"), sstColumn("actions", "Detalhes", 90, 80, "actions")];

export default async function SstAppointmentsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const { total, page, records } = await readSstAppointmentsPage(database, units.map(item => item.id), params);
  return <OperationalListFrame label="Agendamentos SST" actions={<SstNewLink href="/sst/agenda">Abrir agenda</SstNewLink>}
    toolbar={<form action="/sst/agenda/agendamentos" method="GET" className={styles.searchForm}><input name="q" aria-label="Buscar servidor" defaultValue={params.q} placeholder="Servidor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button><Link href="/sst/agenda/agendamentos" className={styles.filterButton}>Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/agenda/agendamentos" values={{ q: params.q }} />}>
    <OperationalTable columns={columns} preferenceId="sst-agendamentos" caption="Agendamentos SST" emptyMessage="Nenhum agendamento encontrado." rows={records.map(record => ({ id: record.id, label: record.employee.name, values: { employee: record.employee.name, professional: record.availability.professional.fullName, unit: record.availability.unitName, date: record.startsAt.toLocaleString("pt-BR"), status: record.status }, actions: <Link href={`/sst/agenda/agendamentos/${record.id}`}>Abrir</Link> }))} />
  </OperationalListFrame>;
}
