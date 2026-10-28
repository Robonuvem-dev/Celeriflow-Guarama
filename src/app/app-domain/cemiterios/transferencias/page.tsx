import Link from "next/link";
import { db } from "@/db/client";
import { readCemeteryTransferPage } from "@/db/repositories/cemeteries/workflow-pages";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { WorkflowTransferForm } from "@/components/cemeteries/WorkflowForms";
import { WORKFLOW_MOVEMENT_LABELS } from "@/lib/cemeteries/workflow-labels";

export const dynamic = "force-dynamic";
type Filters = { page?: string; q?: string; type?: string; cemeteryId?: string };
export default async function CemeteryTransfersPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = await searchParams;
  const context = await getTenantContextForModule("CEMITERIOS");
  const { total, page, rows, graves, operators } = await readCemeteryTransferPage(context.database ?? db, filters);
  const graveNames = new Map(graves.map(grave => [grave.id, `${grave.code} · ${grave.cemetery.name}`]));
  const operatorNames = new Map(operators.map(operator => [operator.id, operator.nome]));
  const values = { q: filters.q || "", type: filters.type || "", cemeteryId: filters.cemeteryId || "" };
  const href = (next: number) => `/cemiterios/transferencias?${new URLSearchParams({ ...values, page: String(next) })}`;
  return <main className="grid gap-6 p-6"><header><Link href="/cemiterios">← Cemitérios</Link><h1 className="text-2xl font-bold">Transferências e exumações</h1><Link href="/cemiterios/processos">Processos funerários →</Link></header><form className="flex gap-2"><input name="q" defaultValue={filters.q} placeholder="Nome da pessoa" className="rounded border p-2" /><select className="rounded border p-2" name="type" defaultValue={filters.type || ""}><option value="">Todos os tipos</option>{Object.entries(WORKFLOW_MOVEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="rounded border p-2">Filtrar</button></form>
    <section className="grid gap-3">{rows.map(row => <article key={row.id} className="rounded border bg-white p-4"><h2 className="font-semibold">{row.deceased?.fullName} · {WORKFLOW_MOVEMENT_LABELS[row.movementType] || row.movementType}</h2><p>{row.movementDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Origem: {graveNames.get(row.fromGraveId || "") || row.fromGraveId} · Destino: {row.toOssuary?.code || (row.toGraveId ? graveNames.get(row.toGraveId) : row.destinationDescription)}</p><p>Operador: {operatorNames.get(row.createdByUsuarioId) || row.createdByUsuarioId}</p><p>{row.notes}</p></article>)}{!rows.length && <p>Nenhuma movimentação encontrada.</p>}</section><ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: "/cemiterios/transferencias", values }} />{canPerformModuleOperation(context.user, "CEMITERIOS", "update") && <WorkflowTransferForm />}</main>;
}
