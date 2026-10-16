import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { functionalRequestPayloadSchema } from "@/lib/portal-servidor/functional-requests";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { FunctionalReviewForm, FunctionalExecutionForm } from "./ReviewForm";

export const dynamic = "force-dynamic";
export default async function FunctionalRequestQueue({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const admin = isSystemAdministrator(context.user);
  const status = ["EM_ANALISE", "DEFERIDA", "INDEFERIDA"].includes(params.status || "") ? params.status! : "EM_ANALISE";
  const where = { status, payload: { path: ["origin"], equals: "REQUERIMENTO_FUNCIONAL" }, ...(!admin ? { OR: context.user.allowedBudgetUnitIds.map(unitId => ({ payload: { path: ["configuration", "budgetUnitId"], equals: unitId } })) } : {}) };
  const total = await context.prisma.hrPortalRequest.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const requests = await context.prisma.hrPortalRequest.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  const rows = requests.map(request => ({ request, payload: functionalRequestPayloadSchema.parse(request.payload) }));
  const employees = await context.prisma.employee.findMany({ where: { id: { in: rows.map(row => row.request.employeeId) } }, select: { id: true, name: true, registration: true } });
  const processes = await context.prisma.process.findMany({ where: { id: { in: rows.map(row => row.payload.processId) } }, select: { id: true, protocolNumber: true, currentDepartmentId: true, status: true } });
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), status })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Requerimentos funcionais protocolados" description="Análise por unidade competente, com decisão e aplicação na origem." action={<Link href="/rh/servicos-funcionais">Configurar catálogo</Link>} /><form className="flex gap-2 text-xs"><select name="status" aria-label="Situação da decisão" defaultValue={status} className="h-8 rounded border px-2"><option>EM_ANALISE</option><option>DEFERIDA</option><option>INDEFERIDA</option></select><button className="rounded border px-3">Filtrar</button></form><p className="text-xs">{total} requerimentos no filtro</p>
    {rows.map(({ request, payload }) => { const employee = employees.find(item => item.id === request.employeeId), process = processes.find(item => item.id === payload.processId); return <article key={request.id} className="rounded border border-slate-300 bg-white p-4"><header className="text-sm font-semibold">{process?.protocolNumber} · {payload.serviceName}</header><p className="mt-1 text-xs text-slate-500">{employee?.name} · matrícula {employee?.registration} · {request.createdAt.toLocaleString("pt-BR")} · {request.status}</p><p className="mt-3 whitespace-pre-wrap text-sm">{payload.description}</p><dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">{payload.configuration.fields.map(field => <div key={field.code}><dt className="font-semibold">{field.label}</dt><dd className="whitespace-pre-wrap">{payload.values[field.code] || "Não informado"}</dd></div>)}</dl><p className="mt-3 text-xs">Execução: {payload.execution}{payload.awaitingComplement ? " · Aguardando complementação" : ""}</p>{request.decision && <p className="mt-2 whitespace-pre-wrap text-xs">Decisão: {request.decision}</p>}{request.status === "EM_ANALISE" && (admin || process?.currentDepartmentId === context.user.departmentId) && <FunctionalReviewForm requestId={request.id} documents={payload.configuration.requiredDocuments} />}{request.status === "DEFERIDA" && payload.execution === "PENDENTE" && (admin || process?.currentDepartmentId === context.user.departmentId) && <FunctionalExecutionForm requestId={request.id} />}</article>; })}
    <ErpPagination page={page} total={total} pageSize={20} label="requerimentos" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
