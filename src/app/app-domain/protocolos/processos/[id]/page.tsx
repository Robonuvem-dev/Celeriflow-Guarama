import { ArrowLeft, Clock, FileText, User, CheckCircle2, AlertCircle, ShieldAlert, Gavel, Printer, Barcode } from "lucide-react";
import Link from "next/link";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";
import { departments } from "@/db/schema/administration";
import { documentClasses as classTable } from "@/db/schema/document-workflow";
import { processes } from "@/db/schema/processes";
import { processRegistrationDetails, processPrintSettings, processReferenceCatalog, processDepartmentMetadata } from "@/db/schema/process-reference-catalog";
import { biddings } from "@/db/schema/procurement-core";
import { saveProcessPrintSetting } from "./print-actions";
import { people } from "@/db/schema/people";
import { readOperationalProcess, listProtocolSigners, listProcessCitizenAccesses, citizenTrackingEligibleCondition } from "@/db/repositories/processes/details";
import { canViewModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import ProcessControls from "./ProcessControls";
import ProcessRouteTree from "./ProcessRouteTree";
import CitizenAccessPanel from "./CitizenAccessPanel";
import { JunctionPanel } from "./JunctionPanel";
import { PageFrame } from "@/components/app-ui/PageFrame";

export const dynamic = "force-dynamic";

export default async function ProcessoDetalhesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string | string[] }>;
}) {
  const requestTime = new Date();
  const { id } = await params;
  const context = await getProtocolContext();
  const { user } = context;
  const requestedReturnTo = searchParams ? await searchParams : {};
  const rawReturnTo = Array.isArray(requestedReturnTo.returnTo) ? requestedReturnTo.returnTo[0] : requestedReturnTo.returnTo;
  const returnTo = rawReturnTo?.startsWith("/protocolos/processos") ? rawReturnTo : "/protocolos/processos";
  const processo = await readOperationalProcess(db, id, protocolScopeCondition(context));

  if (!processo) {
    notFound();
  }
  const [registrationDetail] = await db.select({ declaredValue: processRegistrationDetails.declaredValue, representative: people.fullName, otherApplicant: processReferenceCatalog.name }).from(processRegistrationDetails).leftJoin(people, eq(people.id, processRegistrationDetails.representativePersonId)).leftJoin(processReferenceCatalog,eq(processReferenceCatalog.id,processRegistrationDetails.otherApplicantId)).where(eq(processRegistrationDetails.processId, id)).limit(1);
  const [printSettings] = await db.select().from(processPrintSettings).where(eq(processPrintSettings.processTypeId, processo.processTypeId)).limit(1);

  const [departamentos, documentClasses, signers, situations, [deptMeta], linkedBiddings] = await Promise.all([
    db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.name)),
    db.select({ id: classTable.id, label: classTable.label }).from(classTable).where(and(eq(classTable.isActive, true), eq(classTable.signaturePolicy, "INTERNAL_ALLOWED"))).orderBy(asc(classTable.label)),
    listProtocolSigners(db),
    db.select({ id: processReferenceCatalog.id, name: processReferenceCatalog.name }).from(processReferenceCatalog).where(and(eq(processReferenceCatalog.kind, "PROCESS_SITUATION"), eq(processReferenceCatalog.isActive, true))).orderBy(asc(processReferenceCatalog.name)),
    processo.currentDepartmentId ? db.select().from(processDepartmentMetadata).where(eq(processDepartmentMetadata.departmentId, processo.currentDepartmentId)).limit(1) : Promise.resolve([null]),
    db.select({ id: biddings.id, number: biddings.number, modality: biddings.modality, status: biddings.status, publicationDate: biddings.publicationDate, sessionDate: biddings.sessionDate }).from(biddings).where(eq(biddings.processId, id)).limit(5),
  ]);

  // 19.91: Restringir solicitações originárias do portal aos responsáveis pelo setor vinculado
  const isSectorResponsible = Boolean(
    context.protocolAccess.isAdmin || (user.employeeId && deptMeta?.responsibleEmployeeId === user.employeeId)
  );
  const baseCanOperate = context.protocolAccess.canUpdate && Boolean(
    user.employeeId && user.departmentId && user.departmentId === processo.currentDepartmentId,
  );
  const canOperate = processo.portalOrigin ? (baseCanOperate && isSectorResponsible) : baseCanOperate;
  const isPortalRestricted = Boolean(processo.portalOrigin && baseCanOperate && !isSectorResponsible);

  // 19.7: Permitir editar a rota dos processos que não iniciaram a tramitação
  const canEditRoute = canOperate && (processo.movements.length <= 1 && (processo.status === "Aguardando Recebimento" || processo.status === "Aberto"));

  // 19.34: Tempo total de tramitação
  const totalElapsedMs = Math.max(0, requestTime.getTime() - processo.createdAt.getTime());
  const totalElapsedDays = Math.floor(totalElapsedMs / (1000 * 60 * 60 * 24));
  const totalElapsedHours = Math.floor((totalElapsedMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const totalElapsedMinutes = Math.floor((totalElapsedMs % (1000 * 60 * 60)) / (1000 * 60));
  const tramitacaoTempoFormatado = `${totalElapsedDays}d ${totalElapsedHours}h ${totalElapsedMinutes}m`;
  const pendingMovement = processo.movements.find((movement) => movement.status === "AWAITING_RECEIPT" && !movement.receivedAt) || null;
  const canCancelPending = context.protocolAccess.canUpdate && Boolean(
    user.departmentId && pendingMovement?.fromDepartmentId === user.departmentId && processo.status === "Aguardando Recebimento",
  );
  const canRejectPending = context.protocolAccess.canUpdate && Boolean(
    user.departmentId && pendingMovement?.toDepartmentId === user.departmentId && processo.status === "Aguardando Recebimento",
  );

  const interessadoNome = processo.person?.fullName || processo.company?.corporateName || "Não Informado";
  const interessadoDoc = processo.person?.cpf || processo.company?.cnpj || "";
  const daysToDeadline = processo.expectedCompletionAt
    ? Math.ceil((processo.expectedCompletionAt.getTime() - requestTime.getTime()) / 86_400_000)
    : null;
  const genericStage = processo.genericWorkflowInstance?.definition.stages.find((stage) => stage.position === processo.genericWorkflowInstance?.currentPosition) || null;
  const canManageCitizenAccess = context.protocolAccess.canUpdate && (context.protocolAccess.isAdmin || canOperate) && (await db.select({ id: processes.id }).from(processes).where(and(eq(processes.id, processo.id), citizenTrackingEligibleCondition())).limit(1)).length > 0;
  const citizenAccesses = canManageCitizenAccess ? await listProcessCitizenAccesses(db, processo.id) : [];

  return (
    <PageFrame className="max-w-6xl space-y-3">
      <Link href={`/protocolos/processos/${id}/judicial`} className="text-sm underline">Registro documentado de ação contra a entidade</Link>
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href={returnTo} className="text-emerald-600 hover:text-emerald-700 text-sm font-semibold flex items-center gap-2 mb-4 w-fit transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voltar para a Caixa do Setor
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Processo {processo.protocolNumber}</h1>
            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
              processo.status === 'Concluído' ? 'bg-emerald-100 text-emerald-700' : 
              processo.status === 'Aberto' ? 'bg-blue-100 text-blue-700' :
              processo.status === 'Arquivado' ? 'bg-slate-100 text-slate-600' :
              'bg-amber-100 text-amber-700'
            }`}>
              {processo.status}
            </span>
          </div>
          <p className="text-slate-500 mt-1">{processo.processType.name} - {processo.subject.name}</p>
        </div>
        
        <ProcessControls
          processId={processo.id}
          status={processo.status}
          currentDepartmentId={processo.currentDepartmentId}
          canOperate={canOperate}
          departments={departamentos}
          documentClasses={documentClasses}
          signableDocuments={processo.documents.flatMap((item) => item.document?.status === "Válido" && item.document.documentClassId ? [{ id: item.document.id, title: item.document.title }] : [])}
          signers={signers.filter((signer) => canViewModule({
            id: signer.id, firebaseUid: "", email: signer.email, name: signer.nome, role: signer.perfil.nome, profileCode: signer.perfil.codigo,
            permissions: signer.perfil.permissoes,
            modulePermissions: signer.permissoesModulo.map((permission) => ({ code: permission.modulo.codigo.toUpperCase(), canView: permission.canView, canEdit: permission.canEdit })),
            allowedBudgetUnitIds: [], employeeId: signer.employeeId, departmentId: null, secretariatId: null,
          }, "PROCESSOS")).map((signer) => ({ id: signer.id, nome: signer.nome, email: signer.email }))}
          canPublishPublicNotice={context.protocolAccess.isAdmin}
          pendingMovement={pendingMovement ? { id: pendingMovement.id, fromDepartmentName: pendingMovement.fromDepartment?.name || null, toDepartmentName: pendingMovement.toDepartment.name } : null}
          canCancelPending={canCancelPending}
          canRejectPending={canRejectPending}
          genericWorkflow={processo.genericWorkflowInstance && genericStage ? {
            currentPosition: processo.genericWorkflowInstance.currentPosition,
            totalStages: processo.genericWorkflowInstance.definition.stages.length,
            stageLabel: genericStage.label,
            status: processo.genericWorkflowInstance.status,
          } : null}
          canEditRoute={canEditRoute}
          situations={situations}
        />
      </div>

      {isPortalRestricted && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600" />
          <p>
            <strong>Acesso restrito (19.91):</strong> Este processo é originário do Portal de Serviços Online. De acordo com a parametrização do setor, apenas o responsável vinculado ou administradores podem despachar ou tramitar.
          </p>
        </div>
      )}

      {canManageCitizenAccess && <CitizenAccessPanel processId={processo.id} accesses={citizenAccesses.map((access) => ({ id: access.id, name: access.usuario.nome, email: access.usuario.email, expiresAt: access.expiresAt?.toLocaleDateString("pt-BR") || null, state: access.revokedAt ? "Revogado" : access.expiresAt && access.expiresAt <= requestTime ? "Expirado" : "Ativo" }))} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna Principal - Histórico e Descrição */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Descrição Inicial</h3>
            <p className="text-slate-700 whitespace-pre-wrap">{processo.description || "Nenhuma descrição fornecida na abertura do protocolo."}</p>
            <Link href={`/protocolos/processos/${id}/impressao`} className="mt-3 inline-block font-semibold text-emerald-800 underline">Imprimir abertura e movimentações</Link>
            {context.protocolAccess.isAdmin && <details className="mt-3 rounded border p-3"><summary>Parametrizar relatório deste tipo de processo</summary><form action={saveProcessPrintSetting} className="mt-3 flex flex-wrap items-center gap-3"><input type="hidden" name="processId" value={id}/><label><input type="checkbox" name="includeOpening" defaultChecked={printSettings?.includeOpening??true}/> Abertura do processo</label><label><input type="checkbox" name="includeMovements" defaultChecked={printSettings?.includeMovements??true}/> Movimentações</label><button className="rounded border px-3 py-2">Salvar parametrização</button></form></details>}
            {registrationDetail && <dl className="mt-3 space-y-2">{registrationDetail.otherApplicant&&<><dt className="font-semibold">Outro requerente</dt><dd>{registrationDetail.otherApplicant}</dd></>}<dt className="font-semibold">Representante</dt><dd>{registrationDetail.representative || "Não informado"}</dd><dt className="font-semibold">Valor informado do processo</dt><dd>{registrationDetail.declaredValue === null ? "Não informado" : `R$ ${registrationDetail.declaredValue.replace(".", ",")}`}</dd></dl>}
          </div>

          <ProcessRouteTree
            protocolNumber={processo.protocolNumber}
            status={processo.status}
            createdAt={processo.createdAt}
            portalOrigin={processo.portalOrigin}
            processTypeName={processo.processType.name}
            subjectName={processo.subject.name}
            currentDepartmentName={processo.currentDepartment?.name}
            interessado={interessadoNome}
            genericStages={processo.genericWorkflowInstance?.definition.stages}
            currentPosition={processo.genericWorkflowInstance?.currentPosition}
            movements={processo.movements}
            dispatches={processo.dispatches}
          />
          <JunctionPanel processId={id} context={context} canOperate={canOperate} />
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-800">Despachos e Pareceres</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {processo.dispatches.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">Nenhum despacho adicionado a este processo.</div>
              ) : (
                processo.dispatches.map(dispatch => (
                  <div key={dispatch.id} className="p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
                          {dispatch.employee.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{dispatch.employee.name}</p>
                          <p className="text-xs text-slate-500">{dispatch.dispatchType}</p>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(dispatch.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div className="pl-10 text-slate-700 text-sm mt-2 whitespace-pre-wrap">
                      {dispatch.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-800">Timeline do Processo</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {processo.events.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">Nenhum evento operacional registrado.</p>
              ) : processo.events.map(event => (
                <div key={event.id} className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-800">{event.description || event.eventType}</p>
                    <p className="whitespace-nowrap text-xs text-slate-400">{new Date(event.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.employee?.name || "Sistema"}{event.department ? ` · ${event.department.name}` : ""}
                    {event.previousStatus && event.newStatus ? ` · ${event.previousStatus} → ${event.newStatus}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Lateral - Informações e Tramitações */}
        <div className="space-y-6">
          
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Informações Gerais</h3>
            
            <div>
              <p className="text-xs text-slate-400 font-medium">Interessado</p>
              <div className="flex items-center gap-2 mt-1">
                <User className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-800">{interessadoNome}</p>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{interessadoDoc}</p>
            </div>

            <div>
              <p className="text-xs text-slate-400 font-medium">Setor Atual</p>
              <p className="text-sm font-semibold text-slate-800 mt-1">{processo.currentDepartment?.name || "Não atribuído"}</p>
              {genericStage && <p className="mt-1 text-xs text-indigo-700">Fluxo genérico v{processo.genericWorkflowInstance?.definitionVersion} · etapa {genericStage.position}: {genericStage.label}</p>}
            </div>

            <div>
              <p className="text-xs text-slate-400 font-medium">Data de Abertura</p>
              <p className="text-sm font-semibold text-slate-800 mt-1">{new Date(processo.createdAt).toLocaleDateString('pt-BR')} às {new Date(processo.createdAt).toLocaleTimeString('pt-BR')}</p>
            </div>

            <div>
              <p className="text-xs text-slate-400 font-medium">Prazo previsto</p>
              {processo.expectedCompletionAt ? <><p className="text-sm font-semibold text-slate-800 mt-1">{new Date(processo.expectedCompletionAt).toLocaleDateString('pt-BR')}</p><p className={`text-xs mt-0.5 ${daysToDeadline !== null && daysToDeadline < 0 ? "text-red-600" : daysToDeadline !== null && daysToDeadline <= 3 ? "text-amber-600" : "text-emerald-600"}`}>{daysToDeadline !== null && daysToDeadline < 0 ? `${Math.abs(daysToDeadline)} dia(s) atrasado` : `${daysToDeadline} dia(s) restante(s)`}</p></> : <p className="text-sm text-slate-500 mt-1">Sem prazo definido</p>}
            </div>

            <div>
              <p className="text-xs text-slate-400 font-medium">Prioridade</p>
              <div className="flex items-center gap-1.5 mt-1">
                {processo.priority === 'Urgente' ? <AlertCircle className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                <p className="text-sm font-semibold text-slate-800">{processo.priority}</p>
              </div>
            </div>

            {/* 19.34: Apresentar o tempo de tramitação total do processo */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                Tempo Total de Tramitação (19.34)
              </p>
              <p className="text-base font-bold text-slate-900 mt-1">{tramitacaoTempoFormatado}</p>
              <p className="text-[11px] text-slate-500">Desde a abertura até o momento atual</p>
            </div>

            {/* 19.70 / 19.71 / 19.56: Código de Barras e Emissão de Capa / Recibo / Etiquetas */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-slate-500" />
                Código de Barras & Documentos (19.71)
              </p>
              <div className="mt-2 rounded bg-slate-50 p-2.5 text-center border border-slate-200">
                <div className="inline-block font-mono text-xs tracking-widest bg-white px-3 py-1.5 rounded border border-slate-300">
                  ||| | | || ||| | ||| || {processo.protocolNumber}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/protocolos/processos/${id}/impressao`}
                  className="flex items-center justify-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Capa de Processo e Recibo Unificado (19.70)
                </Link>
              </div>
            </div>
          </div>

          {/* 19.20: Integração com sistema de licitação (Lei 14.133/2021) */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Gavel className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-semibold text-slate-800">Licitação Vinculada (19.20)</h3>
            </div>
            <p className="text-xs text-slate-500">
              Em atendimento à Lei 14.133/2021, os autos podem vincular procedimentos licitatórios ou de contratação direta.
            </p>
            {linkedBiddings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center">
                <p className="text-xs text-slate-500">Nenhum procedimento de licitação vinculado a este processo.</p>
                <Link href="/compras/licitacoes" className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline">
                  Consultar Módulo de Licitações
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {linkedBiddings.map((b) => (
                  <div key={b.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                    <p className="font-semibold text-slate-800">Licitação nº {b.number}</p>
                    <p className="text-slate-600 mt-0.5">Modalidade: {b.modality} · Situação: {b.status}</p>
                    {b.sessionDate && (
                      <p className="text-slate-500 mt-0.5">Sessão: {new Date(b.sessionDate).toLocaleDateString('pt-BR')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-800">Documentos</h3>
              <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{processo.documents.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {processo.documents.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">Nenhum anexo.</div>
              ) : (
                processo.documents.map(doc => (
                  doc.document ? <a key={doc.id} href={`/api/download?url=${encodeURIComponent(doc.document.fileUrl)}`} target="_blank" rel="noreferrer" className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-indigo-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{doc.document.title}</p>
                        <p className="text-xs text-slate-400">{new Date(doc.createdAt).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                  </a> : null
                ))
              )}
            </div>
          </div>
          
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-800">Remessas, recebimentos e histórico de tramitação</h3>
            </div>
            <div className="p-4 space-y-4">
              {processo.movements.length === 0 ? (
                <p className="text-sm text-slate-500 text-center">Processo ainda não foi tramitado.</p>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
                  {processo.movements.map((mov) => (
                    <div key={mov.id} className="relative pl-6">
                      <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-slate-300"></div>
                      <p className="text-xs font-semibold text-slate-500">{new Date(mov.movedAt).toLocaleDateString('pt-BR')} {new Date(mov.movedAt).toLocaleTimeString('pt-BR')}</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">
                        Encaminhado para {mov.toDepartment.name}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Por: {mov.employee?.name || "Sistema"}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {mov.status === "AWAITING_RECEIPT" ? "Aguardando recebimento" : mov.status === "RECEIVED" ? `Recebido${mov.receivedByEmployee ? ` por ${mov.receivedByEmployee.name}` : ""}` : mov.status === "CANCELLED" ? "Encaminhamento cancelado" : mov.status === "REJECTED" ? `Recebimento recusado${mov.receivedByEmployee ? ` por ${mov.receivedByEmployee.name}` : ""}` : mov.status}
                      </p>
                       {mov.reason && <p className="text-sm text-slate-500 mt-2 italic">&quot;{mov.reason}&quot;</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </PageFrame>
  );
}
