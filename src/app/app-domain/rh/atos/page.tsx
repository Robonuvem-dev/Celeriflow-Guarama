import Link from "next/link";
import { format } from "date-fns";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { AtoRowActions } from "./AtoRowActions";
import { db } from "@/db/client";
import { readActsPage } from "@/db/repositories/personnel-pages/records";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

const columns = [rhColumn("date", "Data", 120, 100), rhColumn("employee", "Servidor", 240, 150), rhColumn("type", "Tipo", 150, 100, "status"), rhColumn("number", "Nº do ato", 160, 100), rhColumn("document", "Documento", 130, 100), rhColumn("actions", "Ações", 100, 80, "actions", "right")];

export default async function AtosPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { q, type, page } = await searchParams;
  const { total, pagination, acts } = await readActsPage(context.database ?? db, { q, type, page });
  return <OperationalListFrame label="Atos de pessoal" actions={<RhNewLink href="/rh/atos/novo">Registrar ato</RhNewLink>}
    toolbar={<><form action="/rh/atos" method="GET" className={styles.searchForm}><input type="hidden" name="type" value={type || ""} /><input name="q" aria-label="Buscar servidor" defaultValue={q} placeholder="Servidor" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!type)}><form action="/rh/atos" method="GET" className={styles.filterFields}><input type="hidden" name="q" value={q || ""} /><label>Tipo<select name="type" defaultValue={type}><option value="">Todos</option>{["Admissão", "Demissão", "Promoção", "Transferência", "Advertência"].map(value => <option key={value}>{value}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/rh/atos">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={pagination.page} total={total} pathname="/rh/atos" values={{ q, type }} />}>
    <OperationalTable preferenceId="rh-atos" columns={columns} caption="Atos de pessoal" emptyMessage="Nenhum ato de pessoal registrado." rows={acts.map(ato => ({ id: ato.id, label: ato.employee?.name || ato.id, values: { date: format(new Date(ato.date), "dd/MM/yyyy"), employee: ato.employee?.name || "—", type: ato.type, number: ato.actNumber || "—", document: ato.documentUrl || "—" }, cells: ato.documentUrl ? { document: <a href={ato.documentUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir documento do ato ${ato.actNumber || ato.id}`}>Abrir documento</a> } : undefined, actions: <AtoRowActions ato={ato} /> }))} />
  </OperationalListFrame>;
}
