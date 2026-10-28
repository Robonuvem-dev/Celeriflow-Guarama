import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readGeneralRequestsPage } from "@/db/repositories/personnel-pages/requests";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { OperationForm } from "../operacoes/OperationForm";
import { RecertificationCorrectionForm, RecertificationDependentReconciliation } from "../recadastramento/CorrectionForm";

export const dynamic = "force-dynamic";
export default async function HrRequests({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const context = await getTenantContextForModule("RH"); const params = await searchParams;
  const status = ["EM_ANALISE", "PENDENTE_CORRECAO", "DEFERIDA", "INDEFERIDA"].includes(params.status || "") ? params.status || "EM_ANALISE" : "EM_ANALISE";
  const { total, page, rows, employees } = await readGeneralRequestsPage(context.database ?? db, context.user, status, params.page);
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), status })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Solicitações do Portal ao RH" description="Registre a decisão e a referência à providência funcional adotada." action={<Link href="/rh/operacoes">Operações</Link>} />
    <div className="flex gap-3 text-xs"><Link href="/rh/requerimentos-funcionais" className="underline">Requerimentos protocolados</Link><Link href="/rh/servicos-funcionais" className="underline">Catálogo de serviços funcionais</Link></div>
    <form className="flex gap-2 text-xs"><select name="status" defaultValue={status} className="rounded border p-2"><option>EM_ANALISE</option><option>PENDENTE_CORRECAO</option><option>DEFERIDA</option><option>INDEFERIDA</option></select><button className="rounded border px-3">Filtrar</button></form>
    <p className="text-xs">{total} solicitações no filtro</p>
    {rows.map(row => <article key={row.id} className="rounded border bg-white p-3 text-xs">
      <strong>{employees.find(employee => employee.id === row.employeeId)?.name} · {row.kind} · {row.status}</strong>
      <p className="whitespace-pre-wrap">{(row.payload as { description: string }).description}</p>
      {row.kind === "CREDITO_CONSIGNADO" && <details><summary>Pedido, margem e política na solicitação</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(row.payload, null, 2)}</pre><p>Deferir reserva todas as parcelas em transação única. Não representa liberação bancária de crédito.</p></details>}
      {row.kind === "RECADASTRAMENTO" && <details className="my-2"><summary>Conferir valores anteriores, propostos e comprovação</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify({ before: (row.payload as { before: unknown }).before, proposal: (row.payload as { proposal: unknown }).proposal, beforeDetails: (row.payload as { beforeDetails?: unknown }).beforeDetails, details: (row.payload as { details?: unknown }).details }, null, 2)}</pre><p>O deferimento aplica os campos aprovados ao Cadastro Único na mesma transação da decisão. Empregos anteriores são declarações conferidas; não geram averbação automática de tempo.</p></details>}
      {row.decision && <p className="whitespace-pre-wrap">Decisão: {row.decision}</p>}
      {row.kind === "RECADASTRAMENTO" && row.status === "EM_ANALISE" && <RecertificationCorrectionForm requestId={row.id} />}
      {row.kind === "RECADASTRAMENTO" && row.status === "EM_ANALISE" && <RecertificationDependentReconciliation requestId={row.id} />}
      {row.status === "EM_ANALISE" && <OperationForm command={row.kind === "CREDITO_CONSIGNADO" ? "decidir-credito" : row.kind === "RECADASTRAMENTO" ? "decidir-recadastramento" : "decidir-solicitacao"} title="Registrar decisão" fields={[{ name: "requestId", label: "Solicitação", value: row.id, type: "hidden" }, { name: "status", label: "Resultado", options: [{ value: "DEFERIDA", label: "Deferida" }, { value: "INDEFERIDA", label: "Indeferida" }] }, { name: "decision", label: "Fundamento, providência e referência ao registro funcional", type: "textarea", required: true }, ...(row.kind === "CREDITO_CONSIGNADO" ? [{ name: "number", label: "Número do contrato (deferimento)" }, { name: "rubricCode", label: "Rubrica consignada (deferimento)" }] : [])]} />}
    </article>)}
    <ErpPagination page={page} total={total} pageSize={20} label="solicitações" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
