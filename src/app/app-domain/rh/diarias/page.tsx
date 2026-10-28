import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readTravelAllowancesPage } from "@/db/repositories/personnel-pages/requests";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { OperationForm } from "../operacoes/OperationForm";

export const dynamic = "force-dynamic";
export default async function TravelAllowancePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { total, page, rows, employees, rules, units, expenses, processEvents, processTypes, reports } = await readTravelAllowancesPage(context.database ?? db, context.user, (await searchParams).page);
  const employeeNames = new Map(employees.map(employee => [employee.id, employee.name]));
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <Link href="/rh/adiantamentos" className="text-sm underline">Adiantamentos — concessão e prestação</Link>
    <ErpPageTitle title="Diárias — solicitação, autorização e prestação" description="Política municipal vigente, autorização numerada, execução financeira e relatório da viagem." action={<Link href="/rh/parametrizacoes">Políticas e valores</Link>} />
    <OperationForm command="diaria-solicitar" title="Solicitar e calcular diária" fields={[
      { name: "requestKey", label: "Chave da solicitação", value: randomUUID(), required: true },
      { name: "contractId", label: "Contrato", type: "lookup:contract", required: true },
      { name: "budgetUnitId", label: "Unidade gestora", options: [{ value: "", label: "Selecione" }, ...units.map(unit => ({ value: unit.id, label: `${unit.code} — ${unit.name}` }))], required: true },
      { name: "ruleId", label: "Tabela/política", options: [{ value: "", label: "Selecione" }, ...rules.map(rule => ({ value: rule.id, label: rule.name }))], required: true },
      { name: "destination", label: "Destino", required: true },
      { name: "destinationType", label: "Tipo de destino", options: ["INTERIOR", "CAPITAL", "DF", "INTERNACIONAL"].map(value => ({ value, label: value })) },
      { name: "departureAt", label: "Saída ISO com fuso", value: "2026-10-20T07:00:00-03:00", required: true },
      { name: "returnAt", label: "Retorno ISO com fuso", value: "2026-10-20T18:00:00-03:00", required: true },
      { name: "distanceKm", label: "Distância km", value: "100", required: true },
      { name: "overnight", label: "Pernoite", options: [{ value: "NAO", label: "Não" }, { value: "SIM", label: "Sim" }] },
      { name: "exchangeRate", label: "Cotação BRL/USD (internacional)", value: "5.00", required: true },
      { name: "purpose", label: "Finalidade / atividades previstas", type: "textarea", required: true },
      { name: "vehiclePlate", label: "Placa (opcional)" },
    ]} />
    {rows.map(row => {
      const memory = row.payload as { input: { destination: string }; assessment: { quantity: string; amountBRL: string } };
      const process = processEvents.find(event => event.sourceKey === `DIARIA:PROCESSO:${row.id}`)?.payload as { processId: string; protocolNumber: string } | undefined;
      return <section key={row.id} className="rounded border bg-white p-3 text-xs">
        <h2 className="font-semibold">{employeeNames.get(row.employeeId) ?? "Servidor não localizado"} · {memory.input.destination} · {row.status}</h2>
        <p>{memory.assessment.quantity} diária(s) · R$ {memory.assessment.amountBRL}</p>
        {row.status === "DEFERIDA" && !reports.has(`DIARIA:PRESTACAO:${row.id}`) && <>
          <OperationForm command="diaria-restituir-corrente" title="Receber devolução do corrente — recomposição da despesa" fields={[{ name: "requestId", label: "Solicitação", type: "hidden", value: row.id }, { name: "requestKey", label: "Chave", value: randomUUID(), required: true }, { name: "paymentId", label: "Pagamento original ID", required: true }, { name: "date", label: "Data", type: "date", required: true }, { name: "amount", label: "Valor BRL", required: true }, { name: "documentId", label: "Comprovante GED ID", required: true }, { name: "reason", label: "Fundamento", type: "textarea", required: true }]} />
          <OperationForm command="diaria-restituir-anterior" title="Receber devolução de diária paga em exercício anterior" fields={[{ name: "requestId", label: "Solicitação", type: "hidden", value: row.id }, { name: "requestKey", label: "Chave", value: randomUUID(), required: true }, { name: "date", label: "Data", type: "date", required: true }, { name: "amount", label: "Valor BRL", required: true }, { name: "bankAccountId", label: "Conta ID", required: true }, { name: "revenueNatureId", label: "Natureza receita ID", required: true }, { name: "resourceSourceId", label: "Fonte ID", required: true }, { name: "documentId", label: "Comprovante GED ID", required: true }, { name: "reason", label: "Fundamento", type: "textarea", required: true }]} />
          <OperationForm command="diaria-estornar-restituicao-corrente" title="Estornar devolução do corrente" fields={[{ name: "refundId", label: "Referência DESPESA:ID", required: true }, { name: "date", label: "Data", type: "date", required: true }, { name: "documentId", label: "Parecer GED ID", required: true }, { name: "reason", label: "Fundamento", type: "textarea", required: true }]} />
          <OperationForm command="diaria-estornar-restituicao-anterior" title="Estornar receita de devolução de exercício anterior" fields={[{ name: "revenueId", label: "Receita de restituição ID", required: true }, { name: "date", label: "Data", type: "date", required: true }, { name: "justification", label: "Fundamento", type: "textarea", required: true }]} />
        </>}
        {row.status === "DEFERIDA" && reports.has(`DIARIA:PRESTACAO:${row.id}`) && <OperationForm command="diaria-reabrir" title="Regularizar prestação por responsável independente" fields={[{ name: "requestId", label: "Solicitação", type: "hidden", value: row.id }, { name: "requestKey", label: "Chave", value: randomUUID(), required: true }, { name: "date", label: "Data", type: "date", required: true }, { name: "documentId", label: "Parecer GED ID", required: true }, { name: "reason", label: "Fundamento", type: "textarea", required: true }]} />}
        {expenses.filter(expense => expense.sourceId === row.id).map(expense => <p key={expense.id}>Despesa {expense.id} · {expense.status} · <Link href="/financeiro/orcamento" className="underline">Execução financeira</Link></p>)}
        {row.status === "DEFERIDA" && !expenses.some(expense => expense.sourceId === row.id) && <OperationForm command="diaria-financeiro" title="Encaminhar despesa ao Financeiro" fields={[{ name: "requestId", label: "Solicitação", type: "hidden", value: row.id }, { name: "date", label: "Data", type: "date", required: true }, { name: "appropriationId", label: "Dotação ID", required: true }, { name: "supplierId", label: "Credor servidor ID", required: true }, { name: "secretariatId", label: "Secretaria ID", required: true }]} />}
        {process && <p>Processo <Link href={`/protocolos/processos/${process.processId}`} className="underline">{process.protocolNumber}</Link> · liberação e empenho pelo roteiro publicado</p>}
        {row.status === "EM_ANALISE" && !process && <OperationForm command="diaria-processo" title="Protocolar diária para liberação e empenho" fields={[{ name: "requestId", label: "Solicitação", type: "hidden", value: row.id }, { name: "processTypeId", label: "Roteiro", options: [{ value: "", label: "Selecione" }, ...processTypes.map(type => ({ value: type.id, label: type.name }))], required: true }, { name: "subjectId", label: "Assunto do roteiro", options: [{ value: "", label: "Selecione" }, ...processTypes.flatMap(type => type.subjects.map(subject => ({ value: subject.id, label: `${type.name} — ${subject.name}` })))], required: true }, { name: "appropriationId", label: "Dotação ID", required: true }, { name: "supplierId", label: "Credor servidor ID", required: true }, { name: "secretariatId", label: "Secretaria ID", required: true }, { name: "date", label: "Data da emissão financeira", type: "date", required: true }]} />}
        {row.status === "DEFERIDA" && !reports.has(`DIARIA:PRESTACAO:${row.id}`) && <OperationForm command="diaria-prestar" title="Registrar relatório circunstanciado e restituição" fields={[{ name: "requestId", label: "Solicitação", type: "hidden", value: row.id }, { name: "activities", label: "Atividades realizadas", type: "textarea", required: true }, { name: "returnedAmount", label: "Restituição BRL", value: "0.00", required: true }, { name: "reportDate", label: "Data da prestação", type: "date", required: true }, { name: "documentId", label: "Relatório GED ID", required: true }, { name: "restitutionRevenueId", label: "Todas as referências: DESPESA:ID do corrente ou receitas anteriores, separadas por vírgula" }]} />}
        <div className="mt-2 flex flex-wrap gap-3">{["SOLICITACAO", "HISTORICO", ...(row.status === "DEFERIDA" ? ["AUTORIZACAO"] : []), ...(reports.has(`DIARIA:PRESTACAO:${row.id}`) ? ["PRESTACAO"] : [])].map(type => <Link key={type} href={`/api/rh/diarias/${row.id}?type=${type}&format=PDF`} target="_blank" className="underline">{type} PDF</Link>)}{["CSV", "XLSX"].map(format => <Link key={format} href={`/api/rh/diarias/${row.id}?type=HISTORICO&format=${format}`} target="_blank" className="underline">Histórico {format}</Link>)}</div>
      </section>;
    })}
    <ErpPagination page={page} total={total} pageSize={20} label="diárias" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />
  </div>;
}
