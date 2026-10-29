import Link from "next/link";
import { Eye } from "lucide-react";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { cemeteryQueryHref, cemeteryQuerySchema, type CemeterySearchParams } from "@/lib/cemeteries/query-policy";
import { listCemeteryProcesses } from "@/lib/cemeteries/queries";
import { CemeteryQueryFilters } from "@/components/cemeteries/CemeteryQueryFilters";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const fields: [string, string, number, number][] = [["comprovante", "Comprovante", 120, 80], ["falecido", "Falecido", 190, 100], ["obito", "Óbito", 95, 70], ["tipo", "Tipo", 110, 60], ["status", "Situação", 110, 60], ["cemiterio", "Cemitério", 140, 70], ["funeraria", "Funerária", 140, 70], ["causa", "Causa", 180, 70], ["agendamento", "Agendamento", 150, 100], ["realizacao", "Realização", 150, 100]];
const columns: OperationalColumn[] = [...fields.map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 700, type: key === "status" ? "status" : key === "comprovante" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow" })), { key: "actions", label: "Ações", type: "actions", initialWidth: 56, minWidth: 56, maxWidth: 80, resizable: false, sortable: false, details: "none" }];
const time = (date: Date | null) => date ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
export default async function CemeteryUnifiedQuery({ searchParams }: { searchParams: Promise<CemeterySearchParams> }) {
  await getTenantContextForModule("CEMITERIOS");
  const parsed = cemeteryQuerySchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert" className="p-6">Filtros inválidos: {parsed.error.issues[0].message}</p>;
  const query = parsed.data;
  const { items, total, page } = await listCemeteryProcesses(db, query);
  const values = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "page"));
  return <OperationalListFrame label="Consulta de processos funerários" actions={<Link className={styles.dialogButton} href={cemeteryQueryHref("/cemiterios/relatorio", query, 1)}>Relatório completo de sepultados</Link>}
    toolbar={<><form action="/cemiterios/consulta" className={styles.searchForm}><input aria-label="Buscar falecido ou comprovante" className={styles.searchInput} name="q" defaultValue={query.q} placeholder="Buscar falecido ou comprovante…" />{Object.entries(values).filter(([key]) => key !== "q").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Object.entries(values).filter(([key, value]) => key !== "q" && !!value).length}><CemeteryQueryFilters query={query} /><Link href="/cemiterios/consulta">Limpar filtros</Link></OperationalFilters></>}
    pagination={<OperationalLinkPagination pathname="/cemiterios/consulta" page={page} total={total} values={values} />}>
    <OperationalTable columns={columns} preferenceId="cemiterios.consulta" caption="Consulta unificada de processos funerários" emptyMessage="Nenhum processo encontrado." rows={items.map((process) => ({ id: process.id, label: process.deceased.fullName, values: { comprovante: process.receiptCode, falecido: process.deceased.fullName, obito: process.deceased.deathDate.toISOString().slice(0, 10), tipo: process.processType, status: process.status, cemiterio: process.cemetery?.name || "—", funeraria: process.funeralHome?.name ?? "—", causa: process.deceased.cause?.description ?? process.deceased.causeText ?? "—", agendamento: time(process.scheduledAt), realizacao: time(process.performedAt) }, actions: <Link className={styles.iconButton} aria-label={`Abrir processo ${process.receiptCode}`} href={`/cemiterios/processos/${process.id}`}><Eye /></Link> }))} />
  </OperationalListFrame>;
}
