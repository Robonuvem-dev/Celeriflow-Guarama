import Link from "next/link";
import { z } from "zod";
import { AccessError, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getOmbudsmanReadContext } from "@/lib/attendance/access";
import { and, asc, count as sqlCount, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { ombudsmans } from "@/db/schema/attendance-portals";
import { departments as departmentTable } from "@/db/schema/administration";
import { processes } from "@/db/schema/processes";
import { ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { readControlEntityUnits, readUnambiguousDepartmentIds } from "@/db/repositories/processes/judicial";
import { redirect } from "next/navigation";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { financeColumn } from "../../../financeiro/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

const filtersSchema = z.object({ entityId: z.string().optional(), type: z.string().max(80).optional(), status: z.string().max(80).optional(), from: z.iso.date().optional(), through: z.iso.date().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).refine(value => !value.from || !value.through || value.from <= value.through, "Período inicial deve preceder o final.");

export default async function ControlOmbudsmanConsultation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const control = await getTenantContextForModule("ADMINISTRACAO");
  let context;
  try { context = await getOmbudsmanReadContext(); } catch (error) {
    if (!(error instanceof AccessError) || error.status !== 403) throw error;
    return <section className="p-5"><h1 className="text-xl font-semibold">Controle Interno — Ouvidoria</h1><p>A consulta exige leitura autorizada de Ouvidoria no módulo de origem.</p><Link href="/controle-interno">Voltar ao Controle</Link></section>;
  }
  const raw = await searchParams;
  const input = filtersSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== "")));
  if (!input.success) return <p className="p-5">{input.error.issues[0]?.message ?? "Filtros inválidos."}</p>;
  const filters = input.data;
  const units = await readControlEntityUnits(db, isSystemAdministrator(control.user), control.user.allowedBudgetUnitIds);
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity])).values()];
  const selected = filters.entityId || entities[0]?.id;
  if (!selected || !entities.some(entity => entity.id === selected)) return <p className="p-5">Entidade fora do escopo autorizado ou sem UG municipal vinculada.</p>;
  // A shared secretariat cannot establish which entity owns a manifestation.
  // Require all durable UG bindings of its department's secretariat to agree.
  const scopedSecretariats = [...new Set(units.filter(unit => unit.governmentEntityId === selected).map(unit => unit.secretariatId))];
  const departments = await readUnambiguousDepartmentIds(db, selected, scopedSecretariats);
  const where = and(ombudsmanScopeCondition(context), inArray(ombudsmans.departmentId, departments.map(department => department.id)), filters.type ? eq(ombudsmans.type, filters.type) : undefined, filters.status ? eq(ombudsmans.status, filters.status) : undefined, filters.from ? gte(ombudsmans.createdAt, new Date(`${filters.from}T00:00:00.000Z`)) : undefined, filters.through ? lte(ombudsmans.createdAt, new Date(`${filters.through}T23:59:59.999Z`)) : undefined);
  const [count, rows, types, statuses] = await withDatabaseTransaction(databaseConnection, async tx => Promise.all([
    tx.select({ total: sqlCount() }).from(ombudsmans).where(where).then(result => result[0].total),
    tx.select({ id: ombudsmans.id, protocolNumber: ombudsmans.protocolNumber, type: ombudsmans.type, status: ombudsmans.status, createdAt: ombudsmans.createdAt, respondedAt: ombudsmans.respondedAt, concludedAt: ombudsmans.concludedAt, isAnonymous: ombudsmans.isAnonymous, isConfidential: ombudsmans.isConfidential, department: { name: departmentTable.name }, process: { protocolNumber: processes.protocolNumber, status: processes.status } }).from(ombudsmans).leftJoin(departmentTable, eq(departmentTable.id, ombudsmans.departmentId)).leftJoin(processes, eq(processes.id, ombudsmans.processId)).where(where).orderBy(desc(ombudsmans.createdAt), desc(ombudsmans.id)).limit(OPERATIONAL_PAGE_SIZE).offset((filters.page - 1) * OPERATIONAL_PAGE_SIZE),
    tx.select({ type: ombudsmans.type, _count: { _all: sqlCount() } }).from(ombudsmans).where(where).groupBy(ombudsmans.type).orderBy(asc(ombudsmans.type)),
    tx.select({ status: ombudsmans.status, _count: { _all: sqlCount() } }).from(ombudsmans).where(where).groupBy(ombudsmans.status).orderBy(asc(ombudsmans.status)),
  ]), { isolationLevel: "repeatable read", timeoutMs: 5_000 });
  const pageLink = (page: number) => { const query = new URLSearchParams({ entityId: selected, page: String(page) }); for (const key of ["type", "status", "from", "through"] as const) if (filters[key]) query.set(key, filters[key]); return `?${query}`; };
  const lastPage = Math.max(1, Math.ceil(count / OPERATIONAL_PAGE_SIZE));
  if (filters.page > lastPage) redirect(pageLink(lastPage));
  return <OperationalListFrame label="Consulta integrada de Ouvidoria" actions={<Link className={styles.dialogButton} href="/controle-interno">Voltar ao Controle</Link>}
    toolbar={<><span>{count} manifestações</span><OperationalFilters activeCount={[filters.type, filters.status, filters.from, filters.through].filter(Boolean).length}><form method="get" className={styles.filterFields}>
      <label>Entidade<select name="entityId" defaultValue={selected} className="block rounded border p-2">{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Tipo<input name="type" defaultValue={filters.type} className="block rounded border p-2" placeholder="Reclamação, Sugestão…" /></label><label>Situação<input name="status" defaultValue={filters.status} className="block rounded border p-2" /></label><label>Inclusão inicial<input name="from" type="date" defaultValue={filters.from} className="block rounded border p-2" /></label><label>Inclusão final<input name="through" type="date" defaultValue={filters.through} className="block rounded border p-2" /></label><button className={styles.primaryButton}>Consultar</button><Link className={styles.dialogButton} href="/controle-interno/consultas/ouvidoria">Limpar filtros</Link>
    </form><p>Registros canônicos no escopo de Ouvidoria autorizado e da entidade selecionada. Identidade, contatos, assunto e narrativa não são carregados nesta consulta. Registros sem atribuição institucional inequívoca não entram nos totais.</p><p>Total filtrado: {count}</p><p>{types.map(row => `${row.type}: ${row._count._all}`).join(" · ")}</p><p>{statuses.map(row => `${row.status}: ${row._count._all}`).join(" · ")}</p></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={filters.page} total={count} values={{ entityId: selected, type: filters.type, status: filters.status, from: filters.from, through: filters.through }} />}>
    <OperationalTable preferenceId="controle-ouvidoria" caption="Manifestações da Ouvidoria" emptyMessage="Sem manifestações no período e escopo selecionados."
      columns={[financeColumn("protocol", "Protocolo", 100), financeColumn("type", "Tipo", 90), financeColumn("status", "Situação", 90, 110, "status"), financeColumn("department", "Setor", 100), financeColumn("created", "Inclusão", 90), financeColumn("responded", "Resposta", 90), financeColumn("concluded", "Conclusão", 90), financeColumn("process", "Processo", 120), financeColumn("processStatus", "Situação do processo", 135), financeColumn("access", "Acesso", 110), financeColumn("anonymous", "Anônimo", 75), financeColumn("actions", "Abrir", 48, 48, "actions")]}
      rows={rows.map(row => ({ id: row.id, label: row.protocolNumber, values: { protocol: row.protocolNumber, type: row.type, status: row.status, department: row.department?.name ?? "—", created: row.createdAt.toISOString().slice(0, 10), responded: row.respondedAt?.toISOString().slice(0, 10) ?? "Pendente", concluded: row.concludedAt?.toISOString().slice(0, 10) ?? "Aberta", process: row.process?.protocolNumber ?? "Sem processo vinculado", processStatus: row.process?.status ?? "—", access: row.isConfidential ? "Confidencial" : "Ordinário", anonymous: row.isAnonymous ? "Sim" : "Não" }, actions: <Link className={styles.dialogButton} href={`/atendimento/ouvidoria/${row.id}`}>Abrir</Link> }))} />
  </OperationalListFrame>;
}
