import { notFound } from "next/navigation";
import Link from "next/link";
import { AccessError, getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { readBenefitStatement, readBenefitReconciliation } from "@/lib/sst/benefit-query";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sstDatabase } from "@/lib/sst/database";
import { SstForm } from "../../SstForm";
import { saveBenefitEntry, generateMonthly, approveBenefitPosting, saveBenefitPayrollMapping, saveBenefitPayrollScope, compensateBenefitCharge } from "../actions";
import { BenefitStatement } from "../BenefitStatement";

export default async function BenefitDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; page?: string; print?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const context = query.print === "1" ? await getTenantContextForModuleOperation("SST", "issueReports") : await getTenantContextForModule("SST");
  const current = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
  const [year, month] = current.split("-");
  const competence = `${month}/${year}`;
  const data = await readBenefitStatement(context, id, { from: query.from ?? competence, to: query.to ?? competence, page: query.page });
  if (!data) notFound();
  const rh = await getTenantContextForModule("RH").catch((error: unknown) => { if (error instanceof AccessError) return null; throw error; });
  const reconciliation = rh ? await readBenefitReconciliation(context, id, data.to) : null;
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: query.print === "1" ? auditEventTypes.reportIssued : auditEventTypes.pageView, targetType: "SST_BENEFIT_STATEMENT", targetId: id });
  const field = "block w-full rounded border p-2";
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Plano de saúde — ficha e demonstrativo</h1><div className="flex gap-4 print:hidden"><Link className="underline" href="/sst/planos">Voltar</Link><Link className="underline" href={`/sst/planos/${id}?${new URLSearchParams({ from: data.from, to: data.to, print: "1" })}`}>Emissão do demonstrativo</Link></div>
    {query.print === "1" && <p>Demonstrativo contratual emitido em {new Date().toISOString()}. Utilize a impressão do navegador; não é comprovante fiscal de rendimentos.</p>}
    <BenefitStatement data={data} base={`/sst/planos/${id}`}/>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Conciliação de folha · {data.to}</h2>{reconciliation ? reconciliation.map((row) => <article key={row.category} className="break-words"><h3>{row.category} · eventos postados {row.eventId ?? "nenhum"}</h3><p>Ledger R$ {row.expected} · postado por origem R$ {row.observed} · diferença R$ {row.difference}</p><p>Situação: {row.status} · pendências {row.issues.join(" · ")}</p></article>) : <p>Consulta de itens da folha exige acesso adicional ao módulo RH.</p>}</section>
    {rh && query.print !== "1" && <section className="space-y-4"><h2 className="font-semibold">Integração real RH/Folha</h2>
      <SstForm action={saveBenefitPayrollScope} label="Vincular folha ao escopo oficial da UG"><input type="hidden" name="planId" value={data.beneficiary.planId}/><label>ID da folha mensal aberta<input required name="payrollId" className={field}/></label><p>A entidade é obtida do mapeamento oficial UG/entidade do RH. Itens existentes precisam pertencer ao mesmo histórico funcional; o escopo não é inferido da lotação atual.</p></SstForm>
      <SstForm action={approveBenefitPosting} label="Aprovar e postar origem contratual"><label>ID do lançamento<input required name="entryId" className={field}/></label><label>ID da folha mensal aberta<input required name="payrollId" className={field}/></label><p>A validação usa histórico RH da UG/regime, política de cálculo, rubricas e eventos explícitos. Repetir a aprovação mantém o mesmo item de folha.</p></SstForm>
      <SstForm action={saveBenefitPayrollMapping} label="Registrar mapeamento contratual de folha"><input type="hidden" name="planId" value={data.beneficiary.planId}/><div className="grid gap-3 sm:grid-cols-2"><label>Vigência inicial<input required name="startsAt" type="date" className={field}/></label><label>Vigência final<input required name="endsAt" type="date" className={field}/></label></div>{[["monthlyRubricId","Rubrica MANUAL de mensalidade"],["monthlyEventId","Evento de desconto de mensalidade"],["extraordinaryRubricId","Rubrica MANUAL extraordinária"],["extraordinaryEventId","Evento de desconto extraordinário"],["refundRubricId","Rubrica MANUAL de provento da devolução (opcional)"],["refundEventId","Evento Vencimento da devolução (opcional)"]].map(([name,label]) => <label key={name}>{label}<input name={name} required={!name.startsWith("refund")} className={field}/></label>)}<label>Referência contratual do mapeamento<input required name="contractReference" className={field}/></label></SstForm>
      <SstForm action={compensateBenefitCharge} label="Cancelar cobrança por compensação imutável"><label>ID da cobrança já postada<input required name="entryId" className={field}/></label><label>Competência aberta da devolução<input required name="competence" defaultValue={data.to} className={field}/></label><label>ID da folha aberta da devolução<input required name="payrollId" className={field}/></label><label>Justificativa (mínimo 10 caracteres)<input required minLength={10} name="reason" className={field}/></label><p>Gera e posta o saldo ainda não devolvido. A cobrança original e os pagamentos fechados são preservados. Sem configuração válida, a transação inteira é revertida.</p></SstForm>
    </section>}
    <div className="space-y-4 print:hidden"><SstForm action={generateMonthly} label="Gerar mensalidade contratual (candidato)"><input type="hidden" name="beneficiaryId" value={id}/><label>Competência<input required name="competence" defaultValue={data.to} className={field}/></label><p>Operação idempotente, somente mês com cobertura completa. Sem descontos automáticos.</p></SstForm>
    <SstForm action={saveBenefitEntry} label="Registrar despesa / devolução"><input type="hidden" name="beneficiaryId" value={id}/><label>Competência<input required name="competence" defaultValue={data.to} className={field}/></label><label>Tipo<select name="kind" className={field}><option value="EXTRAORDINARY">Despesa extraordinária</option><option value="REFUND">Devolução de cobrança</option></select></label><label>Valor positivo (a devolução será gravada negativa)<input required name="amount" inputMode="decimal" className={field}/></label><label>ID da cobrança original (somente devolução)<input name="refundOfId" className={field}/></label><label>Referência única da origem<input required name="sourceReference" className={field}/></label><label>Justificativa<input required name="reason" className={field}/></label></SstForm></div>
  </div>;
}
