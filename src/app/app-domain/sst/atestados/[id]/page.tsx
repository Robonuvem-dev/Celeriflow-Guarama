import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule, canPerformModuleOperation, canViewModule } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { assessSstCertificate, attachSstCertificateDocument } from "../../actions";
import { SstForm } from "../../SstForm";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { z } from "zod";
import { confirmSstLeave, reviseSstDecision, reconcileSstLeavePayroll } from "../functional-actions";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function SstCertificatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ personQ?: string; confirmLeave?: string; receipt?: string; page?: string }> }) {
  const { id } = await params;
  const { personQ, confirmLeave, receipt, page: requestedPage } = await searchParams;
  const context = await getTenantContextForModule("SST");
  const scope = await context.prisma.sstMedicalCertificate.findUnique({ where: { id }, select: { budgetUnitId: true } });
  if (!scope) notFound();
  await assertSstClinicalAccess(context, scope.budgetUnitId);
  const record = await context.prisma.sstMedicalCertificate.findUniqueOrThrow({ where: { id }, include: { employee: { select: { name: true, registration: true } }, issuer: { select: { fullName: true } }, reason: true, budgetUnit: { select: { name: true } }, assessments: { include: { examiner: { select: { fullName: true } } }, orderBy: { assessedAt: "desc" } }, documents: { include: { document: { select: { id: true, fileUrl: true } } } } } });
  const examiners = personQ && personQ.trim().length >= 3 ? await context.prisma.person.findMany({ where: { fullName: { contains: personQ.trim(), mode: "insensitive" } }, take: 20, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true } }) : [];
  const boards = await context.prisma.sstMedicalBoard.findMany({ where: { budgetUnitId: record.budgetUnitId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 });
  const policy = z.object({ name: z.string(), createLeaveOnApproval: z.boolean(), suggestLeave: z.boolean() }).parse(record.reasonSnapshot ?? record.reason);
  const revisions = await context.prisma.$queryRaw<{ id: string; decision: string; reason: string; examinerCouncil: string; createdAt: Date; reconciliation: { status: string } }[]>`SELECT id,decision,reason,"examinerCouncil","createdAt",reconciliation FROM "SstCertificateDecisionRevision" WHERE "certificateId"=${id} ORDER BY revision DESC`;
  const confirmation = await context.prisma.$queryRaw<{ confirmed: boolean }[]>`SELECT confirmed FROM "SstCertificateLeaveConfirmation" WHERE "certificateId"=${id}`;
  const financialRead = canViewModule(context.user, "RH");
  const [financialCount] = financialRead ? await context.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "SstLeavePayrollOrigin" WHERE "certificateId"=${id}` : [{ total: 0 }];
  const financialPage = Math.min(Math.max(1, Math.trunc(Number(requestedPage)) || 1), Math.max(1, Math.ceil(financialCount.total / 20)));
  const financialValues = { personQ, confirmLeave, receipt };
  const financialHref = (page: number) => `/sst/atestados/${id}?${new URLSearchParams({ personQ: personQ || "", confirmLeave: confirmLeave || "", receipt: receipt || "", page: String(page) })}`;
  const financial = financialRead ? await context.prisma.$queryRaw<{ id: string; kind: string; competence: string; amount: string; payrollId: string; payrollItemId: string; compensated: boolean }[]>`SELECT o.id,o.kind,o.competence,o."amountDecimal"::text AS amount,o."payrollId",o."payrollItemId",EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" r WHERE r."reversesId"=o.id) AS compensated FROM "SstLeavePayrollOrigin" o WHERE o."certificateId"=${id} ORDER BY o."createdAt" DESC,o.id LIMIT 20 OFFSET ${(financialPage - 1) * 20}` : [];
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_CLINICAL_CERTIFICATE", targetId: id });
  return <div className="space-y-4 p-4"><header><h1 className="text-xl font-semibold">Atestado · {record.protocolNumber}</h1><Link href="/sst/atestados">Voltar à consulta</Link></header>
    <section className="space-y-2 rounded border p-4"><p>{record.employee.name} · Matrícula {record.employee.registration} · {record.budgetUnit.name}</p><p>{record.reason.name} · {record.status}</p><p>Período: {record.startsAt.toLocaleString("pt-BR")} a {record.endsAt.toLocaleString("pt-BR")}</p><p>Entrega: {record.presentedAt.toLocaleString("pt-BR")}</p><p>Emitente: {record.issuer.fullName} · {record.issuerCouncil}</p><p>CIDs: {record.cidCodes.join(", ") || "Não informados"}</p><p>Parentesco: {record.relationship || "Não se aplica"}</p><Link className="text-teal-700 underline" href={`/sst/atestados/${id}/comprovante`}>Comprovante de entrega</Link>{record.leaveId && <p>Afastamento vinculado no RH: {record.leaveId}</p>}</section>
    {record.processId && <p>Processo digital vinculado: {record.processId}</p>}
    {confirmLeave === "1" && policy.suggestLeave && record.status === "RECEIVED" && !confirmation.length && <section role="dialog" aria-modal="false" aria-labelledby="leave-confirm-title" className="space-y-3 rounded border-2 border-teal-700 p-4"><h2 id="leave-confirm-title" className="font-semibold">Confirmar afastamento sugerido</h2><p>Confirme a intenção de gerar o afastamento canônico após deferimento. O cadastro ainda depende da decisão pericial e autorização RH.</p><SstForm action={confirmSstLeave} label="Registrar confirmação"><input type="hidden" name="certificateId" value={id}/><label><input type="checkbox" name="confirmed"/> Confirmar geração após deferimento</label></SstForm>{receipt === "1" && <Link className="underline" href={`/sst/atestados/${id}/comprovante?print=1`}>Imprimir comprovante de entrega</Link>}</section>}
    {!!confirmation.length && <p>Confirmação inicial: {confirmation[0].confirmed ? "Gerar afastamento após deferimento" : "Sem geração solicitada"}.</p>}
    {financialRead && <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Reflexos configurados e reconciliação RH/Folha</h2>
      <p>Tarifa, BRL, arredondamento, fundamento legal e eventual crédito compensatório vêm da regra RH aprovada. Somente minutos atestados sobre jornada planejada entram no cálculo.</p>
      {canPerformModuleOperation(context.user, "SST", "update") && canPerformModuleOperation(context.user, "RH", "update") && <SstForm action={reconcileSstLeavePayroll} label="Executar reconciliação configurada">
        <input type="hidden" name="certificateId" value={id}/>
        <label>Operação<select name="operation" className="block rounded border p-2"><option value="POST">Postar reflexo da decisão aprovada</option><option value="REVERSE">Compensar origem anterior</option></select></label>
        <label>ID da folha mensal de destino<input required name="payrollId" className="block w-full rounded border p-2"/></label>
        <label>ID da regra RH CALCULO/JSON aprovada<input required name="ruleId" className="block w-full rounded border p-2"/></label>
        <label>Origem para compensar<select name="originId" className="block w-full rounded border p-2"><option value="">Somente para compensação</option>{financial.filter((o) => o.kind === "POST").map((o) => <option key={o.id} value={o.id}>{o.competence} · R$ {o.amount} · {o.id}</option>)}</select></label>
        <label>Justificativa da compensação<input name="reason" minLength={10} className="block w-full rounded border p-2"/></label>
        <label><input type="checkbox" name="confirmPayrollScope"/> Confirmo documentalmente que a folha selecionada pertence à UG/entidade deste atestado, caso ainda não tenha escopo explícito</label>
        <label>Documento de comprovação do escopo da folha<input name="scopeSourceReference" minLength={10} className="block w-full rounded border p-2"/></label>
      </SstForm>}
      {financial.map((o) => <article key={o.id} className="rounded border p-2"><p>{o.kind === "POST" ? "Reflexo postado" : "Compensação postada"} · {o.competence} · R$ {o.amount}{o.compensated ? " · Compensado" : ""}</p><p className="break-all">Origem: {o.id} · Item canônico: {o.payrollItemId} · Folha: {o.payrollId}</p></article>)}
      <ErpPagination label="origens financeiras" page={financialPage} total={financialCount.total} pageSize={20} previousHref={financialHref(financialPage - 1)} nextHref={financialHref(financialPage + 1)} jumpTo={{ pathname: `/sst/atestados/${id}`, values: financialValues }}/>
      <p>Postagem não comprova pagamento bancário. Competência fechada é preservada; compensação exige destino aberto e mapeamento aprovado.</p>
    </section>}
    <section className="rounded border p-4"><h2 className="font-semibold">Anexos no repositório GED</h2>{record.documents.map((item, index) => <p key={item.id}><a className="text-teal-700 underline" href={`/api/download?url=${encodeURIComponent(item.document.fileUrl)}`} target="_blank" rel="noreferrer">Anexo {index + 1}</a></p>)}</section>
    <SstForm action={attachSstCertificateDocument} label="Anexar documento"><input type="hidden" name="certificateId" value={id}/><label>Anexo (PDF, JPG ou PNG, até 10 MB)<input required name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="block p-2"/></label></SstForm>
    {record.status === "RECEIVED" && <>
      <h2 className="text-lg font-semibold">Perícia · {policy.name}</h2>
      <form className="flex flex-wrap gap-2"><input name="personQ" defaultValue={personQ} placeholder="Pesquisar perito no Cadastro Único" className="rounded border p-2"/><button className="rounded border p-2">Pesquisar</button></form>
      <SstForm action={assessSstCertificate} label="Registrar decisão">
        <input type="hidden" name="certificateId" value={id}/>
        <label>Junta médica (opcional)<select name="boardId" className="block w-full rounded border p-2"><option value="">Perícia individual</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label>
        <label>Perito<select required name="examinerPersonId" className="block w-full rounded border p-2"><option value="">Pesquise o profissional acima</option>{examiners.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
        <label>Registro do conselho<input required name="examinerCouncil" className="block w-full rounded border p-2"/></label>
        <label>Data/hora da perícia<input required type="datetime-local" name="assessedAt" className="block rounded border p-2"/></label>
        <label>Decisão<select name="decision" className="block rounded border p-2"><option value="APPROVED">Deferir</option><option value="REJECTED">Indeferir</option></select></label>
        <label>Parecer<textarea required minLength={10} name="opinion" className="block min-h-24 w-full rounded border p-2"/></label>
        <label><input type="checkbox" name="confirmLeave" className="mr-2"/>Confirmar afastamento no RH quando deferido</label>
        {policy.createLeaveOnApproval && <p>Este motivo gera afastamento automaticamente ao deferir; é necessária permissão de inclusão no RH.</p>}
        {policy.suggestLeave && <p>O motivo sugere confirmar a geração do afastamento.</p>}
      </SstForm>
    </>}
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Histórico pericial</h2>{record.assessments.map((item) => <article key={item.id}><p>{item.assessedAt.toLocaleString("pt-BR")} · {item.examiner.fullName} · {item.examinerCouncil} · {item.decision}</p><p className="whitespace-pre-wrap">{item.opinion}</p></article>)}</section>
    {record.status !== "RECEIVED" && <section className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Retificação/revogação transacional</h2>
      <p>Preserva decisões e licenças anteriores. Compense as origens monetárias antes de alterar a decisão. Competência fechada/paga é preservada; reflexos legados não conciliados bloqueiam a alteração.</p>
      <form className="flex gap-2"><input name="personQ" defaultValue={personQ} minLength={3} placeholder="Pesquisar perito" className="rounded border p-2"/><button>Pesquisar</button></form>
      <SstForm action={reviseSstDecision} label="Registrar nova decisão">
        <input type="hidden" name="certificateId" value={id}/><input type="hidden" name="expectedStatus" value={record.status}/><input type="hidden" name="expectedRevisionId" value={revisions[0]?.id || ""}/>
        <label>Nova decisão<select name="decision" className="block rounded border p-2"><option value="REVOKED">Revogar</option><option value="APPROVED">Deferir</option><option value="REJECTED">Indeferir</option></select></label>
        <label>Perito<select name="examinerPersonId" required className="block rounded border p-2"><option value="">Pesquise acima</option>{examiners.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>
        <label>Conselho<input name="examinerCouncil" required minLength={3} className="block rounded border p-2"/></label><label>Justificativa/parecer<textarea name="reason" required minLength={10} className="block w-full rounded border p-2"/></label>
        <label><input type="checkbox" name="confirmLeave"/> Confirmar nova licença se deferido</label>
      </SstForm>
    </section>}
    <section className="space-y-3"><h2 className="font-semibold">Histórico imutável de retificações</h2>{revisions.map((r) => <article key={r.id} className="rounded border p-3"><p>{r.createdAt.toLocaleString("pt-BR")} · {r.decision} · {r.examinerCouncil}</p><p className="whitespace-pre-wrap">{r.reason}</p><p>Reconciliação registrada na decisão: {r.reconciliation.status}. Consulte as origens monetárias e compensações preservadas acima.</p></article>)}</section>
  </div>;
}
