import Link from "next/link";
import { Eye } from "lucide-react";
import { z } from "zod";
import { db } from "@/db/client";
import { readScheduledProcessPage } from "@/db/repositories/cemeteries/workflow-pages";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { WorkflowAdvance, WorkflowForm } from "@/components/cemeteries/WorkflowForms";
import CemeteryLookup from "@/components/cemeteries/CemeteryLookup";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ProcessRowMenu } from "../ProcessRowMenu";

const columns: OperationalColumn[] = [
  ...([["comprovante", "Comprovante", 120, 80], ["pessoa", "Pessoa", 200, 90], ["tipo", "Tipo", 120, 60], ["sepultamento", "Sepultamento", 120, 70], ["status", "Situação", 110, 60], ["agendamento", "Agendamento", 150, 100], ["cemiterio", "Cemitério", 140, 70], ["sepultura", "Sepultura", 100, 60], ["capela", "Capela", 120, 60]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 600, type: key === "status" ? "status" : key === "comprovante" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 72, minWidth: 72, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];

const day = z.union([z.literal(""), z.iso.date()]).default("");
const schema = z.object({ q: z.string().trim().max(120).default(""), type: z.enum(["", "SEPULTAMENTO", "VELORIO", "CREMACAO"]).default(""), status: z.enum(["", "AGENDADO", "EM_REALIZACAO", "SEPULTADO", "ENCERRADO", "CREMADO", "EXUMADO", "TRANSFERIDO", "DESAPROPRIADO", "CANCELADO"]).default(""), cemetery: z.string().default(""), cemeteryId: z.string().default(""), start: day, end: day, page: z.coerce.number().int().min(1).max(100000).default(1) }).refine(v => !v.start || !v.end || v.start <= v.end, "Data inicial posterior à final.");

export default async function CemeteryProcessesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("CEMITERIOS");
  const params = await searchParams;
  const parsed = schema.safeParse(params);
  if (!parsed.success) return <p role="alert" className="p-6">Filtros inválidos: {parsed.error.issues[0].message}</p>;
  const filters = parsed.data;
  const cemeteryId = filters.cemetery || filters.cemeteryId;
  const { total, page, rows } = await readScheduledProcessPage(context.database ?? db, { ...filters, cemeteryId });
  const values = { q: filters.q, type: filters.type, status: filters.status, cemetery: cemeteryId, start: filters.start, end: filters.end };
  const canUpdate = canPerformModuleOperation(context.user, "CEMITERIOS", "update");
  const listHref = `/cemiterios/processos?${new URLSearchParams(values)}`;
  const canCreate = canPerformModuleOperation(context.user, "CEMITERIOS", "create");
  if (params.view === "novo") return <main className="space-y-3 p-4"><Link href={listHref}>Voltar aos processos</Link>{canCreate && <WorkflowForm initialCemeteryId={cemeteryId} />}</main>;
  return <OperationalListFrame label="Processos funerários" actions={canCreate && <Link className={styles.newButton} href={`${listHref}&view=novo`}>Agendar processo</Link>}
    toolbar={<><form action="/cemiterios/processos" className={styles.searchForm}><input className={styles.searchInput} aria-label="Buscar nome ou comprovante" name="q" defaultValue={filters.q} placeholder="Buscar nome ou comprovante…" />{Object.entries(values).filter(([key]) => key !== "q").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Object.entries(values).filter(([key, value]) => key !== "q" && !!value).length}><form action="/cemiterios/processos" className={styles.filterFields}><input type="hidden" name="q" value={filters.q} /><label>Tipo<select name="type" defaultValue={filters.type}><option value="">Todos</option>{["SEPULTAMENTO", "VELORIO", "CREMACAO"].map(value => <option key={value}>{value}</option>)}</select></label><label>Situação<select name="status" defaultValue={filters.status}><option value="">Todas</option>{["AGENDADO", "EM_REALIZACAO", "SEPULTADO", "ENCERRADO", "CREMADO", "EXUMADO", "TRANSFERIDO", "DESAPROPRIADO", "CANCELADO"].map(value => <option key={value}>{value}</option>)}</select></label><CemeteryLookup name="cemetery" kind="cemetery" label="Cemitério" defaultValue={cemeteryId} /><label>Agendamento desde<input type="date" name="start" defaultValue={filters.start} /></label><label>Agendamento até<input type="date" name="end" defaultValue={filters.end} /></label><button className={styles.primaryButton}>Filtrar</button><Link href="/cemiterios/processos">Limpar filtros</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination pathname="/cemiterios/processos" page={page} total={total} values={values} />}>
    <OperationalTable preferenceId="cemiterios.processos" columns={columns} caption="Processos funerários" emptyMessage="Nenhum processo encontrado." rows={rows.map(record => ({ id: record.id, label: record.deceased.fullName, values: { comprovante: record.receiptCode, pessoa: record.deceased.fullName, tipo: record.processType, sepultamento: record.burialType || "—", status: record.status, agendamento: record.scheduledAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), cemiterio: record.cemetery?.name || "—", sepultura: record.grave?.code || "—", capela: record.chapel?.name || "—" }, actions: <div className={styles.rowActions}><Link className={styles.iconButton} aria-label={`Abrir processo ${record.receiptCode}`} href={`/cemiterios/processos/${record.id}`}><Eye /></Link>{canUpdate && ["AGENDADO", "EM_REALIZACAO"].includes(record.status) && <ProcessRowMenu label={record.receiptCode}><WorkflowAdvance id={record.id} type={record.processType} status={record.status} /></ProcessRowMenu>}</div> }))} />
  </OperationalListFrame>;
}
