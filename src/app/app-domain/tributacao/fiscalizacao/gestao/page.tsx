import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { JsonObject } from "@/db/json";
import { employees } from "@/db/schema/administration";
import { users } from "@/db/schema/identity";
import { fiscalDocuments, fiscalOrders } from "@/db/schema/taxation-inspection";
import { taxInvoices } from "@/db/schema/taxation-nfse";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assessFiscalPeriod, manageFiscalOrder } from "./actions";
import { FileText, Printer, Download, Filter, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const cls = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";
const text = (value: unknown) => (typeof value === "string" ? value : "");

export default async function FiscalManagementPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    start?: string;
    end?: string;
    taxpayerId?: string;
    employeeId?: string;
    userId?: string;
    status?: string;
    model?: string;
    kind?: string;
  }>;
}) {
  const query = await searchParams;
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;
  const canManage = canPerformModuleOperation(context.user, "TRIBUTACAO", "update");

  const date = (value?: string, end = false) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
      ? new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`)
      : undefined;

  const start = date(query.start);
  const end = date(query.end, true);

  const reportUser = query.userId
    ? (await database.select({ employeeId: users.employeeId }).from(users).where(eq(users.id, query.userId)).limit(1))[0]
    : undefined;

  const orders = await database
    .select()
    .from(fiscalOrders)
    .where(
      and(
        canManage ? undefined : eq(fiscalOrders.responsibleEmployeeId, context.user.employeeId ?? "SEM_VINCULO"),
        query.taxpayerId ? eq(fiscalOrders.taxpayerId, query.taxpayerId) : undefined,
        query.employeeId ? eq(fiscalOrders.responsibleEmployeeId, query.employeeId) : undefined,
        query.userId && !query.kind ? eq(fiscalOrders.createdByUsuarioId, query.userId) : undefined,
        query.model && !query.kind ? sql`${fiscalOrders.scope}->>'orderModel'=${query.model}` : undefined,
        query.status && !query.kind ? eq(fiscalOrders.status, query.status) : undefined,
        query.kind ? undefined : start ? gte(fiscalOrders.issuedAt, start) : undefined,
        query.kind ? undefined : end ? lte(fiscalOrders.issuedAt, end) : undefined
      )
    )
    .orderBy(desc(fiscalOrders.issuedAt));

  const [inspectors, documents] = await Promise.all([
    database
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name)),
    orders.length
      ? database
          .select()
          .from(fiscalDocuments)
          .where(
            and(
              inArray(
                fiscalDocuments.orderId,
                orders.map((order) => order.id)
              ),
              query.kind ? eq(fiscalDocuments.documentKind, query.kind) : undefined,
              query.model ? eq(fiscalDocuments.templateCode, query.model) : undefined,
              query.userId && query.kind
                ? eq(fiscalDocuments.issuedByEmployeeId, reportUser?.employeeId ?? "SEM_VINCULO")
                : undefined,
              query.status && query.kind ? eq(fiscalDocuments.status, query.status) : undefined,
              query.kind && start ? gte(fiscalDocuments.issuedAt, start) : undefined,
              query.kind && end ? lte(fiscalDocuments.issuedAt, end) : undefined
            )
          )
          .orderBy(desc(fiscalDocuments.issuedAt))
      : [],
  ]);

  const selected = orders.find((order) => order.id === query.orderId);
  const scope: JsonObject = selected?.scope && typeof selected.scope === "object" && !Array.isArray(selected.scope) ? selected.scope : {};
  const startPeriod = text(scope.periodStart);
  const endPeriod = text(scope.periodEnd);
  const invoices =
    selected?.taxpayerId && startPeriod && endPeriod
      ? await database
          .select()
          .from(taxInvoices)
          .where(
            and(
              eq(taxInvoices.providerId, selected.taxpayerId),
              gte(taxInvoices.createdAt, new Date(`${startPeriod}T00:00:00Z`)),
              lte(taxInvoices.createdAt, new Date(`${endPeriod}T23:59:59.999Z`))
            )
          )
          .orderBy(desc(taxInvoices.createdAt))
      : [];

  const owner = Boolean(selected && context.user.employeeId === selected.responsibleEmployeeId && canManage);

  const filterParams = new URLSearchParams();
  if (query.start) filterParams.set("start", query.start);
  if (query.end) filterParams.set("end", query.end);
  if (query.taxpayerId) filterParams.set("taxpayerId", query.taxpayerId);
  if (query.employeeId) filterParams.set("employeeId", query.employeeId);
  if (query.status) filterParams.set("status", query.status);
  if (query.model) filterParams.set("model", query.model);
  if (query.kind) filterParams.set("kind", query.kind);

  return (
    <main className="space-y-4 p-4 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/tributacao/fiscalizacao"
              className="inline-flex size-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="Voltar ao Painel Geral de Fiscalização"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Gestão e Relatórios da Fiscalização Tributária
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Acompanhamento de Ordens de Serviço, emissão de TIAF, Termos e Autos de Infração (CF22).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link
            href="/tributacao/fiscalizacao"
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Painel Geral
          </Link>
          <Link
            href="/tributacao/referencias?catalogo=procedimento-fiscal"
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Procedimentos Fiscais
          </Link>
          <a
            href={`/api/tributacao/fiscalizacao/relatorios?${filterParams.toString()}&format=html`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="size-3.5 text-slate-500" />
            Imprimir / PDF
          </a>
          <a
            href={`/api/tributacao/fiscalizacao/relatorios?${filterParams.toString()}&format=xls`}
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="size-3.5 text-slate-500" />
            Exportar XLS
          </a>
          <a
            href={`/api/tributacao/fiscalizacao/relatorios?${filterParams.toString()}&format=txt`}
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="size-3.5 text-slate-500" />
            Exportar TXT
          </a>
        </div>
      </div>

      {/* Faixa de Filtros */}
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm print:hidden">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
          <Filter className="size-3.5 text-blue-600" />
          Filtros Operacionais por Período, Situação e Contribuinte
        </div>
        <form className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          <div>
            <label className="text-[11px] font-medium text-slate-600">Início</label>
            <input className={cls} name="start" type="date" defaultValue={query.start} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">Fim</label>
            <input className={cls} name="end" type="date" defaultValue={query.end} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">ID Contribuinte</label>
            <input className={cls} name="taxpayerId" placeholder="CPF/CNPJ ou ID" defaultValue={query.taxpayerId} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">Auditor Responsável</label>
            <select className={cls} name="employeeId" defaultValue={query.employeeId}>
              <option value="">Todos</option>
              {inspectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">Tipo Documento</label>
            <select className={cls} name="kind" defaultValue={query.kind}>
              <option value="">Todas as Ordens</option>
              {["ORDEM_INICIO", "TIAF", "TERMO_FISCAL", "ENCERRAMENTO", "AUTO_PRINCIPAL", "AUTO_ACESSORIA"].map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">Código do Modelo</label>
            <input className={cls} name="model" placeholder="Ex: TIAF-01" defaultValue={query.model} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">Situação</label>
            <select className={cls} name="status" defaultValue={query.status}>
              <option value="">Todas</option>
              <option value="ABERTA">ABERTA</option>
              <option value="EM_ANDAMENTO">EM ANDAMENTO</option>
              <option value="ENCERRADA">ENCERRADA</option>
              <option value="CANCELADA">CANCELADA</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex h-8 w-full items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Consultar
            </button>
          </div>
        </form>
      </section>

      {/* Grade de Ordens de Fiscalização */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
          <span>Ordens de Serviço de Fiscalização ({orders.length})</span>
          <span className="text-[11px] text-slate-500">Clique em &ldquo;Detalhar / Ações&rdquo; para gerenciar prazos, emitir termos ou encerrar</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2">Número OS</th>
                <th className="px-3 py-2">Contribuinte</th>
                <th className="px-3 py-2">Auditor Responsável</th>
                <th className="px-3 py-2">Emissão</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    Nenhuma ordem de fiscalização encontrada para os filtros informados.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isSelected = order.id === selected?.id;
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-50/80 ${isSelected ? "bg-blue-50/60 font-medium" : ""}`}
                    >
                      <td className="px-3 py-2 font-mono text-slate-900">{order.orderNumber}</td>
                      <td className="px-3 py-2">{order.taxpayerId ?? "Imóvel / Genérico"}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {inspectors.find((item) => item.id === order.responsibleEmployeeId)?.name ??
                          order.responsibleEmployeeId}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{order.issuedAt.toLocaleDateString("pt-BR")}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            order.status === "ABERTA"
                              ? "bg-blue-100 text-blue-700"
                              : order.status === "ENCERRADA"
                              ? "bg-emerald-100 text-emerald-700"
                              : order.status === "CANCELADA"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`?${new URLSearchParams({
                            ...Object.fromEntries(filterParams.entries()),
                            orderId: order.id,
                          }).toString()}`}
                          className="inline-flex h-6 items-center rounded border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          {isSelected ? "Selecionada" : "Detalhar / Ações"}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Documentos emitidos */}
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
          <FileText className="size-3.5 text-blue-600" />
          Documentos, Autos e Termos Lavrados ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Nenhum termo ou auto emitido no escopo das ordens listadas.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {documents.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/50 p-2 text-xs"
              >
                <div>
                  <strong className="block text-slate-800">{item.documentNumber}</strong>
                  <span className="text-[11px] text-slate-500">
                    {item.documentKind.replaceAll("_", " ")} · {item.issuedAt.toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <Link
                  href={`/tributacao/fiscalizacao/documentos/${item.id}`}
                  className="inline-flex h-6 items-center gap-1 rounded bg-white px-2 text-[11px] font-semibold text-blue-700 border border-slate-200 hover:bg-slate-50"
                  target="_blank"
                >
                  <Printer className="size-3" /> Imprimir
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Painel da Ordem Selecionada */}
      {selected && (
        <section className="space-y-4 rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
          <div className="border-b border-slate-200 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Ordem de Fiscalização: {selected.orderNumber}
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  Procedimento: <strong>{text(scope.procedure) || "Não informado"}</strong> · Período Fiscalizado:{" "}
                  <strong>{startPeriod || "—"} a {endPeriod || "—"}</strong> · Prazo de Cumprimento:{" "}
                  <strong>{text(scope.dueDate) || "—"}</strong> · Situação: <strong>{selected.status}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/tributacao/fiscalizacao/documentos/${selected.id}`}
                  target="_blank"
                  className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="size-3.5 text-slate-500" />
                  Imprimir Ordem
                </a>
              </div>
            </div>
          </div>

          {/* Ações da Ordem (Prorrogar, Termos, Autos, Encerramento) */}
          {owner ? (
            <div className="rounded border border-blue-100 bg-blue-50/40 p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-900">
                Ações Operacionais do Auditor Responsável
              </h3>
              <form action={manageFiscalOrder} className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4 print:hidden">
                <input name="orderId" type="hidden" value={selected.id} />
                <div className="md:col-span-2">
                  <label className="text-[11px] font-medium text-slate-700">Operação a Executar</label>
                  <select className={cls} name="operation">
                    <option value="CONFIGURAR">Configurar Procedimento, Período e Prazo</option>
                    <option value="PRORROGAR">Prorrogar Prazo de Cumprimento</option>
                    <option value="TIAF">Emitir TIAF — Termo de Início de Ação Fiscal (22.31)</option>
                    <option value="TERMO_FISCAL">Lavrar Termo Fiscal / Notificação (22.32)</option>
                    <option value="AUTO_PRINCIPAL">Lavrar Auto de Infração — Obrigação Principal (22.33)</option>
                    <option value="AUTO_ACESSORIA">Lavrar Auto de Infração — Obrigação Acessória (22.34)</option>
                    <option value="TERMO_ENCERRAMENTO">Lavrar Termo de Encerramento (22.35)</option>
                    <option value="ENCERRAR">Concluir e Encerrar Fiscalização</option>
                    <option value="CANCELAR">Cancelar Ordem de Fiscalização</option>
                    <option value="ATRIBUIR">Designar / Alterar Auditor no Período</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Procedimento Fiscal</label>
                  <input className={cls} name="procedure" defaultValue={text(scope.procedure)} placeholder="Ex: Auditoria ISS" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Código do Modelo</label>
                  <input className={cls} name="orderModel" maxLength={80} defaultValue={text(scope.orderModel)} placeholder="Ex: TIAF-PADRAO" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Período Inicial</label>
                  <input className={cls} name="periodStart" type="date" defaultValue={startPeriod} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Período Final</label>
                  <input className={cls} name="periodEnd" type="date" defaultValue={endPeriod} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Prazo de Cumprimento</label>
                  <input className={cls} name="dueDate" type="date" defaultValue={text(scope.dueDate)} />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Auditor Designado</label>
                  <select className={cls} name="employeeId">
                    {inspectors.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3 lg:col-span-4">
                  <label className="text-[11px] font-medium text-slate-700">
                    Justificativa / Fundamentação Legal / Conteúdo do Termo
                  </label>
                  <textarea
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    rows={2}
                    name="reason"
                    required
                    minLength={5}
                    placeholder="Informe a motivação, enquadramento legal ou intimação para o termo..."
                  />
                </div>
                <div className="md:col-span-3 lg:col-span-4 flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white shadow hover:bg-blue-700"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Registrar Operação na Ordem
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              <span>
                As ações operacionais de prorrogação, encerramento e emissão de termos nesta ordem são privativas do auditor responsável designado ({selected.responsibleEmployeeId}).
              </span>
            </div>
          )}

          {/* Auditores e Histórico de Atribuição */}
          {Array.isArray(scope.auditors) && scope.auditors.length > 0 && (
            <div className="rounded border border-slate-200 p-3 text-xs">
              <strong className="block font-semibold text-slate-800">Equipe de Auditores Designados no Período:</strong>
              <ul className="mt-1 list-disc pl-4 text-slate-600">
                {scope.auditors.map((item, index) =>
                  item && typeof item === "object" && !Array.isArray(item) ? (
                    <li key={index}>
                      {inspectors.find((employee) => employee.id === item.employeeId)?.name ?? text(item.employeeId)}:{" "}
                      {text(item.periodStart)} a {text(item.periodEnd)}
                    </li>
                  ) : null
                )}
              </ul>
            </div>
          )}

          {/* Manutenção de Documentos Recebidos e Notas Fiscais no Período (22.46) */}
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Documentos Fiscais Eletrônicos Recebidos / Apurados no Período ({invoices.length}) — Item 22.46
            </h3>
            {invoices.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Nenhuma nota fiscal encontrada para o contribuinte no período selecionado ({startPeriod || "—"} a {endPeriod || "—"}).
              </p>
            ) : (
              <div className="mt-2 max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-1">Nº Nota</th>
                      <th className="px-2 py-1">Data</th>
                      <th className="px-2 py-1">Valor do Serviço</th>
                      <th className="px-2 py-1">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-2 py-1 font-mono">{inv.invoiceNumber}</td>
                        <td className="px-2 py-1">{inv.createdAt.toLocaleDateString("pt-BR")}</td>
                        <td className="px-2 py-1">R$ {String(inv.serviceValueDecimal)}</td>
                        <td className="px-2 py-1">{inv.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Apuração e Criação de Mapa Fiscal (22.46 & 22.28) */}
          {owner && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Apuração Fiscal por Competência & Cálculo de Penalidades (22.28 / 22.46)
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Gere o mapa de apuração por competência com cálculo de base tributável, alíquota, juros e multas.
              </p>
              <form action={assessFiscalPeriod} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 print:hidden">
                <input type="hidden" name="orderId" value={selected.id} />
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Competência</label>
                  <input className={cls} name="competence" type="month" required />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Base Declarada</label>
                  <input className={cls} name="originalBase" type="number" min="0" step="0.01" defaultValue="0" required />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Base Apurada</label>
                  <input className={cls} name="assessedBase" type="number" min="0" step="0.01" defaultValue="0" required />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Alíquota (%)</label>
                  <input className={cls} name="rate" type="number" min="0" step="0.01" defaultValue="5.00" required />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Multa / Penalidade (R$)</label>
                  <input className={cls} name="manualPenalty" type="number" min="0" step="0.01" defaultValue="0" required />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Juros (R$)</label>
                  <input className={cls} name="manualInterest" type="number" min="0" step="0.01" defaultValue="0" required />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Correção (R$)</label>
                  <input className={cls} name="manualCorrection" type="number" min="0" step="0.01" defaultValue="0" required />
                </div>
                <div className="col-span-full flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex h-8 items-center gap-1 rounded bg-emerald-600 px-3 text-xs font-semibold text-white shadow hover:bg-emerald-700"
                  >
                    Gravar Mapa de Apuração
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
