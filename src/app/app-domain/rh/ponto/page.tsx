import Link from "next/link";
import { format } from "date-fns";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PontoRowActions } from "./PontoRowActions";
import { UploadCSVButton } from "./UploadCSVButton";
import { db } from "@/db/client";
import { readAttendancePage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

const columns = [rhColumn("date", "Data", 115, 100), rhColumn("employee", "Servidor", 220, 130), rhColumn("entry", "Entrada", 90, 75), rhColumn("exit", "Saída", 90, 70), rhColumn("hours", "Horas dia", 95, 80, "text", "right"), rhColumn("extra", "H. extra", 90, 75, "text", "right"), rhColumn("bank", "Banco h.", 90, 75, "text", "right"), rhColumn("status", "Status", 100, 85, "status"), rhColumn("actions", "Ações", 90, 80, "actions", "right")];

export default async function PontoPage({ searchParams }: { searchParams: Promise<{ q?: string; month?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { q, month, page } = await searchParams;
  const { total, pagination, records } = await readAttendancePage(context.database ?? db, { q, month, page });
  return <OperationalListFrame label="Registro de ponto" actions={<><UploadCSVButton /><RhNewLink href="/rh/ponto/novo">Apontamento manual</RhNewLink></>}
    toolbar={<><form action="/rh/ponto" method="GET" className={styles.searchForm}><input type="hidden" name="month" value={month || ""} /><input name="q" aria-label="Buscar servidor" defaultValue={q} placeholder="Servidor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!month)}><form action="/rh/ponto" method="GET" className={styles.filterFields}><input type="hidden" name="q" value={q || ""} /><label>Mês<input type="month" name="month" defaultValue={month} /></label><button className={styles.primaryButton}>Aplicar</button><Link href="/rh/ponto">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/ponto" values={{ q, month }} />}>
    <OperationalTable preferenceId="rh-ponto" columns={columns} caption="Registro de ponto" emptyMessage="Nenhum registro de ponto encontrado." rows={records.map(rec => ({ id: rec.id, label: rec.employee?.name || rec.id, values: { date: format(new Date(rec.date), "dd/MM/yyyy"), employee: rec.employee?.name || "—", entry: rec.entryTime ? format(new Date(rec.entryTime), "HH:mm") : "—", exit: rec.exitTime ? format(new Date(rec.exitTime), "HH:mm") : "—", hours: `${rec.hoursWorked.toFixed(2)}h`, extra: rec.extraHours ? `${rec.extraHours.toFixed(2)}h` : "—", bank: rec.bankHours ? `${rec.bankHours.toFixed(2)}h` : "—", status: rec.status }, actions: <PontoRowActions record={rec} /> }))} />
  </OperationalListFrame>;
}
