import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { OperationForm } from "../operacoes/OperationForm";

export const dynamic = "force-dynamic";
export default async function TravelAllowancePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { prisma, user } = await getTenantContextForModule("RH");
  const where: Prisma.HrPortalRequestWhereInput = { kind: "DIARIA", ...(isSystemAdministrator(user) ? {} : { OR: user.allowedBudgetUnitIds.map(id => ({ payload: { path: ["input", "budgetUnitId"], equals: id } })) }) };
  const total = await prisma.hrPortalRequest.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt((await searchParams).page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await prisma.hrPortalRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 });
  const employees = await prisma.employee.findMany({ where: { id: { in: [...new Set(rows.map(row => row.employeeId))] } }, select: { id: true, name: true } });
  const employeeNames = new Map(employees.map(employee => [employee.id, employee.name]));
  const rules = await prisma.hrPayrollRule.findMany({ where: { code: "DIARIAS_MUNICIPAIS", isActive: true, ruleSet: { isDemo: false, scope: "PRODUCAO", status: "ATIVA" } }, orderBy: { id: "asc" } });
  const units = await prisma.budgetUnit.findMany({ where: isSystemAdministrator(user) ? {} : { id: { in: user.allowedBudgetUnitIds } }, orderBy: { code: "asc" } });
  const expenses = await prisma.expense.findMany({ where: { sourceModule: "RH", sourceType: "TRAVEL_ALLOWANCE", sourceId: { in: rows.map(row => row.id) } }, select: { id: true, sourceId: true, status: true } });
  const processEvents = await prisma.hrIntegrationEvent.findMany({ where: { eventType: "DIARIA_PROCESSO_ABERTO", sourceKey: { in: rows.map(row => `DIARIA:PROCESSO:${row.id}`) } }, select: { sourceKey: true, payload: true } });
  const processTypes = await prisma.processType.findMany({ where: { isActive: true, genericWorkflowEnabled: true, genericWorkflowDefinitions: { some: { status: "PUBLISHED", stages: { every: { department: { secretariatId: { in: units.map(unit => unit.secretariatId) } } } } } } }, include: { subjects: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } });
  const reports = new Set((await prisma.hrIntegrationEvent.findMany({ where: { sourceKey: { in: rows.map(row => `DIARIA:PRESTACAO:${row.id}`) } }, select: { sourceKey: true } })).map(event => event.sourceKey));
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
