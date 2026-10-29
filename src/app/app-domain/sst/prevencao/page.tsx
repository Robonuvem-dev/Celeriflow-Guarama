import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listPrevention } from "@/lib/sst/prevention-service";
import { preventionKinds } from "@/lib/sst/prevention-policy";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";

export const dynamic = "force-dynamic";
const columns = [sstColumn("title", "Identificação", 350, 170), sstColumn("kind", "Rotina", 240, 150), sstColumn("createdAt", "Cadastro", 140, 110), sstColumn("actions", "Ficha", 90, 80, "actions")];

export default async function PreventionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("SST"), search = await searchParams;
  const val = (key: string) => typeof search[key] === "string" ? search[key] as string : "";
  const result = await listPrevention(context, { page: val("page") || 1, kind: val("kind"), q: val("q"), budgetUnitId: val("budgetUnitId") });
  const units = await listSstUnits(sstDatabase(context), context);
  return <OperationalListFrame label="CIPA e prevenção" actions={<><Link href="/sst/prevencao/calendario" className={styles.filterButton}>Calendário anual</Link><SstNewLink href="/sst/prevencao/novo">Novo registro</SstNewLink></>}
    toolbar={<><form action="/sst/prevencao" method="GET" className={styles.searchForm}><input type="hidden" name="kind" value={result.filter.kind} /><input type="hidden" name="budgetUnitId" value={result.filter.budgetUnitId} /><input name="q" aria-label="Buscar registro de prevenção" defaultValue={result.filter.q} placeholder="Buscar" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!result.filter.kind) + Number(!!result.filter.budgetUnitId)}><form action="/sst/prevencao" method="GET" className={styles.filterFields}><input type="hidden" name="q" value={result.filter.q} /><label>Rotina<select name="kind" defaultValue={result.filter.kind}><option value="">Todas</option>{Object.entries(preventionKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>UG<select name="budgetUnitId" defaultValue={result.filter.budgetUnitId}><option value="">Todas autorizadas</option>{units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/prevencao">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={result.page} total={result.total} pathname="/sst/prevencao" values={result.filter} />}>
    <OperationalTable columns={columns} preferenceId="sst-prevencao" caption="CIPA e prevenção" emptyMessage="Nenhum registro para os filtros selecionados." rows={result.rows.map(row => ({ id: row.id, label: row.title, values: { title: row.title, kind: preventionKinds[row.kind], createdAt: row.createdAt.toLocaleDateString("pt-BR") }, actions: <Link href={`/sst/prevencao/${row.id}`}>Abrir</Link> }))} />
  </OperationalListFrame>;
}
