import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import type { PortalRequest } from "@/lib/contracts/employee-portal";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { functionalRequestPayloadSchema } from "@/lib/portal-servidor/functional-requests";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export const dynamic = "force-dynamic";
export default async function MyFunctionalProtocols({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams;
  const status = ["EM_ANALISE", "DEFERIDA", "INDEFERIDA"].includes(params.status || "") ? params.status : undefined;
  const executor = access.context.database ?? db;
  const where = sql`"employeeId"=${access.employee.id} AND payload->>'origin'='REQUERIMENTO_FUNCIONAL' ${status ? sql`AND status=${status}` : sql``}`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "HrPortalRequest" WHERE ${where}`);
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const requests = await portalRows<PortalRequest>(executor, sql`SELECT * FROM "HrPortalRequest" WHERE ${where} ORDER BY "createdAt" DESC,id LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  const rows = requests.map(request => ({ request, payload: functionalRequestPayloadSchema.parse(request.payload) }));
  const processRows = await portalRows<{ id: string; protocolNumber: string; status: string; departmentId: string | null; departmentName: string | null; expectedCompletionAt: Date | null }>(executor, sql`SELECT p.id,p."protocolNumber",p.status,d.id AS "departmentId",d.name AS "departmentName",p."expectedCompletionAt" FROM "Process" p LEFT JOIN "Department" d ON d.id=p."currentDepartmentId" WHERE p.id=ANY(${sql.param(rows.map(row => row.payload.processId))}::text[])`);
  const processes = processRows.map(({ departmentId, departmentName, ...row }) => ({ ...row, currentDepartment: departmentId ? { name: departmentName! } : null }));
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col"><ErpPageTitle title="Meus protocolos funcionais" description="Acompanhe tramitação, pendências, decisão e execução dos seus requerimentos." action={<Link href="/portal-servidor/servicos">Solicitar serviço</Link>} />
    <PortalOperationalList id="protocolos" label="Meus protocolos funcionais" page={page} total={total} values={{ status }} toolbar={<form className="flex gap-2 text-xs"><select aria-label="Decisão" name="status" defaultValue={status || ""}><option value="">Todas as decisões</option><option value="EM_ANALISE">Em análise</option><option value="DEFERIDA">Deferida</option><option value="INDEFERIDA">Indeferida</option></select><button>Filtrar</button></form>} actions={<Link href="/portal-servidor/solicitacoes-rh">Pedidos anteriores ao RH</Link>} columns={[portalColumn("protocol", "Protocolo", 170, 100), portalColumn("service", "Serviço", 220, 110), portalColumn("date", "Abertura", 120, 92), portalColumn("progress", "Tramitação", 140, 100), portalColumn("department", "Setor", 180, 100), portalColumn("decision", "Decisão", 140, 90, "status"), portalColumn("execution", "Execução", 150, 100), portalColumn("pending", "Pendência", 200, 110), portalColumn("actions", "Ação", 60, 60, "actions", "right", 80)]} rows={rows.map(({ request, payload }) => { const process = processes.find(item => item.id === payload.processId); return { id: request.id, label: process?.protocolNumber || request.id, values: { protocol: process?.protocolNumber || "Protocolo indisponível", service: payload.serviceName, date: request.createdAt.toLocaleDateString("pt-BR"), progress: process?.status || "—", department: process?.currentDepartment?.name || "—", decision: request.status, execution: payload.execution, pending: payload.awaitingComplement ? "Complementação solicitada" : "—" }, actions: <Link href={`/portal-servidor/protocolos/${request.id}`}>Abrir</Link> }; })} />
  </div>;
}
