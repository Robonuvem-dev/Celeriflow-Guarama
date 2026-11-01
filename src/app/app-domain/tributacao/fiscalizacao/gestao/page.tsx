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

export const dynamic = "force-dynamic";
const cls = "rounded border p-2 text-sm";
const text = (value: unknown) => typeof value === "string" ? value : "";
export default async function FiscalManagementPage({ searchParams }: { searchParams: Promise<{ orderId?: string; start?: string; end?: string; taxpayerId?: string; employeeId?: string; userId?: string; status?: string; model?: string; kind?: string }> }) {
  const query = await searchParams, context = await getTenantContextForModule("TRIBUTACAO"), database = context.database ?? db;
  const canManage = canPerformModuleOperation(context.user, "TRIBUTACAO", "update");
  const date = (value?: string, end = false) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`) : undefined;
  const start = date(query.start), end = date(query.end, true);
  const reportUser = query.userId ? (await database.select({ employeeId: users.employeeId }).from(users).where(eq(users.id, query.userId)).limit(1))[0] : undefined;
  const orders = await database.select().from(fiscalOrders).where(and(
    canManage ? undefined : eq(fiscalOrders.responsibleEmployeeId, context.user.employeeId ?? "SEM_VINCULO"),
    query.taxpayerId ? eq(fiscalOrders.taxpayerId, query.taxpayerId) : undefined,
    query.employeeId ? eq(fiscalOrders.responsibleEmployeeId, query.employeeId) : undefined,
    query.userId && !query.kind ? eq(fiscalOrders.createdByUsuarioId, query.userId) : undefined,
    query.model && !query.kind ? sql`${fiscalOrders.scope}->>'orderModel'=${query.model}` : undefined,
    query.status && !query.kind ? eq(fiscalOrders.status, query.status) : undefined,
    query.kind ? undefined : start ? gte(fiscalOrders.issuedAt, start) : undefined,
    query.kind ? undefined : end ? lte(fiscalOrders.issuedAt, end) : undefined,
  )).orderBy(desc(fiscalOrders.issuedAt));
  const [inspectors, documents] = await Promise.all([
    database.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
    orders.length ? database.select().from(fiscalDocuments).where(and(inArray(fiscalDocuments.orderId, orders.map(order => order.id)), query.kind ? eq(fiscalDocuments.documentKind, query.kind) : undefined, query.model ? eq(fiscalDocuments.templateCode, query.model) : undefined, query.userId && query.kind ? eq(fiscalDocuments.issuedByEmployeeId, reportUser?.employeeId ?? "SEM_VINCULO") : undefined, query.status && query.kind ? eq(fiscalDocuments.status, query.status) : undefined, query.kind && start ? gte(fiscalDocuments.issuedAt, start) : undefined, query.kind && end ? lte(fiscalDocuments.issuedAt, end) : undefined)).orderBy(desc(fiscalDocuments.issuedAt)) : [],
  ]);
  const selected = orders.find(order => order.id === query.orderId);
  const scope: JsonObject = selected?.scope && typeof selected.scope === "object" && !Array.isArray(selected.scope) ? selected.scope : {};
  const startPeriod = text(scope.periodStart), endPeriod = text(scope.periodEnd);
  const invoices = selected?.taxpayerId && startPeriod && endPeriod ? await database.select().from(taxInvoices).where(and(eq(taxInvoices.providerId, selected.taxpayerId), gte(taxInvoices.createdAt, new Date(`${startPeriod}T00:00:00Z`)), lte(taxInvoices.createdAt, new Date(`${endPeriod}T23:59:59.999Z`)))).orderBy(desc(taxInvoices.createdAt)) : [];
  const owner = Boolean(selected && context.user.employeeId === selected.responsibleEmployeeId && canManage);
  return <main className="space-y-5 p-4">
    <h1 className="text-xl font-bold">Gestão e relatórios da fiscalização</h1>
    <nav className="flex gap-4"><Link href="/tributacao/fiscalizacao">Ordens, apuração e modelos</Link><Link href="/tributacao/referencias?catalogo=procedimento-fiscal">Procedimentos fiscais</Link></nav>
    <form className="flex flex-wrap gap-3 print:hidden"><label>Início<input className={cls} name="start" type="date" defaultValue={query.start}/></label><label>Fim<input className={cls} name="end" type="date" defaultValue={query.end}/></label><label>ID contribuinte<input className={cls} name="taxpayerId" defaultValue={query.taxpayerId}/></label><label>ID usuário<input className={cls} name="userId" defaultValue={query.userId}/></label><label>Auditor<select className={cls} name="employeeId" defaultValue={query.employeeId}><option value="">Todos</option>{inspectors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Documento<select className={cls} name="kind" defaultValue={query.kind}><option value="">Ordens</option>{["ORDEM_INICIO", "TIAF", "TERMO_FISCAL", "ENCERRAMENTO", "AUTO_PRINCIPAL", "AUTO_ACESSORIA"].map(kind => <option key={kind}>{kind}</option>)}</select></label><label>Modelo<input className={cls} name="model" defaultValue={query.model}/></label><label>Situação<input className={cls} name="status" defaultValue={query.status}/></label><button className={cls}>Consultar</button></form>
    <p className="text-sm">Data de emissão, modelo, auditor responsável, situação e contribuinte. A listagem pode ser impressa pelo navegador.</p>
    <table className="w-full text-left text-sm"><thead><tr><th>Número</th><th>Contribuinte</th><th>Responsável</th><th>Emissão</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td>{order.orderNumber}</td><td>{order.taxpayerId ?? "Imóvel"}</td><td>{inspectors.find(item => item.id === order.responsibleEmployeeId)?.name ?? order.responsibleEmployeeId}</td><td>{order.issuedAt.toLocaleDateString("pt-BR")}</td><td>{order.status}</td><td><Link href={`?orderId=${order.id}`}>Detalhar</Link></td></tr>)}</tbody></table>
    <h2 className="font-bold">Documentos ({documents.length})</h2><ul>{documents.map(item => <li key={item.id}><Link href={`/tributacao/fiscalizacao/documentos/${item.id}`}>{item.documentNumber} — {item.documentKind} — {item.status} — {item.issuedAt.toLocaleDateString("pt-BR")} — imprimir</Link></li>)}</ul>
    {selected && <section className="space-y-4 rounded border p-4"><h2 className="font-bold">{selected.orderNumber}</h2><p>Procedimento: {text(scope.procedure) || "Não informado"} · Período: {startPeriod || "—"} a {endPeriod || "—"} · Prazo: {text(scope.dueDate) || "—"}</p>
      {owner && <form action={manageFiscalOrder} className="flex flex-wrap items-end gap-3 print:hidden"><input name="orderId" type="hidden" value={selected.id}/><label>Operação<select className={cls} name="operation"><option value="CONFIGURAR">Registrar procedimento, período e prazo</option><option value="PRORROGAR">Prorrogar prazo</option><option value="CANCELAR">Cancelar ordem</option><option value="ATRIBUIR">Incluir/alterar auditor no período</option><option value="ORDEM_INICIO">Gerar ordem de início para impressão</option><option value="TERMO_FISCAL">Lavrar termo fiscal</option></select></label><label>Procedimento<input className={cls} name="procedure" defaultValue={text(scope.procedure)}/></label><label>Código do modelo<input className={cls} name="orderModel" maxLength={80} defaultValue={text(scope.orderModel)}/></label><label>Período inicial<input className={cls} name="periodStart" type="date" defaultValue={startPeriod}/></label><label>Período final<input className={cls} name="periodEnd" type="date" defaultValue={endPeriod}/></label><label>Prazo<input className={cls} name="dueDate" type="date" defaultValue={text(scope.dueDate)}/></label><label>Auditor<select className={cls} name="employeeId">{inspectors.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Justificativa/conteúdo<textarea className={cls} name="reason" required minLength={5}/></label><button className={cls}>Registrar</button></form>}
      {Array.isArray(scope.auditors) && <ul>{scope.auditors.map((item, index) => item && typeof item === "object" && !Array.isArray(item) ? <li key={index}>{inspectors.find(employee => employee.id === item.employeeId)?.name ?? text(item.employeeId)}: {text(item.periodStart)} a {text(item.periodEnd)}</li> : null)}</ul>}
      <h3 className="font-semibold">Notas fiscais registradas no período ({invoices.length})</h3><ul>{invoices.map(invoice => <li key={invoice.id}>Nota {invoice.invoiceNumber} · {invoice.createdAt.toLocaleDateString("pt-BR")} · {String(invoice.serviceValueDecimal)} · {invoice.status}</li>)}</ul>
      {owner && <form action={assessFiscalPeriod} className="flex flex-wrap gap-3 print:hidden"><input type="hidden" name="orderId" value={selected.id}/><label>Competência<input className={cls} name="competence" type="month" required/></label>{[{name:"originalBase",label:"Base declarada"},{name:"assessedBase",label:"Base apurada"},{name:"rate",label:"Alíquota (%)"},{name:"manualPenalty",label:"Multa manual (R$)"},{name:"manualInterest",label:"Juros manuais (R$)"},{name:"manualCorrection",label:"Correção manual (R$)"}].map(field => <label key={field.name}>{field.label}<input className={cls} name={field.name} type="number" min="0" step="0.01" defaultValue="0" required/></label>)}<button className={cls}>Criar mapa de apuração</button></form>}
    </section>}
  </main>;
}
