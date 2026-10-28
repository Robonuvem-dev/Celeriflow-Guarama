import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { appendPropertyAudit, appendPropertyRegistryEntry, listPropertyFiscalRecords, lockProperty, lockPropertyKey, readAnnualPropertyValuation, readLatestPropertyProfile, readLatestPropertyValuationRule, readProperty, readPropertyCatalog, readPropertyRegistryEntry, readPropertyTax, readPropertyValuationMemory, saveAnnualPropertyValuation } from "@/db/repositories/tax-property/records";
import { propertySnapshot } from "@/db/repositories/tax-property/snapshot";
import type { PropertyRegistryRecord } from "@/db/repositories/tax-property/contracts";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxScopeSnapshot } from "./scope";
import { fiscalCatalogSchema } from "./configurable-cadastres";

const decimalText = z.string().trim().min(1).refine(value => {
  try { const number = new Decimal(value); return number.isFinite() && number.gte(0) && number.lte("999999999999"); } catch { return false; }
}, "Informe um valor decimal não negativo válido.");

export const propertyValuationRuleSchema = z.object({
  taxId: z.string().min(1), year: z.number().int().min(1900).max(9999),
  landUnitValue: decimalText, constructionUnitValue: decimalText,
  landFactor: decimalText, constructionFactor: decimalText, globalFactor: decimalText,
  legalBasis: z.string().trim().min(1).max(4000), reference: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative(),
  landSource: z.enum(["RULE", "PGV_FRONTAGES"]).optional(),
});

export async function evaluateConfiguredPropertyValuation(tx: DatabaseTransaction, configuration: z.infer<typeof propertyValuationRuleSchema>, property: { id: string; landArea: number | string; builtArea: number | string }, scope: { governmentEntityId: string | null; budgetUnitId: string | null }) {
  if (!scope.governmentEntityId || !scope.budgetUnitId) throw new Error("Concilie ente e UG antes da avaliação configurada.");
  const faces: { catalogId: string; catalogVersion: number; recordId: string; frontage: string; landUnitValue: string }[] = [];
  let landUnitValue = configuration.landUnitValue;
  let frontagePropertyId = property.id;
  if (configuration.landSource === "PGV_FRONTAGES") {
    const profile = await readLatestPropertyProfile(tx, property.id);
    const profileData = taxScopeSnapshot(profile?.data);
    if (profile && (profileData.governmentEntityId !== scope.governmentEntityId || profileData.budgetUnitId !== scope.budgetUnitId)) throw new Error("Imóvel e avaliação pertencem a origens diferentes.");
    if (profileData.kind === "Unidade" && typeof profileData.parentId === "string") frontagePropertyId = profileData.parentId;
    const records = await listPropertyFiscalRecords(tx, [frontagePropertyId]);
    const latest = new Map<string, typeof records[number]>();
    for (const record of records) if (!latest.has(record.title)) latest.set(record.title, record);
    let frontageSum = new Decimal(0); let weightedValue = new Decimal(0);
    for (const record of latest.values()) {
      const snapshot = taxScopeSnapshot(record.data);
      if (record.status !== "ATIVO" || snapshot.kind !== "PGV" || snapshot.budgetUnitId !== scope.budgetUnitId || snapshot.governmentEntityId !== scope.governmentEntityId) continue;
      const definition = await readPropertyCatalog(tx, record.title);
      const catalog = fiscalCatalogSchema.parse(definition.data);
      if (!catalog.active || catalog.kind !== "PGV" || catalog.governmentEntityId !== scope.governmentEntityId || catalog.budgetUnitId !== scope.budgetUnitId) throw new Error("A testada possui PGV desativada ou de outra origem; revise o cadastro.");
      const frontage = new Decimal(decimalText.parse(String(snapshot.frontage)));
      const unit = new Decimal(decimalText.parse(catalog.landUnitValue ?? ""));
      if (frontage.lte(0)) throw new Error("Testada da PGV deve ser positiva.");
      frontageSum = frontageSum.plus(frontage); weightedValue = weightedValue.plus(frontage.mul(unit));
      faces.push({ catalogId: definition.entityId, catalogVersion: definition.version, recordId: record.id, frontage: frontage.toString(), landUnitValue: unit.toString() });
    }
    if (frontageSum.lte(0)) throw new Error("Vincule PGVs e testadas da origem selecionada antes da avaliação.");
    landUnitValue = weightedValue.div(frontageSum).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
  }
  const evaluated = evaluatePropertyValuation({ ...configuration, landUnitValue }, property);
  return { value: evaluated.value, memory: { ...evaluated.memory, landSource: configuration.landSource ?? "RULE", frontagePropertyId, frontageFormula: configuration.landSource === "PGV_FRONTAGES" ? "soma(testada × valor/m²) / soma(testadas)" : null, faces } };
}

