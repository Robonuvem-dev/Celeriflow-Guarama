"use server";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { JsonObject } from "@/db/json";
import { withDatabaseTransaction } from "@/db/transaction";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { actionFiscalEntityExists, actionProcessExists, actionDocumentExists, actionOriginExists, latestActionRegistryEntry, actionRegistryEntry, insertActionRegistryEntries, reviewActionRegistryEntry, insertActionAudit } from "@/db/repositories/tax-actions/registry";
import { actionIntegrationReplay, actionLatestRedesimEvent, actionRedesimTaxpayer, insertActionIntegration, actionTaxpayerSelection, updateActionTaxpayerStatus } from "@/db/repositories/tax-actions/integrations";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { updateEconomicRegistrationWithHistoryInTransaction } from "@/lib/tributacao/economic-history";
import { createEconomicRegistrationWithProfileInTransaction, economicProfileSchema } from "@/lib/tributacao/economic-profile";
import { enforceEconomicProfileDebtPolicy } from "@/lib/tributacao/economic-debt-policy";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import type { z } from "zod";
import { touchPropertyMetadata } from "@/lib/tributacao/property-history";

export type FiscalEntityType = "TAXPAYER" | "REAL_ESTATE" | "ECONOMIC_REGISTRATION";

type ActionResult = { error?: string; id?: string; duplicate?: boolean; registrationId?: string };

const entityTypes = new Set<FiscalEntityType>(["TAXPAYER", "REAL_ESTATE", "ECONOMIC_REGISTRATION"]);
const redesimEvents = new Set(["VIABILIDADE", "FORMALIZACAO", "ABERTURA", "ALTERACAO", "BAIXA", "MEI", "LICENCIAMENTO"]);

function requiredText(value: unknown, label: string, max = 240) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  if (text.length > max) throw new Error(`${label} excede ${max} caracteres.`);
  return text;
}

function optionalText(value: unknown, max = 240) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new Error(`O valor excede ${max} caracteres.`);
  return text;
}

