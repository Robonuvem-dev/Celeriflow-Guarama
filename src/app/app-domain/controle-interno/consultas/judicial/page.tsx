import Link from "next/link";
import { AccessError, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getProtocolContext } from "@/lib/protocols/access";
import { judicialCaseFilters, judicialCaseWhere } from "@/lib/protocols/judicial-cases";
import { and, asc, count as sqlCount, inArray } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { processJudicialCases } from "@/db/schema/process-judicial";
import { readControlEntityUnits, listJudicialCases } from "@/db/repositories/processes/judicial";
import { redirect } from "next/navigation";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { financeColumn } from "../../../financeiro/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export default async function ControlJudicialConsultation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const control = await getTenantContextForModule("ADMINISTRACAO");
  let context;
  try { context = await getProtocolContext(); } catch (error) { if (!(error instanceof AccessError) || error.status !== 403) throw error; return <p className="p-5">Consulta judicial exige leitura autorizada do módulo de Processos ativo.</p>; }
  const raw = await searchParams;
  const parsed = judicialCaseFilters.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== "")));
  if (!parsed.success) return <p className="p-5">{parsed.error.issues[0]?.message}</p>;
  const filters = parsed.data;
  const units = await readControlEntityUnits(db, isSystemAdministrator(control.user), control.user.allowedBudgetUnitIds);
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity])).values()];
  const selected = filters.entityId ?? entities[0]?.id;
  if (!selected || !entities.some(entity => entity.id === selected)) return <p className="p-5">Entidade fora das UGs autorizadas no Controle.</p>;
  const where = and(judicialCaseWhere(context, selected, filters), inArray(processJudicialCases.budgetUnitId, units.filter(unit => unit.governmentEntityId === selected && (context.protocolAccess.isAdmin || context.user.allowedBudgetUnitIds.includes(unit.budgetUnitId))).map(unit => unit.budgetUnitId)));
  const [count, cases, statuses] = await withDatabaseTransaction(databaseConnection, async tx => Promise.all([
    tx.select({ total: sqlCount() }).from(processJudicialCases).where(where).then(rows => rows[0].total),
    listJudicialCases(tx, where, { limit: OPERATIONAL_PAGE_SIZE, offset: (filters.page - 1) * OPERATIONAL_PAGE_SIZE }),
    tx.select({ status: processJudicialCases.status, _count: { _all: sqlCount() } }).from(processJudicialCases).where(where).groupBy(processJudicialCases.status).orderBy(asc(processJudicialCases.status)),
  ]), { isolationLevel: "repeatable read", timeoutMs: 5_000 });
  const href = (page: number) => `?${new URLSearchParams({ entityId: selected, page: String(page), status: filters.status ?? "", q: filters.q ?? "", from: filters.from ?? "", through: filters.through ?? "" })}`;
  const lastPage = Math.max(1, Math.ceil(count / OPERATIONAL_PAGE_SIZE));
  if (filters.page > lastPage) redirect(href(lastPage));
  const style = "block rounded border p-2";
  return <OperationalListFrame label="Processos contra a entidade" actions={<Link className={styles.dialogButton} href="/controle-interno">Voltar ao Controle</Link>}
    toolbar={<><form method="get" className={styles.searchForm}><input type="hidden" name="entityId" value={selected} /><input type="hidden" name="status" value={filters.status ?? ""} /><input type="hidden" name="from" value={filters.from ?? ""} /><input type="hidden" name="through" value={filters.through ?? ""} /><input aria-label="Número, tribunal ou protocolo" name="q" defaultValue={filters.q} className={styles.searchInput} /><button className={styles.dialogButton}>Buscar</button></form>
      <OperationalFilters activeCount={[filters.status, filters.from, filters.through].filter(Boolean).length}><form method="get" className={styles.filterFields}><input type="hidden" name="q" value={filters.q ?? ""} /><label>Entidade<select name="entityId" defaultValue={selected} className={style}>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Situação<select name="status" defaultValue={filters.status ?? ""} className={style}><option value="">Abertos e suspensos</option><option value="OPEN">Aberto</option><option value="SUSPENDED">Suspenso</option><option value="CLOSED">Encerrado</option><option value="RECLASSIFIED">Reclassificado</option></select></label><label>Abertura inicial<input type="date" name="from" defaultValue={filters.from} className={style} /></label><label>Abertura final<input type="date" name="through" defaultValue={filters.through} className={style} /></label><button className={styles.primaryButton}>Consultar</button><Link className={styles.dialogButton} href="/controle-interno/consultas/judicial">Limpar filtros</Link></form><p>Origem: registro judicial documentado no processo nativo, com ente demandado e UG explícitos. Consulta aplica acesso de Processos e de Controle conjuntamente. Cadastro sem registro judicial não entra nos totais. Não equivale a certidão de inexistência de ações.</p><p>Total filtrado: {count} · {statuses.map(row => `${row.status}: ${row._count._all}`).join(" · ")}</p></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={filters.page} total={count} values={{ entityId: selected, status: filters.status, q: filters.q, from: filters.from, through: filters.through }} />}>
    <OperationalTable preferenceId="controle-judicial" caption="Processos judiciais" emptyMessage="Sem processos no período e escopo selecionados."
      columns={[financeColumn("number", "Número judicial", 120), financeColumn("court", "Tribunal", 100), financeColumn("opened", "Abertura", 90), financeColumn("status", "Situação judicial", 115, 140, "status"), financeColumn("process", "Processo nativo", 110), financeColumn("processStatus", "Situação do processo", 135), financeColumn("position", "Última posição", 100), financeColumn("version", "Versão", 65), financeColumn("ged", "Evidência GED", 110), financeColumn("hash", "Hash da evidência", 130, 180, "identifier"), financeColumn("actions", "Abrir", 48, 48, "actions")]}
      rows={cases.map(row => ({ id: row.id, label: row.caseNumber, values: { number: row.caseNumber, court: row.court, opened: row.openedAt.toISOString().slice(0, 10), status: row.status, process: row.process.protocolNumber, processStatus: row.process.status, position: row.events[0]?.effectiveAt.toISOString().slice(0, 10) ?? "—", version: String(row.version), ged: row.events[0]?.documentVersionId ?? "—", hash: row.events[0]?.documentHash ?? "—" }, actions: <Link className={styles.dialogButton} href={`/protocolos/processos/${row.processId}/judicial`}>Abrir</Link> }))} />
  </OperationalListFrame>;
}
