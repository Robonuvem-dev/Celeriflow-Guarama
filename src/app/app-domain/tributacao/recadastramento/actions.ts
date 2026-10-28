"use server";

import { revalidatePath } from "next/cache";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { withDatabaseTransaction } from "@/db/transaction";
import { actionCampaignProperties } from "@/db/repositories/tax-actions/property";
import { latestActionRegistryEntry, actionActiveRegistryEntry, insertActionRegistryEntries, insertActionAudit } from "@/db/repositories/tax-actions/registry";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

type Result = { error?: string; id?: string; count?: number };

function required(value: unknown, label: string) { const parsed = String(value ?? "").trim(); if (!parsed) throw new Error(`${label} é obrigatório.`); return parsed; }
function date(value: unknown, label: string) { const parsed = new Date(`${required(value, label)}T12:00:00.000Z`); if (Number.isNaN(parsed.getTime())) throw new Error(`${label} inválida.`); return parsed; }

export async function createRecadastramentoCampaign(input: { code: string; title: string; startsAt: string; endsAt: string; fiscalZone?: string; block?: string; status?: string; allowedFields: string[] }): Promise<Result> {
  try {
    const code = required(input.code, "Código").toUpperCase();
    const title = required(input.title, "Título");
    const startsAt = date(input.startsAt, "Início"); const endsAt = date(input.endsAt, "Encerramento");
    if (endsAt < startsAt) throw new Error("O encerramento deve ser posterior ao início.");
    const allowedFields = [...new Set(input.allowedFields.map((field) => field.trim()).filter(Boolean))];
    if (!allowedFields.length) throw new Error("Selecione ao menos um campo permitido ao contribuinte.");
    const context = await taxActionContext("create");
    const properties = await actionCampaignProperties(context.database, input);
    if (!properties.length) throw new Error("Nenhum imóvel corresponde ao recorte informado.");
    await withDatabaseTransaction(context.connection, async (tx) => {
      const existing = await latestActionRegistryEntry(tx, "RECADASTRAMENTO_CAMPAIGN", code, "CAMPOS_PERMITIDOS");
      if (existing) throw new Error("Já existe campanha com este código.");
      const scope = { fiscalZone: input.fiscalZone || null, block: input.block || null, status: input.status || null };
      await insertActionRegistryEntries(tx, [{ entityType: "RECADASTRAMENTO_CAMPAIGN", entityId: code, category: "CAMPOS_PERMITIDOS", title, data: { details: "Configuração de campos e recorte da campanha.", allowedFields, scope, propertyCount: properties.length }, status: "ATIVO", source: "INTERNO", effectiveFrom: startsAt, effectiveUntil: endsAt, actorUsuarioId: context.user.id }]);
      await insertActionRegistryEntries(tx, properties.map((property) => ({ entityType: "REAL_ESTATE", entityId: property.id, category: "CAMPANHA_RECADASTRAMENTO", title, data: { details: `Imóvel incluído no recorte da campanha ${code}.`, campaignCode: code, allowedFields, scope }, status: "ATIVO", source: "RECADASTRAMENTO", effectiveFrom: startsAt, effectiveUntil: endsAt, actorUsuarioId: context.user.id })));
      await insertActionAudit(tx, { action: "CREATE_CAMPAIGN", entityType: "TaxRegistryEntry", entityId: code, payload: { propertyCount: properties.length, allowedFields, scope }, authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId });
    }, { timeoutMs: 5000 });
    revalidatePath("/tributacao/recadastramento"); return { id: code, count: properties.length };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível criar a campanha." }; }
}

export async function submitRecadastramentoRequest(input: { campaignCode: string; estateId: string; field: string; proposedValue: string }): Promise<Result> {
  try {
    const campaignCode = required(input.campaignCode, "Campanha").toUpperCase(); const estateId = required(input.estateId, "Imóvel"); const field = required(input.field, "Campo"); const proposedValue = required(input.proposedValue, "Valor proposto");
    const context = await taxActionContext("create");
    const entry = await withDatabaseTransaction(context.connection, async (tx) => {
      const campaign = await actionActiveRegistryEntry(tx, "RECADASTRAMENTO_CAMPAIGN", campaignCode, "CAMPOS_PERMITIDOS");
      if (!campaign) throw new Error("Campanha não encontrada ou inativa.");
      const now = new Date(); if (campaign.effectiveFrom > now || (campaign.effectiveUntil && campaign.effectiveUntil < now)) throw new Error("A campanha está fora do período de adesão.");
      const config = taxScopeSnapshot(campaign.data);
      const allowedFields = Array.isArray(config.allowedFields) ? config.allowedFields.map(String) : [];
      if (!allowedFields.includes(field)) throw new Error("O campo não está liberado para atualização pelo contribuinte.");
      const included = await actionActiveRegistryEntry(tx, "REAL_ESTATE", estateId, "CAMPANHA_RECADASTRAMENTO", campaign.title);
      if (!included) throw new Error("O imóvel não pertence ao recorte desta campanha.");
      const [created] = await insertActionRegistryEntries(tx, [{ entityType: "REAL_ESTATE", entityId: estateId, category: "PEDIDO_ALTERACAO", title: `Recadastramento ${campaignCode}`, data: { details: `Alteração proposta para ${field}.`, campaignCode, field, proposedValue }, status: "PENDENTE_VALIDACAO", source: "CONTRIBUINTE", effectiveFrom: now, actorUsuarioId: context.user.id }]);
      await insertActionAudit(tx, { action: "REQUEST", entityType: "TaxRegistryEntry", entityId: created.id, payload: { campaignCode, estateId, field }, authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId });
      return created;
    }, { timeoutMs: 5000 });
    revalidatePath("/tributacao/recadastramento"); revalidatePath(`/tributacao/imoveis/${estateId}`); return { id: entry.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível enviar o recadastramento." }; }
}