function dateValue(value: unknown, label: string, required = false) {
  const text = String(value ?? "").trim();
  if (!text && !required) return null;
  const date = new Date(`${text}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== text) throw new Error(`${label} inválida.`);
  return date;
}

function revalidateFiscalEntity(entityType: FiscalEntityType, entityId: string) {
  if (entityType === "TAXPAYER") revalidatePath(`/tributacao/pessoas/${entityId}`);
  if (entityType === "REAL_ESTATE") revalidatePath(`/tributacao/imoveis/${entityId}`);
  if (entityType === "ECONOMIC_REGISTRATION") revalidatePath(`/tributacao/economico/${entityId}`);
}

export async function saveTaxRegistryEntry(input: {
  entityType: FiscalEntityType;
  entityId: string;
  category: string;
  title: string;
  details: string;
  value?: string;
  percentage?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  source?: string;
  processId?: string;
  documentId?: string;
  requiresReview?: boolean;
}): Promise<ActionResult> {
  try {
    if (!entityTypes.has(input.entityType)) throw new Error("Tipo de cadastro fiscal inválido.");
    const entityId = requiredText(input.entityId, "Cadastro");
    const category = requiredText(input.category, "Categoria", 80).toUpperCase();
    if (["PROPERTY_VALUATION_RULE", "CONFIGURED_VALUATION_IPTU", "CONFIGURED_VALUATION_ITBI", "CADASTRAL_HISTORY", "PARAMETER_SCOPE", "TYPED_FISCAL_CATALOG", "TYPED_FISCAL_RECORD", "CADASTRAL_OPERATION", "ECONOMIC_PROFILE", "ACCOUNTANT", "PROVISIONAL_EXPIRY", "PROPERTY_EDIT_RESTRICTION", "PROPERTY_EDIT_APPROVAL", "PROPERTY_PROFILE", "PROPERTY_REGISTRATION_POLICY", "FISCAL_OWNERSHIP", "ECONOMIC_BULK_CHANGE"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pela rotina cadastral ou de avaliação correspondente.");
    if (["ECONOMIC_ACTIVITY_DEFINITION","ECONOMIC_ACTIVITY_UNIFICATION"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pela rotina de atividades econômicas.");
    if (["LICENSE_POLICY","LICENSE_ISSUANCE","LICENSE_LIFECYCLE"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pela rotina de alvarás configurados.");
    if (category==="PROPERTY_SIMULATION_ASSESSMENT") throw new Error("Esta categoria é gerada exclusivamente pela efetivação da simulação imobiliária.");
    if (["ITBI_PROPERTY_COLLECTION","ITBI_CONTESTATION","ITBI_CONTESTATION_DECISION","ITBI_PROCESS_MESSAGE"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pelo processo de transmissão ITBI.");
    if (["ECONOMIC_EVENT_TYPE","ECONOMIC_EVENT","ECONOMIC_VEHICLE"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pela rotina de eventos e veículos econômicos.");
    if (["ITBI_EXPIRY_POLICY","ITBI_AUTOMATIC_CANCELLATION"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pelo cancelamento configurado de ITBI.");
    if (["ITBI_PROCESS_MESSAGE","ITBI_CORRESPONDENCE","ONLINE_ITBI_POLICY","ONLINE_ITBI_REQUEST","ITBI_NOTARY","ONLINE_ITBI_DRAFT_ATTACHMENT","ITBI_FIELD_HISTORY"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pelas rotinas do processo ITBI.");
    if (["SIMPLES_OPTION_LAYOUT","SIMPLES_OPTION_FILE","SIMPLES_OPTION_EXPORT","SIMPLES_OPTION_DECISION"].includes(category)) throw new Error("Esta categoria é gerada exclusivamente pela análise dos arquivos de opção pelo Simples.");
    if (category === "BENEFIT_REPORT_CLASSIFICATION") throw new Error("Use a classificação fiscal de benefícios para o resumo anual.");
    if (["DEBT_NOTICE_ISSUANCE","DEBT_NOTICE_CANCELLATION","DEBT_NOTICE_REFERENCE","DEBT_NOTICE_BATCH"].includes(category)) throw new Error("Use a rotina de notificações e avisos de débitos.");
    if (category === "ANNUAL_GUIDE_SCHEDULE") throw new Error("Use a emissão do calendário de cotas e parcelas.");
    if (["CONDITIONAL_DISCOUNT", "CONDITIONAL_DISCOUNT_REVERSAL"].includes(category)) throw new Error("Descontos condicionais são gerados exclusivamente pela confirmação ou estorno de pagamento.");
    if (category === "ITBI_FISCAL_TREATMENT") throw new Error("Use a decisão fiscal fundamentada no processo ITBI.");
    if (category === "ITBI_RECTIFICATION") throw new Error("Use a retificação vinculada ao ITBI transferido.");
    if (["ITBI_DOCUMENT_MODEL", "ITBI_DOCUMENT_ISSUANCE"].includes(category)) throw new Error("Use os modelos e a emissão de declarações do ITBI.");
    if (["ECONOMIC_DOCUMENT_ISSUANCE", "ECONOMIC_DOCUMENT_POSITION"].includes(category)) throw new Error("Use a emissão autenticada de documentos cadastrais da empresa.");
    if (category === "LICENSE_SIGNATURE") throw new Error("Use a assinatura digital de alvarás.");
    if (category === "ITBI_ENTRY_POLICY") throw new Error("Use a política de bloqueios e avisos de ITBI.");
    const title = requiredText(input.title, "Título");
    const details = requiredText(input.details, "Detalhamento", 4_000);
    const effectiveFrom = dateValue(input.effectiveFrom, "Início da vigência", true)!;
    const effectiveUntil = dateValue(input.effectiveUntil, "Fim da vigência");
    if (effectiveUntil && effectiveUntil < effectiveFrom) throw new Error("O fim da vigência deve ser posterior ao início.");
    const percentage = optionalText(input.percentage, 30);
    if (percentage !== null) {
      const parsed = Number(percentage.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error("O percentual deve estar entre 0 e 100.");
    }

    const context = await taxActionContext("create");
    const entry = await withDatabaseTransaction(context.connection, async (tx) => {
      if (!await actionFiscalEntityExists(tx, input.entityType, entityId)) throw new Error("O cadastro de origem não foi encontrado.");
      const processId = optionalText(input.processId);
      const documentId = optionalText(input.documentId);
      if (processId && !await actionProcessExists(tx, processId)) throw new Error("O processo informado não existe.");
      if (documentId && !await actionDocumentExists(tx, documentId)) throw new Error("O documento informado não existe no GED.");

      let origin: { governmentEntityId: string; budgetUnitId: string } | null = null;
      if (input.entityType === "REAL_ESTATE" || input.entityType === "ECONOMIC_REGISTRATION") {
        const profile = await latestActionRegistryEntry(tx, input.entityType, entityId, input.entityType === "REAL_ESTATE" ? "PROPERTY_PROFILE" : "ECONOMIC_PROFILE");
        const scope = taxScopeSnapshot(profile?.data);
        if (profile) {
          if (typeof scope.governmentEntityId !== "string" || typeof scope.budgetUnitId !== "string" || !await actionOriginExists(tx, scope.governmentEntityId, scope.budgetUnitId)) throw new Error("Origem cadastral não conciliada.");
          origin = { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId };
        }
        if (!isSystemAdministrator(context.user) && (!origin || !context.user.allowedBudgetUnitIds.includes(origin.budgetUnitId))) throw new Error("Cadastro sem origem conciliada ou fora da UG autorizada.");
        if (input.entityType === "REAL_ESTATE") await touchPropertyMetadata(tx, context.user.id, entityId, processId);
        else {
          await tx.execute(sql`SELECT id FROM "EconomicRegistration" WHERE id=${entityId} FOR UPDATE`);
          await enforceEconomicProfileDebtPolicy(tx, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, entityId);
        }
      }

      const previous = await latestActionRegistryEntry(tx, input.entityType, entityId, category, title);
      const [created] = await insertActionRegistryEntries(tx, [{
          entityType: input.entityType,
          entityId,
          category,
          title,
          data: {
            ...(origin ?? {}),
            details,
            ...(optionalText(input.value, 500) ? { value: optionalText(input.value, 500) } : {}),
            ...(percentage !== null ? { percentage } : {}),
          },
          status: input.requiresReview ? "PENDENTE_VALIDACAO" : "ATIVO",
          source: optionalText(input.source, 80) ?? "INTERNO",
          effectiveFrom,
          effectiveUntil,
          processId,
          documentId,
          actorUsuarioId: context.user.id,
          version: (previous?.version ?? 0) + 1,
      }]);
      await insertActionAudit(tx, {
          action: input.requiresReview ? "REQUEST" : "CREATE",
          entityType: "TaxRegistryEntry",
          entityId: created.id,
          payload: { targetType: input.entityType, targetId: entityId, category, status: created.status, version: created.version },
          authorUsuarioId: context.user.id,
          authorEmployeeId: context.user.employeeId,
      });
      return created;
    }, { timeoutMs: 5000 });
    revalidateFiscalEntity(input.entityType, entityId);
    revalidatePath("/tributacao/pessoas");
    return { id: entry.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar o registro fiscal." };
  }
}

export async function reviewTaxRegistryEntry(id: string, decision: "APPROVE" | "REJECT"): Promise<ActionResult> {
  try {
    const context = await taxActionContext("update");
    const entry = await withDatabaseTransaction(context.connection, async (tx) => {
      const current = await actionRegistryEntry(tx, id);
      if (!current) throw new Error("Registro fiscal não encontrado.");
      if (current.status !== "PENDENTE_VALIDACAO") throw new Error("O registro não está aguardando validação.");
      const updated = await reviewActionRegistryEntry(tx, id, {
          status: decision === "APPROVE" ? "ATIVO" : "REJEITADO",
          reviewedByUsuarioId: context.user.id,
          reviewedAt: new Date(),
      });
      await insertActionAudit(tx, {
          action: decision,
          entityType: "TaxRegistryEntry",
          entityId: id,
          payload: { before: current.status, after: updated.status, targetType: current.entityType, targetId: current.entityId },
          authorUsuarioId: context.user.id,
          authorEmployeeId: context.user.employeeId,
      });
      return updated;
    }, { timeoutMs: 5000 });
    revalidateFiscalEntity(entry.entityType as FiscalEntityType, entry.entityId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível revisar o registro fiscal." };
  }
}

function redesimKey(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
}

export async function registerRedesimEvent(input: {
  eventType: string;
  taxpayerId: string;
  municipalInsc?: string;
  primaryCnae?: string;
  taxRegime?: string;
  riskLevel?: string;
  externalReference?: string;
  protocol?: string;
  eventDate: string;
  serviceActivity?: boolean;
  profile?: z.input<typeof economicProfileSchema>;
}): Promise<ActionResult> {
  try {
    const eventType = requiredText(input.eventType, "Evento", 40).toUpperCase();
    if (!redesimEvents.has(eventType)) throw new Error("Evento REDESIM não suportado.");
    const taxpayerId = requiredText(input.taxpayerId, "Contribuinte");
    const eventDate = dateValue(input.eventDate, "Data do evento", true)!;
    const normalized = {
      eventType,
      taxpayerId,
      municipalInsc: optionalText(input.municipalInsc, 80),
      primaryCnae: optionalText(input.primaryCnae, 40),
      taxRegime: optionalText(input.taxRegime, 80),
      riskLevel: optionalText(input.riskLevel, 40),
      externalReference: optionalText(input.externalReference, 120),
      eventDate: eventDate.toISOString(),
      serviceActivity: Boolean(input.serviceActivity),
      ...(input.profile ? { profile: economicProfileSchema.parse(input.profile) } : {}),
    };
    const idempotencyKey = redesimKey(normalized);
    const context = await taxActionContext("create");
    const result = await withDatabaseTransaction(context.connection, async (tx) => {
      const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`REDESIM:${taxpayerId}`},0))::text`);
      const existing = await actionIntegrationReplay(tx, idempotencyKey);
      if (existing) {
        if (existing.economicRegistrationId) {
          const profile = await latestActionRegistryEntry(tx, "ECONOMIC_REGISTRATION", existing.economicRegistrationId, "ECONOMIC_PROFILE");
          const scope = taxScopeSnapshot(profile?.data);
          if (actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Evento fora da origem autorizada.");
        }
        return { event: existing, duplicate: true };
      }
      const taxpayer = await actionRedesimTaxpayer(tx, taxpayerId);
      if (!taxpayer?.company) throw new Error("A REDESIM exige contribuinte vinculado a uma pessoa jurídica existente.");

      const candidates = normalized.municipalInsc ? taxpayer.economicRegistrations.filter(row => row.municipalInsc === normalized.municipalInsc) : taxpayer.economicRegistrations;
      if (candidates.length > 1) throw new Error("Informe a inscrição municipal exata para selecionar o cadastro do evento.");
      let registration = candidates[0] ?? null;
      if (registration) {
        const profile = await latestActionRegistryEntry(tx, "ECONOMIC_REGISTRATION", registration.id, "ECONOMIC_PROFILE");
        const scope = taxScopeSnapshot(profile?.data);
        if (actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Cadastro econômico fora da origem autorizada ou sem perfil conciliado.");
      }
      let status = "PROCESSADO_INTERNO";
      const municipalInsc = normalized.municipalInsc;
      const latestApplied = await actionLatestRedesimEvent(tx, taxpayerId, registration?.id ?? null);
      const outOfOrder = ["ABERTURA", "FORMALIZACAO", "MEI", "ALTERACAO", "BAIXA"].includes(eventType)
        && Boolean(latestApplied && eventDate < latestApplied.receivedAt);
      if (outOfOrder) {
        status = "FORA_DE_ORDEM";
      } else if (["ABERTURA", "FORMALIZACAO", "MEI"].includes(eventType)) {
        if (!registration && !municipalInsc) throw new Error("Informe a inscrição municipal para formalização ou abertura.");
        if (!registration) {
          if (!normalized.profile) throw new Error("A inclusão por evento exige perfil completo, origem e política de débitos. Utilize a inclusão completa com origem REDESIM.");
          if (normalized.primaryCnae && normalized.primaryCnae !== normalized.profile.primaryCnae) throw new Error("CNAE do evento diverge do perfil recebido.");
          registration = await createEconomicRegistrationWithProfileInTransaction(tx, actor, { taxpayerId, municipalInsc: municipalInsc!, profile: normalized.profile, taxRegime: eventType === "MEI" ? "SIMEI" : normalized.taxRegime ?? "", startDate: eventDate });
        } else {
          if (normalized.profile) throw new Error("Já existe inscrição municipal. Confira o cadastro existente antes de reaplicar uma abertura.");
          await enforceEconomicProfileDebtPolicy(tx, actor, registration.id);
        }
      } else if (eventType === "ALTERACAO") {
        if (!registration) throw new Error("Nenhuma inscrição econômica foi localizada para alteração.");
        registration = await updateEconomicRegistrationWithHistoryInTransaction(tx, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, registration.id, {
            ...(normalized.primaryCnae ? { primaryCnae: normalized.primaryCnae } : {}),
            ...(normalized.taxRegime ? { taxRegime: normalized.taxRegime } : {}),
        });
      } else if (eventType === "BAIXA") {
        if (!registration) throw new Error("Nenhuma inscrição econômica foi localizada para baixa.");
        registration = await updateEconomicRegistrationWithHistoryInTransaction(tx, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, registration.id, { status: "Baixado" });
      } else if (eventType === "VIABILIDADE" && !normalized.riskLevel) {
        status = "PENDENTE_REGRA";
      }

      const currentProfile = registration ? await latestActionRegistryEntry(tx, "ECONOMIC_REGISTRATION", registration.id, "ECONOMIC_PROFILE") : null;
      const recordedOrigin = taxScopeSnapshot(currentProfile?.data);
      const eventScope: JsonObject = typeof recordedOrigin.governmentEntityId === "string" && typeof recordedOrigin.budgetUnitId === "string" ? { governmentEntityId: recordedOrigin.governmentEntityId, budgetUnitId: recordedOrigin.budgetUnitId } : {};
      const event = await insertActionIntegration(tx, {
          integrationCode: "REDESIM",
          eventType,
          idempotencyKey,
          protocol: optionalText(input.protocol, 120),
          externalReference: normalized.externalReference,
          status,
          evidenceLevel: "L0",
          taxpayerId,
          economicRegistrationId: registration?.id,
          payload: economicSnapshot({ ...normalized, ...eventScope }),
          result: { registrationId: registration?.id ?? null, ...eventScope, status, officialConfirmation: false },
          receivedAt: eventDate,
          processedAt: new Date(),
      });
      if (!outOfOrder && normalized.riskLevel) {
        await insertActionRegistryEntries(tx, [{
            entityType: registration ? "ECONOMIC_REGISTRATION" : "TAXPAYER",
            entityId: registration?.id ?? taxpayerId,
            category: "RISCO_ATIVIDADE",
            title: `Risco ${normalized.primaryCnae ?? "da atividade"}`,
            data: { details: `Nível de risco informado no evento ${eventType}.`, value: normalized.riskLevel },
            source: "REDESIM",
            effectiveFrom: eventDate,
            actorUsuarioId: context.user.id,
        }]);
      }
      if (!outOfOrder && registration && normalized.serviceActivity && ["FORMALIZACAO", "ABERTURA", "MEI"].includes(eventType)) {
        await insertActionRegistryEntries(tx, [{
            entityType: "ECONOMIC_REGISTRATION",
            entityId: registration.id,
            category: "CREDENCIAMENTO_NFSE",
            title: "Habilitação NFS-e originada da formalização",
            data: { details: "Atividade de serviço identificada; habilitação aguarda validação fiscal antes de produzir efeito externo.", cnae: normalized.primaryCnae },
            status: "PENDENTE_VALIDACAO",
            source: "REDESIM",
            effectiveFrom: eventDate,
            actorUsuarioId: context.user.id,
        }]);
      }
      await insertActionAudit(tx, {
          action: "INTEGRATION_EVENT",
          entityType: "TaxIntegrationEvent",
          entityId: event.id,
          payload: { integrationCode: "REDESIM", eventType, status, evidenceLevel: "L0", registrationId: registration?.id ?? null },
          authorUsuarioId: context.user.id,
          authorEmployeeId: context.user.employeeId,
      });
      return { event, duplicate: false };
    }, { isolationLevel: "serializable", timeoutMs: 60000 });
    revalidatePath("/tributacao/redesim");
    revalidatePath("/tributacao/economico");
    if (result.event.economicRegistrationId) revalidatePath(`/tributacao/economico/${result.event.economicRegistrationId}`);
    return { id: result.event.id, duplicate: result.duplicate, registrationId: result.event.economicRegistrationId ?? undefined };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível registrar o evento REDESIM." };
  }
}

