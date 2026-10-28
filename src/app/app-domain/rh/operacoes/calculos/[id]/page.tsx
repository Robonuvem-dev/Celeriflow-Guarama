import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { OperationForm } from "../../OperationForm";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";
import { db } from "@/db/client";
import { readPersonnelPayrollRun, readRunStatementsPage } from "@/db/repositories/personnel-pages/workforce";

export const dynamic = "force-dynamic";
export default async function PayrollRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;
  const { id } = await params;
  const run = await readPersonnelPayrollRun(database, id);
  await assertPayrollBudgetScope(context, run.payrollId);
  const { total, page, statements } = await readRunStatementsPage(database, id, (await searchParams).page);
  const hidden = { name: "runId", label: "Cálculo", value: id, type: "hidden" };
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title={`Cálculo ${run.payroll.competence}`} description={`${run.mode} · ${run.scope} · ${run.status}`} action={<Link href="/rh/operacoes?tab=calculos">Voltar</Link>} />
    <p className="rounded border bg-white p-3 text-sm">Bruto R$ {run.gross.toFixed(2)} · descontos R$ {run.deductions.toFixed(2)} · líquido R$ {run.net.toFixed(2)} · patronal R$ {run.employer.toFixed(2)}</p>
    {run.mode === "OFICIAL" && run.status === "CALCULADA" && <OperationForm command="fechar" title="Conferir e fechar cálculo oficial" fields={[hidden]} />}
    {run.status === "CALCULADA" && <OperationForm command="cancelar" title="Cancelar cálculo preservando histórico" fields={[hidden, { name: "reason", label: "Motivo", required: true }]} />}
    {run.status === "FECHADA" && <OperationForm command="publicar" title="Liberar demonstrativos no Portal" fields={[hidden, { name: "releaseAt", label: "Data/hora ISO com fuso (ex.: 2026-10-15T09:00:00-03:00)", required: true }]} />}
    {run.scope === "DEMONSTRACAO" && run.status === "FECHADA" && <OperationForm command="poc-pagamento" title="Registrar pagamento demonstrativo para informe anual POC" fields={[hidden, { name: "paymentDate", label: "Data do pagamento fictício", type: "date", required: true }, { name: "reference", label: "Referência do modelo de liquidação", value: "Liquidação fictícia POC", required: true }]} />}
    {run.scope === "DEMONSTRACAO" && run.status === "FECHADA" && run.payroll.type === "Rescisão" && <OperationForm command="poc-vinculo" title="Aplicar desligamento ou reintegração demonstrativa dos vínculos desta rescisão" fields={[{ name: "sourceRunId", label: "Rescisão", value: run.id, type: "hidden" }, { name: "operation", label: "Efeito", options: [{ value: "DESLIGAR", label: "Desligar ao final da competência" }, { value: "REINTEGRAR", label: "Reintegrar vínculo desligado" }] }, { name: "date", label: "Data do ato/efeito", type: "date", required: true }, { name: "actNumber", label: "Número do ato demonstrativo", required: true }, { name: "reason", label: "Fundamento e observações", type: "textarea", required: true }]} />}
    {run.status === "FECHADA" && <OperationForm command="financeiro" title="Prévia / geração de solicitações de despesa" fields={[hidden, { name: "ruleId", label: "Regra JSON de classificação financeira", type: "lookup:rule", required: true }, { name: "date", label: "Data do lançamento", type: "date", required: true }, { name: "mode", label: "Operação", options: [{ value: "PREVIA", label: "Conferir plano" }, { value: "APLICAR", label: "Gerar solicitações no Financeiro" }] }]} />}
    {run.mode === "OFICIAL" && run.scope === "PRODUCAO" && run.status === "FECHADA" && <OperationForm command="financeiro-empenhar" title="Empenhar todas as despesas aprovadas da folha" fields={[hidden, { name: "date", label: "Data de reserva e empenhamento", type: "date", required: true }, { name: "commitments", label: 'Empenhos por despesa (JSON): [{"expenseId":"ID","number":"NE-001","type":"Ordinário"}]', type: "textarea", required: true }]} />}
    {run.mode === "OFICIAL" && run.scope === "PRODUCAO" && run.status === "FECHADA" && <OperationForm command="financeiro-liquidar" title="Liquidar todos os empenhos da folha" fields={[hidden, { name: "date", label: "Data da liquidação", type: "date", required: true }, { name: "documents", label: 'Documentos por empenho (JSON): [{"commitmentId":"ID","documentId":"GED","documentRef":"Folha","retentionRuleIds":[]}]', type: "textarea", required: true }]} />}
    {run.mode === "OFICIAL" && run.scope === "PRODUCAO" && run.status === "FECHADA" && <OperationForm command="financeiro-pagar" title="Confirmar pagamento de todas as liquidações da folha" fields={[hidden, { name: "date", label: "Data de pagamento", type: "date", required: true }, { name: "proofDocumentId", label: "ID do comprovante GED", required: true }, { name: "payments", label: 'Ordens por liquidação (JSON): [{"settlementId":"ID","orderNumber":"OP-001","bankAccountId":"CONTA","paymentMethod":"Transferência"}]', type: "textarea", required: true }]} />}
    {run.mode === "OFICIAL" && run.scope === "PRODUCAO" && run.status === "FECHADA" && <OperationForm command="financeiro-concluir" title="Concluir ciclo financeiro da folha com documento GED" fields={[hidden, { name: "documentId", label: "ID do documento GED de conclusão", required: true }]} />}
    {run.mode === "OFICIAL" && run.scope === "PRODUCAO" && run.status === "FECHADA" && <OperationForm command="financeiro-desmovimentar" title="Desmovimentar empenhos ainda não liquidados/pagos" fields={[hidden, { name: "commitmentEventId", label: "ID do lote de empenhos da folha", required: true }, { name: "date", label: "Data da desmovimentação", type: "date", required: true }, { name: "reason", label: "Fundamento da desmovimentação", type: "textarea", required: true }, { name: "idempotencyKey", label: "Chave de controle do ato", required: true }]} />}
    <table className="w-full table-fixed border bg-white text-xs"><thead><tr><th className="p-2 text-left">Servidor / contrato</th><th className="text-left">Líquido</th><th className="text-left">Memória</th></tr></thead><tbody>{statements.map(statement => <tr key={statement.id} className="h-7 border-t"><td className="truncate px-2">{statement.contract.employee.name} · {statement.contract.registration}</td><td>R$ {statement.net.toFixed(2)}</td><td><Link href={`/rh/operacoes/demonstrativos/${statement.id}`}>Conferência detalhada</Link></td></tr>)}</tbody></table>
    <ErpPagination page={page} total={total} pageSize={20} label="demonstrativos" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />
    <details className="rounded border bg-white p-3 text-xs"><summary>Snapshot das regras e origens</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(run.snapshot, null, 2)}</pre></details>
  </div>;
}
