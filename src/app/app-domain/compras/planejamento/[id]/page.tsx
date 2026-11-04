import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Edit, FileText, ListTodo, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listManagedDocuments } from "@/db/repositories/documents/ged";
import {
  buildPlanningUpstreamContext,
  internalPhaseStatusLabel,
  listAiSuggestionLogsForPlanning,
  listInternalPhaseDocumentVersions,
  listPlanningAuditTrail,
  loadLinkedGedVersionMap,
} from "@/db/repositories/procurement/internal-phase-documents";
import { listPurchasePlannings } from "@/db/repositories/procurement/purchase-planning";
import {
  type EtpDocumentPayload,
  type InternalPhaseDocumentType,
  type PcaDocumentPayload,
  type TrDocumentPayload,
  buildInheritedEtpPayload,
  buildInheritedPcaPayload,
  buildInheritedTrPayload,
  generateAssistiveSuggestions,
} from "@/lib/compras/internal-phase-documents";
import { canUseGed } from "@/lib/documents/ged-access";
import { gedQuerySchema } from "@/lib/documents/ged-policy";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import {
  decideInternalPhaseAiSuggestionAction,
  routeInternalPhaseDocumentAction,
  saveInternalPhaseDocumentAction,
} from "../actions";

function formatDate(value: Date) {
  const [year, month, day] = value.toISOString().slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function resolveActiveTab(aba?: string): InternalPhaseDocumentType {
  const normalized = (aba ?? "etp").toUpperCase();
  if (normalized === "PCA" || normalized === "ETP" || normalized === "TR") {
    return normalized;
  }
  return "ETP";
}

export default async function PlanejamentoComprasDetalhesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ aba?: string; versao?: string; q?: string }>;
}) {
  const context = await getTenantContextForModule("COMPRAS");
  const { user } = context;
  const database = context.database ?? db;
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const activeType = resolveActiveTab(resolvedSearch.aba);

  const [[planning], upstreamCtx, allVersions, aiLogs] = await Promise.all([
    listPurchasePlannings(database, id),
    buildPlanningUpstreamContext(database, id),
    listInternalPhaseDocumentVersions(database, id),
    listAiSuggestionLogsForPlanning(database, id),
  ]);
  if (!planning || !upstreamCtx) notFound();

  const auditTrail = await listPlanningAuditTrail(database, planning.id, planning.originPurchaseRequestId);
  const gedMap = await loadLinkedGedVersionMap(
    database,
    allVersions.map(v => v.gedDocumentVersionId).filter((v): v is string => Boolean(v)),
  );

  const canEdit = canPerformModuleOperation(user, "COMPRAS", "update");
  const canGed = canUseGed(user);
  const gedDocuments = canEdit && canGed
    ? await listManagedDocuments(
        context,
        gedQuerySchema.parse({
          text: typeof resolvedSearch.q === "string" ? resolvedSearch.q.slice(0, 100) : "",
          mode: "fragment",
        }),
        1,
      )
    : null;
  const eligibleGedDocs = gedDocuments?.documents.filter(
    doc => ["FINAL", "SIGNED"].includes(doc.versionStatus) && !doc.checkoutOwnerId,
  ) ?? [];

  const pcaVersions = allVersions.filter(v => v.documentType === "PCA");
  const etpVersions = allVersions.filter(v => v.documentType === "ETP");
  const trVersions = allVersions.filter(v => v.documentType === "TR");
  const activeVersions = activeType === "PCA" ? pcaVersions : activeType === "ETP" ? etpVersions : trVersions;
  const latestActiveVersion = activeVersions[0] ?? null;
  const selectedVersion = resolvedSearch.versao
    ? activeVersions.find(v => String(v.version) === resolvedSearch.versao) ?? latestActiveVersion
    : latestActiveVersion;

  const validatedFieldOverrides = new Map<string, string>();
  for (const log of [...aiLogs].reverse()) {
    if (log.documentType === activeType && (log.decision === "ACEITA" || log.decision === "EDITADA")) {
      validatedFieldOverrides.set(log.fieldKey, log.finalText);
    }
  }

  const basePca: PcaDocumentPayload = {
    ...buildInheritedPcaPayload(upstreamCtx),
    ...((latestActiveVersion && activeType === "PCA" ? latestActiveVersion.payload : {}) as Partial<PcaDocumentPayload>),
  };
  const baseEtp: EtpDocumentPayload = {
    ...buildInheritedEtpPayload(upstreamCtx),
    ...((latestActiveVersion && activeType === "ETP" ? latestActiveVersion.payload : {}) as Partial<EtpDocumentPayload>),
  };
  const baseTr: TrDocumentPayload = {
    ...buildInheritedTrPayload(upstreamCtx),
    ...((latestActiveVersion && activeType === "TR" ? latestActiveVersion.payload : {}) as Partial<TrDocumentPayload>),
  };

  for (const [fieldKey, text] of validatedFieldOverrides.entries()) {
    if (activeType === "PCA" && fieldKey in basePca) {
      (basePca as Record<string, unknown>)[fieldKey] = text;
    } else if (activeType === "ETP" && fieldKey in baseEtp) {
      (baseEtp as Record<string, unknown>)[fieldKey] = text;
    } else if (activeType === "TR" && fieldKey in baseTr) {
      (baseTr as Record<string, unknown>)[fieldKey] = text;
    }
  }

  const suggestions = generateAssistiveSuggestions(upstreamCtx, activeType);
  const itemName = planning.catalogItem?.name ?? planning.description ?? "Item sem especificação";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  const saveAction = saveInternalPhaseDocumentAction.bind(
    null,
    planning.id,
    activeType,
    latestActiveVersion?.version ?? 0,
  );
  const routeAction = selectedVersion
    ? routeInternalPhaseDocumentAction.bind(
        null,
        planning.id,
        selectedVersion.id,
        activeType,
        selectedVersion.version,
      )
    : null;
  const aiDecisionAction = decideInternalPhaseAiSuggestionAction.bind(null, planning.id, activeType);

  const selectedGed = selectedVersion?.gedDocumentVersionId
    ? gedMap.get(selectedVersion.gedDocumentVersionId)
    : undefined;
  const gedDownloadQuery = selectedGed
    ? encodeURIComponent(JSON.stringify([{ id: selectedGed.documentId, versionId: selectedGed.id }]))
    : null;

  return (
    <PageFrame className="space-y-3">
      <PageHeader
        title="Planejamento de Compra e Fase Interna (Lei nº 14.133/2021)"
        icon={<ListTodo className="size-4 shrink-0 text-emerald-600" />}
        action={
          <>
            <Link href="/compras/planejamento" aria-label="Voltar para planejamentos">
              <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
            </Link>
            {canEdit ? (
              <Link href={`/compras/planejamento/${planning.id}/editar`}>
                <Button variant="outline" size="sm"><Edit className="size-3.5" />Editar</Button>
              </Link>
            ) : null}
          </>
        }
      />

      <Card className="rounded-md">
        <CardHeader className="border-b p-3"><CardTitle className="text-sm">Necessidade futura</CardTitle></CardHeader>
        <CardContent className="space-y-4 p-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Item ou serviço</p>
              <p className="mt-1 font-medium">{itemName}</p>
              {planning.catalogItem ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {planning.catalogItem.code ? `${planning.catalogItem.code} · ` : ""}Catálogo · {planning.catalogItem.unit}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Situação</p>
              <Badge className="mt-1" variant="secondary">{planning.status}</Badge>
            </div>
          </div>
          {planning.catalogItem && planning.description ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Especificação complementar</p>
              <p className="mt-1 whitespace-pre-wrap">{planning.description}</p>
            </div>
          ) : null}
          {!planning.catalogItem && planning.description ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Especificação</p>
              <p className="mt-1 whitespace-pre-wrap">{planning.description}</p>
            </div>
          ) : null}
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Quantidade</p>
              <p className="mt-1 font-medium tabular-nums">{planning.quantity} {planning.unit}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Período esperado</p>
              <p className="mt-1 tabular-nums">{formatDate(planning.expectedPeriodStart)} a {formatDate(planning.expectedPeriodEnd)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor estimado</p>
              <p className="mt-1 font-medium tabular-nums">{money.format(Number(planning.estimatedValueDecimal))}</p>
            </div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Origem</p>
            {planning.originPurchaseRequest ? (
              <p className="mt-1">
                <Link href={`/compras/solicitacoes/${planning.originPurchaseRequest.id}`} className="font-medium text-emerald-700 hover:underline">
                  {planning.originPurchaseRequest.number}
                </Link>{" "}
                · {planning.originPurchaseRequest.object}{" "}
                <span className="text-muted-foreground">({planning.originPurchaseRequest.status})</span>
                {" · "}
                <Link href={`/compras/solicitacoes/${planning.originPurchaseRequest.id}/dfd`} className="text-xs underline">
                  Abrir DFD da Solicitação
                </Link>
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">Necessidade registrada diretamente, sem solicitação de origem vinculada.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-md">
        <CardHeader className="border-b p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <FileText className="size-4 text-emerald-600" />
              Encadeamento Lógico e Documentos da Fase Interna (DFD → PCA → ETP → TR)
            </CardTitle>
            <nav aria-label="Etapas documentais da fase interna" className="flex flex-wrap gap-2 text-xs">
              {planning.originPurchaseRequest ? (
                <Link
                  href={`/compras/solicitacoes/${planning.originPurchaseRequest.id}/dfd`}
                  className="rounded border px-2.5 py-1 hover:bg-muted"
                >
                  1. DFD ({upstreamCtx.latestDfdVersion ? `v${upstreamCtx.latestDfdVersion.version}` : "Pendente"})
                </Link>
              ) : (
                <span className="rounded border px-2.5 py-1 text-muted-foreground">1. DFD (Sem solicitação)</span>
              )}
              <Link
                href={`/compras/planejamento/${planning.id}?aba=pca`}
                className={`rounded border px-2.5 py-1 ${activeType === "PCA" ? "bg-emerald-50 border-emerald-600 font-semibold" : "hover:bg-muted"}`}
              >
                2. PCA ({pcaVersions[0] ? `v${pcaVersions[0].version} · ${pcaVersions[0].status}` : "Elaborar"})
              </Link>
              <Link
                href={`/compras/planejamento/${planning.id}?aba=etp`}
                className={`rounded border px-2.5 py-1 ${activeType === "ETP" ? "bg-emerald-50 border-emerald-600 font-semibold" : "hover:bg-muted"}`}
              >
                3. ETP ({etpVersions[0] ? `v${etpVersions[0].version} · ${etpVersions[0].status}` : "Elaborar"})
              </Link>
              <Link
                href={`/compras/planejamento/${planning.id}?aba=tr`}
                className={`rounded border px-2.5 py-1 ${activeType === "TR" ? "bg-emerald-50 border-emerald-600 font-semibold" : "hover:bg-muted"}`}
              >
                4. TR ({trVersions[0] ? `v${trVersions[0].version} · ${trVersions[0].status}` : "Elaborar"})
              </Link>
            </nav>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-slate-50 p-2.5 text-xs">
            <div>
              <strong>Documento selecionado:</strong>{" "}
              {activeType === "PCA"
                ? "Ficha de Consolidação e Alinhamento ao PCA (Art. 12, VII)"
                : activeType === "ETP"
                  ? "Estudo Técnico Preliminar — ETP (Art. 18, § 1º da Lei nº 14.133/2021)"
                  : "Termo de Referência — TR (Art. 6º, XXIII e Art. 40, § 1º da Lei nº 14.133/2021)"}
            </div>
            <div className="flex flex-wrap gap-2">
              {activeVersions.map(v => (
                <Link
                  key={v.id}
                  href={`/compras/planejamento/${planning.id}?aba=${activeType.toLowerCase()}&versao=${v.version}`}
                  className={`underline ${selectedVersion?.id === v.id ? "font-bold text-emerald-700" : ""}`}
                >
                  Versão {v.version} ({v.status})
                </Link>
              ))}
            </div>
          </div>

          {selectedVersion ? (
            <div className="space-y-3 rounded border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {activeType} · Versão {selectedVersion.version} · {internalPhaseStatusLabel[selectedVersion.status]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Registrada em {dateFmt.format(selectedVersion.createdAt)} por {selectedVersion.actorId}
                    {selectedVersion.reviewerId ? ` · Revisado por ${selectedVersion.reviewerId}` : ""}
                  </p>
                </div>
                {gedDownloadQuery ? (
                  <a
                    className="rounded border px-2.5 py-1 text-xs font-medium underline hover:bg-muted"
                    href={`/api/assinatura-digital/ged/download?items=${gedDownloadQuery}`}
                  >
                    Baixar documento vinculado no GED (v{selectedGed?.versionNumber})
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem versão final do GED vinculada</span>
                )}
              </div>

              {selectedVersion.reviewReason ? (
                <p className="rounded border bg-slate-50 px-2.5 py-1.5 text-xs">
                  <strong>Último despacho de tramitação:</strong> {selectedVersion.reviewReason}
                </p>
              ) : null}

              <div
                className={`rounded border p-2.5 text-xs ${
                  selectedVersion.coherenceReport.coherent
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                <p className="font-semibold flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  {selectedVersion.coherenceReport.coherent
                    ? "Coerência integral verificada entre DFD, Planejamento/PCA, ETP e TR."
                    : "Alertas de coerência e encadeamento entre documentos da fase interna:"}
                </p>
                {selectedVersion.coherenceReport.warnings.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 space-y-0.5">
                    {selectedVersion.coherenceReport.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>

              {canEdit && routeAction && selectedVersion.id === latestActiveVersion?.id && selectedVersion.status !== "APROVADO" ? (
                <form action={routeAction} className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold">Tramitação e Governança Documental ({activeType} v{selectedVersion.version})</p>
                  {canGed && eligibleGedDocs.length > 0 ? (
                    <label className="block text-xs">
                      Vincular/atualizar documento final ou assinado do GED (opcional na revisão, recomendado para conclusão):
                      <select name="gedDocument" defaultValue="" className="mt-1 block w-full rounded border bg-background p-1.5 text-xs">
                        <option value="">Manter vínculo atual do GED</option>
                        {eligibleGedDocs.map(doc => (
                          <option key={doc.id} value={`${doc.id}:${doc.versionId}`}>
                            {doc.title} · versão {doc.versionNumber} ({doc.versionStatus})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="block text-xs">
                    Despacho / justificativa da tramitação
                    <input
                      name="reason"
                      required
                      maxLength={2000}
                      placeholder="Informe o parecer técnico ou justificativa de encaminhamento/decisão..."
                      className="mt-1 block w-full rounded border px-2 py-1.5 text-xs"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(selectedVersion.status === "RASCUNHO" || selectedVersion.status === "DEVOLVIDO") && (
                      <button type="submit" name="status" value="EM_ANALISE" className="rounded border bg-slate-900 px-3 py-1 text-xs text-white">
                        Encaminhar para análise
                      </button>
                    )}
                    {selectedVersion.status === "EM_ANALISE" && selectedVersion.actorId !== user.id && (
                      <>
                        <button type="submit" name="status" value="APROVADO" className="rounded border bg-emerald-700 px-3 py-1 text-xs text-white">
                          Aprovar {activeType}
                        </button>
                        <button type="submit" name="status" value="DEVOLVIDO" className="rounded border px-3 py-1 text-xs">
                          Devolver para revisão
                        </button>
                      </>
                    )}
                    {selectedVersion.status === "EM_ANALISE" && selectedVersion.actorId === user.id && (
                      <span className="text-xs text-muted-foreground">
                        Aguardando análise e decisão por outro usuário (segregação de funções).
                      </span>
                    )}
                  </div>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
              Nenhuma versão formalizada de {activeType} para este planejamento. Os campos abaixo foram preenchidos automaticamente com os dados herdados da Solicitação/DFD e do Planejamento para evitar retrabalho.
            </p>
          )}

          {canEdit ? (
            <section aria-label="Assistente de automação e IA" className="space-y-2 rounded border border-emerald-200 bg-emerald-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold flex items-center gap-1.5 text-emerald-950">
                  <Sparkles className="size-3.5 text-emerald-700" />
                  Sugestões Assistivas e Regras Parametrizadas (IA com Validação Humana Obrigatória)
                </h3>
                <span className="text-[11px] text-emerald-900">
                  Nenhuma decisão automática é aplicada sem validação humana (Aceitar, Editar ou Recusar)
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {suggestions.map(suggestion => (
                  <form key={suggestion.fieldKey} action={aiDecisionAction} className="space-y-1.5 rounded border bg-background p-2.5 text-xs">
                    <input type="hidden" name="fieldKey" value={suggestion.fieldKey} />
                    <input type="hidden" name="suggestionType" value={suggestion.suggestionType} />
                    <input type="hidden" name="suggestedText" value={suggestion.suggestedText} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{suggestion.fieldLabel}</span>
                      <Badge variant="outline" className="text-[10px]">{suggestion.suggestionType}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{suggestion.rationale}</p>
                    <textarea
                      name="finalText"
                      rows={3}
                      defaultValue={suggestion.suggestedText}
                      className="w-full rounded border p-1.5 text-xs"
                    />
                    <input
                      name="justification"
                      placeholder="Observação da validação humana (opcional)..."
                      className="w-full rounded border px-2 py-1 text-xs"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button type="submit" name="decision" value="ACEITA" className="rounded border bg-emerald-700 px-2 py-1 text-[11px] text-white">
                        Aceitar sugestão
                      </button>
                      <button type="submit" name="decision" value="EDITADA" className="rounded border px-2 py-1 text-[11px]">
                        Registrar edição humana
                      </button>
                      <button type="submit" name="decision" value="RECUSADA" className="rounded border px-2 py-1 text-[11px] text-rose-700">
                        Recusar
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            </section>
          ) : null}

          {canEdit ? (
            <form action={saveAction} className="space-y-3 rounded border p-3">
              <h3 className="font-semibold text-sm">
                {latestActiveVersion
                  ? `Registrar Nova Revisão (v${latestActiveVersion.version + 1}) de ${activeType}`
                  : `Formalizar Versão Inicial (v1) de ${activeType}`}
              </h3>
              <p className="text-xs text-muted-foreground">
                Dados reaproveitados automaticamente da cadeia DFD → PCA → ETP → TR. Ao salvar, uma nova versão imutável é gravada com verificação automática de coerência.
              </p>

              {activeType === "PCA" && (
                <div className="grid gap-3">
                  <label className="block text-xs">
                    Exercício do PCA
                    <input name="exerciseYear" type="number" required defaultValue={basePca.exerciseYear} className="mt-1 block w-40 rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    Justificativa consolidada da demanda no PCA
                    <textarea name="consolidatedJustification" required rows={2} defaultValue={basePca.consolidatedJustification} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    Alinhamento estratégico ao PPA e diretrizes
                    <textarea name="ppaAlignmentSummary" required rows={2} defaultValue={basePca.ppaAlignmentSummary} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    Análise de compras coletivas e ganho de escala
                    <textarea name="collectivePurchaseAnalysis" required rows={2} defaultValue={basePca.collectivePurchaseAnalysis} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    Compatibilidade orçamentária preliminar
                    <textarea name="budgetaryCompatibilitySummary" required rows={2} defaultValue={basePca.budgetaryCompatibilitySummary} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    Conclusão de governança para inclusão no PCA
                    <textarea name="governanceConclusion" required rows={2} defaultValue={basePca.governanceConclusion} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                </div>
              )}

              {activeType === "ETP" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-xs md:col-span-2">
                    1. Descrição da necessidade da contratação (art. 18, § 1º, I)
                    <textarea name="problemDescription" required rows={2} defaultValue={baseEtp.problemDescription} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    2. Previsão no PCA e alinhamento ao planejamento (art. 18, § 1º, II)
                    <textarea name="pcaPpaAlignment" required rows={2} defaultValue={baseEtp.pcaPpaAlignment} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    3. Requisitos técnicos, funcionais e sustentabilidade (art. 18, § 1º, III)
                    <textarea name="contractingRequirements" required rows={2} defaultValue={baseEtp.contractingRequirements} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    4. Estimativa das quantidades e memória de cálculo (art. 18, § 1º, IV)
                    <textarea name="quantityEstimateAndMemory" required rows={2} defaultValue={baseEtp.quantityEstimateAndMemory} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    5. Levantamento de mercado e alternativas (art. 18, § 1º, V)
                    <textarea name="marketAlternativesAnalysis" required rows={2} defaultValue={baseEtp.marketAlternativesAnalysis} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    6. Estimativa do valor da contratação em R$ (art. 18, § 1º, VI)
                    <input name="estimatedTotalValueBrl" required defaultValue={baseEtp.estimatedTotalValueBrl} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    7. Descrição da solução como um todo (art. 18, § 1º, VII)
                    <textarea name="solutionDescription" required rows={2} defaultValue={baseEtp.solutionDescription} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    8. Justificativas para o parcelamento ou não (art. 18, § 1º, VIII)
                    <textarea name="parcelingJustification" required rows={2} defaultValue={baseEtp.parcelingJustification} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    9. Demonstrativo dos resultados pretendidos (art. 18, § 1º, IX)
                    <textarea name="expectedResults" required rows={2} defaultValue={baseEtp.expectedResults} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    10. Providências prévias da Administração (art. 18, § 1º, X)
                    <textarea name="priorAdministrationMeasures" required rows={2} defaultValue={baseEtp.priorAdministrationMeasures} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    11. Contratações correlatas e/ou interdependentes (art. 18, § 1º, XI)
                    <textarea name="correlatedContractions" required rows={2} defaultValue={baseEtp.correlatedContractions} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    12. Impactos ambientais, riscos e mitigação (art. 18, § 1º, XII)
                    <textarea name="environmentalImpactsAndRisks" required rows={2} defaultValue={baseEtp.environmentalImpactsAndRisks} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    13. Conclusão de viabilidade (art. 18, § 1º, XIII)
                    <select name="viabilityConclusion" defaultValue={baseEtp.viabilityConclusion} className="mt-1 block w-full rounded border bg-background p-1.5 text-sm">
                      <option value="VIAVEL">Viável</option>
                      <option value="VIAVEL_COM_RESSALVAS">Viável com ressalvas</option>
                      <option value="INVIAVEL">Inviável</option>
                    </select>
                  </label>
                  <label className="block text-xs">
                    13.1 Fundamentação conclusiva da viabilidade
                    <textarea name="viabilityJustification" required rows={2} defaultValue={baseEtp.viabilityJustification} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                </div>
              )}

              {activeType === "TR" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-xs md:col-span-2">
                    1. Definição do objeto, quantitativos e prazo (art. 6º, XXIII, &apos;a&apos;)
                    <textarea name="objectDefinition" required rows={2} defaultValue={baseTr.objectDefinition} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    2. Fundamentação da contratação e referência ao ETP/DFD (art. 6º, XXIII, &apos;b&apos;)
                    <textarea name="legalAndTechnicalFoundation" required rows={2} defaultValue={baseTr.legalAndTechnicalFoundation} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    3. Descrição da solução e ciclo de vida do objeto (art. 6º, XXIII, &apos;c&apos;)
                    <textarea name="lifecycleSolutionSummary" required rows={2} defaultValue={baseTr.lifecycleSolutionSummary} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    4. Requisitos da contratação e padrões de qualidade (art. 6º, XXIII, &apos;d&apos;)
                    <textarea name="contractingRequirements" required rows={2} defaultValue={baseTr.contractingRequirements} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    5. Modelo de execução do objeto e prazos (art. 6º, XXIII, &apos;e&apos;)
                    <textarea name="executionModel" required rows={2} defaultValue={baseTr.executionModel} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    6. Modelo de gestão e fiscalização do contrato (art. 6º, XXIII, &apos;f&apos;)
                    <textarea name="managementAndSupervisionModel" required rows={2} defaultValue={baseTr.managementAndSupervisionModel} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    7. Critérios de medição, aceitação e pagamento (art. 6º, XXIII, &apos;g&apos;)
                    <textarea name="measurementAndPaymentCriteria" required rows={2} defaultValue={baseTr.measurementAndPaymentCriteria} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    8. Forma e critérios de seleção do fornecedor (art. 6º, XXIII, &apos;h&apos;)
                    <textarea name="supplierSelectionCriteria" required rows={2} defaultValue={baseTr.supplierSelectionCriteria} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    9. Estimativas do valor e preços referenciais (art. 6º, XXIII, &apos;i&apos;)
                    <textarea name="estimatedValueAndPricing" required rows={2} defaultValue={baseTr.estimatedValueAndPricing} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs">
                    10. Adequação orçamentária e PCA/PPA (art. 6º, XXIII, &apos;j&apos;)
                    <textarea name="budgetAdequacy" required rows={2} defaultValue={baseTr.budgetAdequacy} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                  <label className="block text-xs md:col-span-2">
                    11. Obrigações da contratada, do contratante e regime de garantias (art. 40, § 1º)
                    <textarea name="contractorAndAdministrationObligations" required rows={2} defaultValue={baseTr.contractorAndAdministrationObligations} className="mt-1 block w-full rounded border p-1.5 text-sm" />
                  </label>
                </div>
              )}

              {canGed && eligibleGedDocs.length > 0 ? (
                <label className="block text-xs">
                  Vincular documento final/assinado do GED a esta versão (opcional):
                  <select name="gedDocument" defaultValue="" className="mt-1 block w-full rounded border bg-background p-1.5 text-xs">
                    <option value="">Sem documento do GED vinculado agora</option>
                    {eligibleGedDocs.map(doc => (
                      <option key={doc.id} value={`${doc.id}:${doc.versionId}`}>
                        {doc.title} · versão {doc.versionNumber} ({doc.versionStatus})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="flex justify-end">
                <button type="submit" className="rounded border bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white">
                  Salvar versão de {activeType}
                </button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-md">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-emerald-600" />
            Auditoria, Rastreabilidade e Histórico de Validação Humana (IA)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-3 text-xs md:grid-cols-2">
          <div>
            <h3 className="font-semibold">Decisões Humanas sobre Sugestões Assistivas ({aiLogs.length})</h3>
            {aiLogs.length === 0 ? (
              <p className="mt-1 text-muted-foreground">Nenhuma sugestão assistiva avaliada até o momento.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 space-y-1">
                {aiLogs.slice(0, 10).map(log => (
                  <li key={log.id}>
                    <strong>{log.documentType} ({log.fieldKey})</strong> · Decisão: <Badge variant="outline" className="text-[10px]">{log.decision}</Badge> · Por {log.actorId} em {dateFmt.format(log.createdAt)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold">Eventos de Auditoria e Rastreabilidade ({auditTrail.length})</h3>
            {auditTrail.length === 0 ? (
              <p className="mt-1 text-muted-foreground">As mutações de planejamento, documentos e tramitação são registradas aqui.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 space-y-1">
                {auditTrail.slice(0, 10).map(ev => (
                  <li key={ev.id}>
                    {dateFmt.format(ev.createdAt)} · <strong>{ev.eventType}</strong> · Alvo: {ev.targetType} · Usuário: {ev.actorUsuarioId}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        O planejamento não criou processo de compra, contratação, reserva, empenho ou despesa. Esses atos dependem dos fluxos próprios.
      </p>
    </PageFrame>
  );
}
