"use server";

import { withDatabaseTransaction } from "@/db/transaction";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { actionProperty, actionActivePropertyCharacteristics } from "@/db/repositories/tax-actions/property";
import { insertProperty } from "@/db/repositories/tax-property/records";
import { insertActionRegistryEntries, insertActionAudit } from "@/db/repositories/tax-actions/registry";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPropertyCadastralAccess } from "@/lib/tributacao/property-access";
import { calculateTerritorialFraction, previewPropertyValuation } from "@/lib/tributacao/property-cadastral-engine";
import { attributePropertyHistory } from "@/lib/tributacao/property-history";

type Result<T = undefined> = { data?: T; error?: string };

function text(value: unknown, label: string, required = true) {
  const parsed = String(value ?? "").trim();
  if (required && !parsed) throw new Error(`${label} é obrigatório.`);
  return parsed;
}

function number(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} deve ser um número não negativo.`);
  return parsed;
}

export async function calculatePropertyPreviewAction(input: { estateId: string; landArea: number; builtArea: number; landUnitValue: number; constructionUnitValue: number; factor: number; taxRate: number }): Promise<Result<{ landValue: string; constructionValue: string; venalValue: string; estimatedTax: string | null; memory: Record<string, string | null> }>> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await assertPropertyCadastralAccess(taxActionConnection(context).db, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input.estateId);
    const preview = previewPropertyValuation(input);
    return { data: { landValue: preview.landValue.toFixed(2), constructionValue: preview.constructionValue.toFixed(2), venalValue: preview.venalValue.toFixed(2), estimatedTax: preview.estimatedTax?.toFixed(2) ?? null, memory: preview.memory } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível calcular a prévia." }; }
}

export async function calculateTerritorialFractionAction(input: { estateId: string; unitLandArea: number; totalLandArea: number }): Promise<Result<{ percentage: string }>> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await assertPropertyCadastralAccess(taxActionConnection(context).db, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input.estateId);
    return { data: { percentage: calculateTerritorialFraction(input).toFixed(6) } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível calcular a fração territorial." }; }
}

export async function createCondominiumSubunit(input: { parentId: string; municipalInsc: string; registration?: string; unitLabel: string; builtArea: number; unitLandArea: number }): Promise<Result<{ id: string; fraction: string }>> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    const result = await withDatabaseTransaction(taxActionConnection(context), async (tx) => {
      await attributePropertyHistory(tx, context.user.id);
      await assertPropertyCadastralAccess(tx, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input.parentId);
      const parent = await actionProperty(tx, input.parentId);
      if (!parent) throw new Error("Imóvel principal não encontrado.");
      const totalArea = number(parent.landArea, "Área total do imóvel principal");
      const fraction = calculateTerritorialFraction({ unitLandArea: number(input.unitLandArea, "Área territorial da unidade"), totalLandArea: totalArea });
      const child = await insertProperty(tx, { taxpayerId: parent.taxpayerId, municipalInsc: text(input.municipalInsc, "Inscrição imobiliária"), registration: text(input.registration, "Matrícula", false) || null, propertyType: "Subunidade", status: parent.status, streetName: parent.streetName, number: parent.number, complement: input.unitLabel, lot: parent.lot, block: parent.block, landArea: input.unitLandArea, builtArea: number(input.builtArea, "Área construída"), propertyUse: parent.propertyUse, fiscalZone: parent.fiscalZone, neighborhoodId: parent.neighborhoodId });
      await insertActionRegistryEntries(tx, [
        { entityType: "REAL_ESTATE", entityId: parent.id, category: "CONDOMINIO", title: `Subunidade ${input.unitLabel}`, data: { details: "Subunidade vinculada ao imóvel principal.", childId: child.id, municipalInsc: child.municipalInsc, fraction: fraction.toFixed(6) }, source: "INTERNO", actorUsuarioId: context.user.id },
        { entityType: "REAL_ESTATE", entityId: child.id, category: "UNIDADE", title: input.unitLabel, data: { details: "Unidade vinculada ao condomínio/imóvel principal.", parentId: parent.id, fraction: fraction.toFixed(6) }, source: "INTERNO", actorUsuarioId: context.user.id },
      ]);
      await insertActionAudit(tx, { action: "CREATE_SUBUNIT", entityType: "RealEstate", entityId: child.id, payload: { parentId: parent.id, fraction: fraction.toFixed(6) }, authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId });
      return { id: child.id, fraction: fraction.toFixed(6) };
    }, { timeoutMs: 5000 });
    revalidatePath(`/tributacao/imoveis/${input.parentId}`); revalidatePath("/tributacao/imoveis");
    return { data: result };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível criar a subunidade." }; }
}

export async function copyPropertyCharacteristics(input: { sourceId: string; targetId: string }): Promise<Result<{ copied: number }>> {
  try {
    if (input.sourceId === input.targetId) throw new Error("Selecione imóveis diferentes para copiar características.");
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const copied = await withDatabaseTransaction(taxActionConnection(context), async (tx) => {
      const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
      const origin = await assertPropertyCadastralAccess(tx, actor, input.sourceId);
      const destination = await assertPropertyCadastralAccess(tx, actor, input.targetId);
      if (origin.scope.budgetUnitId !== destination.scope.budgetUnitId || origin.scope.governmentEntityId !== destination.scope.governmentEntityId) throw new Error("Copie características somente entre imóveis da mesma origem conciliada.");
      const [source, target, entries] = await Promise.all([
        actionProperty(tx, input.sourceId),
        actionProperty(tx, input.targetId),
        actionActivePropertyCharacteristics(tx, input.sourceId),
      ]);
      if (!source || !target) throw new Error("Imóvel de origem ou destino não encontrado.");
      if (!entries.length) throw new Error("O imóvel de origem não possui características ativas para copiar.");
      await insertActionRegistryEntries(tx, entries.map((entry) => ({ entityType: "REAL_ESTATE", entityId: input.targetId, category: entry.category, title: entry.title, data: { copiedFrom: input.sourceId, snapshot: entry.data }, status: "PENDENTE_VALIDACAO", source: "COPIA_CADASTRAL", effectiveFrom: new Date(), actorUsuarioId: context.user.id, version: entry.version + 1 })));
      await insertActionAudit(tx, { action: "COPY_CHARACTERISTICS", entityType: "RealEstate", entityId: input.targetId, payload: { sourceId: input.sourceId, count: entries.length, status: "PENDENTE_VALIDACAO" }, authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId });
      return entries.length;
    }, { timeoutMs: 5000 });
    revalidatePath(`/tributacao/imoveis/${input.targetId}`);
    return { data: { copied } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível copiar as características." }; }
}