export function evaluatePropertyValuation(rule: Pick<z.infer<typeof propertyValuationRuleSchema>, "landUnitValue" | "constructionUnitValue" | "landFactor" | "constructionFactor" | "globalFactor">, property: { landArea: number | string; builtArea: number | string }) {
  const landArea = new Decimal(decimalText.parse(String(property.landArea)));
  const builtArea = new Decimal(decimalText.parse(String(property.builtArea)));
  const land = landArea.mul(decimalText.parse(rule.landUnitValue)).mul(decimalText.parse(rule.landFactor));
  const construction = builtArea.mul(decimalText.parse(rule.constructionUnitValue)).mul(decimalText.parse(rule.constructionFactor));
  const factor = new Decimal(decimalText.parse(rule.globalFactor));
  if (factor.lte(0)) throw new Error("O fator global deve ser maior que zero.");
  const value = land.plus(construction).mul(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (value.lte(0) || value.gte("10000000000000000")) throw new Error("A avaliação deve ser positiva e caber no valor monetário do cadastro.");
  return { value, memory: { formula: "(areaTerreno × valorUnitarioTerreno × fatorTerreno + areaConstruida × valorUnitarioConstrucao × fatorConstrucao) × fatorGlobal", landArea: landArea.toString(), builtArea: builtArea.toString(), landValue: land.toFixed(6), constructionValue: construction.toFixed(6), venalValue: value.toFixed(2), ...rule } };
}

async function scopeForRule(tx: DatabaseTransaction, actor: TaxActor, taxId: string) {
  const tax = await readPropertyTax(tx, taxId);
  if (!tax.isActive || !["IPTU", "ITBI"].includes(tax.name.toUpperCase())) throw new Error("Selecione um tributo IPTU ou ITBI ativo.");
  const scope = await resolveTaxAssessmentScope(tx, actor, taxId);
  if (!scope.budgetUnitId || !scope.governmentEntityId) throw new Error("Concilie a UG e o ente arrecadador antes de configurar avaliações.");
  return { ...scope, taxName: tax.name };
}

export async function publishPropertyValuationRule(connection: DatabaseConnection, actor: TaxActor, value: z.infer<typeof propertyValuationRuleSchema>): Promise<PropertyRegistryRecord> {
  const input = propertyValuationRuleSchema.parse(value);
  if (new Decimal(input.globalFactor).lte(0)) throw new Error("O fator global deve ser maior que zero.");
  return withDatabaseTransaction(connection, async tx => {
    const scope = await scopeForRule(tx, actor, input.taxId);
    await resolveTaxFinancialYear(tx, input.year, scope);
    const title = `${input.taxId}:${scope.budgetUnitId}:${input.year}`;
    await lockPropertyKey(tx, `PROPERTY_VALUATION_RULE:${title}`);
    const previous = await readLatestPropertyValuationRule(tx, input.taxId, "PROPERTY_VALUATION_RULE", title);
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("A regra foi alterada por outro usuário. Recarregue antes de publicar.");
    const entry = await appendPropertyRegistryEntry(tx, { entityType: "TAX", entityId: input.taxId, category: "PROPERTY_VALUATION_RULE", title, source: "PARAMETRIZACAO_MUNICIPAL", effectiveFrom: new Date(Date.UTC(input.year, 0, 1)), effectiveUntil: new Date(Date.UTC(input.year, 11, 31, 23, 59, 59, 999)), version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: propertySnapshot({ ...input, ...scope }) });
    await appendPropertyAudit(tx, { action: "PUBLISH_PROPERTY_VALUATION_RULE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: propertySnapshot({ previousRuleId: previous?.id ?? null, ...input, ...scope }) });
    return entry;
  });
}

export async function saveConfiguredPropertyValuation(connection: DatabaseConnection, actor: TaxActor, input: { ruleId: string; realEstateId: string; expectedValuationUpdatedAt: string | null; reason: string }): Promise<PropertyRegistryRecord> {
  if (!input.reason.trim()) throw new Error("Informe o fundamento da avaliação.");
  return withDatabaseTransaction(connection, async tx => {
    const rule = await readPropertyRegistryEntry(tx, input.ruleId);
    if (rule.category !== "PROPERTY_VALUATION_RULE" || rule.entityType !== "TAX") throw new Error("Regra de avaliação inválida.");
    const configuration = propertyValuationRuleSchema.parse(rule.data);
    const stored = taxScopeSnapshot(rule.data);
    const scope = await scopeForRule(tx, actor, rule.entityId);
    if (scope.budgetUnitId !== stored.budgetUnitId || scope.governmentEntityId !== stored.governmentEntityId) throw new Error("A origem da regra diverge do mapeamento atual.");
    await resolveTaxFinancialYear(tx, configuration.year, scope);
    await lockPropertyKey(tx, `PROPERTY_VALUATION_RULE:${rule.title}`);
    const latest = await readLatestPropertyValuationRule(tx, rule.entityId, rule.category, rule.title);
    if (latest?.id !== rule.id) throw new Error("A regra selecionada foi substituída. Recarregue a avaliação.");
    await lockProperty(tx, input.realEstateId);
    const property = await readProperty(tx, input.realEstateId);
    if (property.landArea === null || property.builtArea === null) throw new Error("Informe as áreas do imóvel; valores ausentes não são tratados como zero.");
    const evaluated = await evaluateConfiguredPropertyValuation(tx, configuration, { id: property.id, landArea: property.landArea, builtArea: property.builtArea }, scope);
    const category = `CONFIGURED_VALUATION_${scope.taxName.toUpperCase()}`;
    const lastMemory = await readPropertyValuationMemory(tx, property.id, category, { year: configuration.year });
    let valuationId: string | null = null;
    if (scope.taxName.toUpperCase() === "IPTU") {
      const previous = await readAnnualPropertyValuation(tx, property.id, configuration.year);
      if ((previous?.updatedAt.toISOString() ?? null) !== input.expectedValuationUpdatedAt) throw new Error("A avaliação anual foi alterada. Recarregue antes de salvar.");
      const previousMemory = previous ? await readPropertyValuationMemory(tx, property.id, category, { valuationId: previous.id }) : null;
      if (previousMemory && taxScopeSnapshot(previousMemory.data).budgetUnitId !== scope.budgetUnitId) throw new Error("A avaliação anual pertence a outra UG.");
      const saved = await saveAnnualPropertyValuation(tx, { realEstateId: property.id, year: configuration.year, landUnitValue: evaluated.memory.landUnitValue, constructionUnitValue: configuration.constructionUnitValue, venalValueDecimal: evaluated.value, source: "REGRA_MUNICIPAL", notes: input.reason.trim() });
      valuationId = saved.id;
      await appendPropertyAudit(tx, { action: "SAVE_PROPERTY_VALUATION", entityType: "PropertyValuation", entityId: saved.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: propertySnapshot({ before: previous ? { value: previous.venalValueDecimal.toFixed(2), source: previous.source, updatedAt: previous.updatedAt.toISOString() } : null, after: evaluated.memory, ruleId: rule.id, reason: input.reason.trim(), ...scope }) });
    }
    return appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: property.id, category, title: String(configuration.year), version: (lastMemory?.version ?? 0) + 1, actorUsuarioId: actor.usuarioId, source: "REGRA_MUNICIPAL", data: propertySnapshot({ ...evaluated.memory, ...scope, ruleId: rule.id, ruleVersion: rule.version, valuationId, reason: input.reason.trim() }) });
  });
}