export async function requestRegistrySourceLookup(input: { source: string; identifier: string }): Promise<ActionResult> {
  try {
    const source = requiredText(input.source, "Fonte", 40).toUpperCase();
    if (!["SERPRO_CPF", "SERPRO_CNPJ", "CORREIOS_DNE"].includes(source)) throw new Error("Fonte cadastral não suportada.");
    const identifier = requiredText(input.identifier, "Identificador", 120).toUpperCase();
    const idempotencyKey = redesimKey({ source, identifier });
    const context = await taxActionContext("create");
    const existing = await actionIntegrationReplay(context.database, idempotencyKey);
    if (existing) return { id: existing.id, duplicate: true };
    const event = await insertActionIntegration(context.database, {
        integrationCode: source,
        eventType: "CONSULTA_CADASTRAL",
        idempotencyKey,
        status: "AGUARDA_CONFIGURACAO",
        evidenceLevel: "L0",
        payload: { identifier, requestedAt: new Date().toISOString() },
        result: { officialConfirmation: false, message: "Credencial ou contrato ainda não configurado; o cadastro manual permanece disponível." },
    });
    revalidatePath("/tributacao/fontes-cadastrais");
    return { id: event.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível registrar a consulta cadastral." };
  }
}

export async function bulkUpdateTaxpayersByFilter(input: { query?: string; expectedCount: number; status: string }): Promise<ActionResult> {
  try {
    const query = optionalText(input.query, 120) ?? "";
    const status = requiredText(input.status, "Situação", 40);
    if (!["Ativo", "Suspenso", "Inativo"].includes(status)) throw new Error("Situação cadastral inválida.");
    if (!Number.isInteger(input.expectedCount) || input.expectedCount < 1) throw new Error("A seleção em lote está vazia.");
    const context = await taxActionContext("update");
    const ids = await actionTaxpayerSelection(context.database, query);
    if (ids.length !== input.expectedCount) throw new Error("O conjunto mudou desde a prévia. Atualize a consulta antes de confirmar.");
    if (ids.length > 1_000) throw new Error("Refine o filtro para no máximo 1.000 registros por lote.");
    const now = new Date();
    await withDatabaseTransaction(context.connection, async (tx) => {
      await updateActionTaxpayerStatus(tx, ids.map(item => item.id), status);
      await insertActionRegistryEntries(tx, ids.map((item) => ({ entityType: "TAXPAYER", entityId: item.id, category: "SITUACAO", title: `Alteração em lote para ${status}`, data: { details: `Situação atualizada pelo filtro ${query || "todos os contribuintes"}.` }, status: "ATIVO", source: "LOTE_INTERNO", effectiveFrom: now, actorUsuarioId: context.user.id })));
      await insertActionAudit(tx, { action: "BULK_UPDATE", entityType: "Taxpayer", entityId: `batch:${now.toISOString()}`, payload: { query, count: ids.length, status }, authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId });
    }, { timeoutMs: 5000 });
    revalidatePath("/tributacao/pessoas");
    return { id: String(ids.length) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível executar a atualização em lote." };
  }
}
