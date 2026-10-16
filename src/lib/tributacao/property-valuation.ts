import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxScopeSnapshot } from "./scope";
import { fiscalCatalogSchema } from "./configurable-cadastres";

const decimalText = z.string().trim().min(1).refine(value => {
  try { const number = new Prisma.Decimal(value); return number.isFinite() && number.gte(0) && number.lte("999999999999"); } catch { return false; }
}, "Informe um valor decimal não negativo válido.");

export const propertyValuationRuleSchema = z.object({
  taxId: z.string().min(1), year: z.number().int().min(1900).max(9999),
  landUnitValue: decimalText, constructionUnitValue: decimalText,
  landFactor: decimalText, constructionFactor: decimalText, globalFactor: decimalText,
  legalBasis: z.string().trim().min(1).max(4000), reference: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative(),
  landSource: z.enum(["RULE", "PGV_FRONTAGES"]).optional(),
});

export async function evaluateConfiguredPropertyValuation(tx: Prisma.TransactionClient, configuration: z.infer<typeof propertyValuationRuleSchema>, property: { id: string; landArea: number | string; builtArea: number | string }, scope: { governmentEntityId: string | null; budgetUnitId: string | null }) {
  if (!scope.governmentEntityId || !scope.budgetUnitId) throw new Error("Concilie ente e UG antes da avaliação configurada.");
  const faces: { catalogId: string; catalogVersion: number; recordId: string; frontage: string; landUnitValue: string }[] = [];
  let landUnitValue = configuration.landUnitValue;
  let frontagePropertyId = property.id;
  if (configuration.landSource === "PGV_FRONTAGES") {
    const profile = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
    const profileData = taxScopeSnapshot(profile?.data);
    if (profile && (profileData.governmentEntityId !== scope.governmentEntityId || profileData.budgetUnitId !== scope.budgetUnitId)) throw new Error("Imóvel e avaliação pertencem a origens diferentes.");
    if (profileData.kind === "Unidade" && typeof profileData.parentId === "string") frontagePropertyId = profileData.parentId;
    const records = await tx.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", entityId: frontagePropertyId, category: "TYPED_FISCAL_RECORD" }, orderBy: { version: "desc" } });
    const latest = new Map<string, typeof records[number]>();
    for (const record of records) if (!latest.has(record.title)) latest.set(record.title, record);
    let frontageSum = new Prisma.Decimal(0); let weightedValue = new Prisma.Decimal(0);
    for (const record of latest.values()) {
      const snapshot = taxScopeSnapshot(record.data);
      if (record.status !== "ATIVO" || snapshot.kind !== "PGV" || snapshot.budgetUnitId !== scope.budgetUnitId || snapshot.governmentEntityId !== scope.governmentEntityId) continue;
      const definition = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "FISCAL_CATALOG", entityId: record.title, category: "TYPED_FISCAL_CATALOG" }, orderBy: { version: "desc" } });
      const catalog = fiscalCatalogSchema.parse(definition.data);
      if (!catalog.active || catalog.kind !== "PGV" || catalog.governmentEntityId !== scope.governmentEntityId || catalog.budgetUnitId !== scope.budgetUnitId) throw new Error("A testada possui PGV desativada ou de outra origem; revise o cadastro.");
      const frontage = new Prisma.Decimal(decimalText.parse(String(snapshot.frontage)));
      const unit = new Prisma.Decimal(decimalText.parse(catalog.landUnitValue ?? ""));
      if (frontage.lte(0)) throw new Error("Testada da PGV deve ser positiva.");
      frontageSum = frontageSum.plus(frontage); weightedValue = weightedValue.plus(frontage.mul(unit));
      faces.push({ catalogId: definition.entityId, catalogVersion: definition.version, recordId: record.id, frontage: frontage.toString(), landUnitValue: unit.toString() });
    }
    if (frontageSum.lte(0)) throw new Error("Vincule PGVs e testadas da origem selecionada antes da avaliação.");
    landUnitValue = weightedValue.div(frontageSum).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP).toFixed(6);
  }
  const evaluated = evaluatePropertyValuation({ ...configuration, landUnitValue }, property);
  return { value: evaluated.value, memory: { ...evaluated.memory, landSource: configuration.landSource ?? "RULE", frontagePropertyId, frontageFormula: configuration.landSource === "PGV_FRONTAGES" ? "soma(testada × valor/m²) / soma(testadas)" : null, faces } };
}

export function evaluatePropertyValuation(rule: Pick<z.infer<typeof propertyValuationRuleSchema>, "landUnitValue" | "constructionUnitValue" | "landFactor" | "constructionFactor" | "globalFactor">, property: { landArea: number | string; builtArea: number | string }) {
  const landArea = new Prisma.Decimal(decimalText.parse(String(property.landArea)));
  const builtArea = new Prisma.Decimal(decimalText.parse(String(property.builtArea)));
  const land = landArea.mul(decimalText.parse(rule.landUnitValue)).mul(decimalText.parse(rule.landFactor));
  const construction = builtArea.mul(decimalText.parse(rule.constructionUnitValue)).mul(decimalText.parse(rule.constructionFactor));
  const factor = new Prisma.Decimal(decimalText.parse(rule.globalFactor));
  if (factor.lte(0)) throw new Error("O fator global deve ser maior que zero.");
  const value = land.plus(construction).mul(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (value.lte(0) || value.gte("10000000000000000")) throw new Error("A avaliação deve ser positiva e caber no valor monetário do cadastro.");
  return { value, memory: { formula: "(areaTerreno × valorUnitarioTerreno × fatorTerreno + areaConstruida × valorUnitarioConstrucao × fatorConstrucao) × fatorGlobal", landArea: landArea.toString(), builtArea: builtArea.toString(), landValue: land.toFixed(6), constructionValue: construction.toFixed(6), venalValue: value.toFixed(2), ...rule } };
}

async function scopeForRule(tx: Prisma.TransactionClient, actor: TaxActor, taxId: string) {
  const tax = await tx.tax.findUniqueOrThrow({ where: { id: taxId } });
  if (!tax.isActive || !["IPTU", "ITBI"].includes(tax.name.toUpperCase())) throw new Error("Selecione um tributo IPTU ou ITBI ativo.");
  const scope = await resolveTaxAssessmentScope(tx, actor, taxId);
  if (!scope.budgetUnitId || !scope.governmentEntityId) throw new Error("Concilie a UG e o ente arrecadador antes de configurar avaliações.");
  return { ...scope, taxName: tax.name };
}

export async function publishPropertyValuationRule(db: PrismaClient, actor: TaxActor, value: z.infer<typeof propertyValuationRuleSchema>) {
  const input = propertyValuationRuleSchema.parse(value);
  if (new Prisma.Decimal(input.globalFactor).lte(0)) throw new Error("O fator global deve ser maior que zero.");
  return db.$transaction(async tx => {
    const scope = await scopeForRule(tx, actor, input.taxId);
    await resolveTaxFinancialYear(tx, input.year, scope);
    const title = `${input.taxId}:${scope.budgetUnitId}:${input.year}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`PROPERTY_VALUATION_RULE:${title}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "TAX", entityId: input.taxId, category: "PROPERTY_VALUATION_RULE", title }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("A regra foi alterada por outro usuário. Recarregue antes de publicar.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "TAX", entityId: input.taxId, category: "PROPERTY_VALUATION_RULE", title, source: "PARAMETRIZACAO_MUNICIPAL", effectiveFrom: new Date(Date.UTC(input.year, 0, 1)), effectiveUntil: new Date(Date.UTC(input.year, 11, 31, 23, 59, 59, 999)), version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, ...scope } } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_PROPERTY_VALUATION_RULE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousRuleId: previous?.id ?? null, ...input, ...scope } } });
    return entry;
  });
}

export async function saveConfiguredPropertyValuation(db: PrismaClient, actor: TaxActor, input: { ruleId: string; realEstateId: string; expectedValuationUpdatedAt: string | null; reason: string }) {
  if (!input.reason.trim()) throw new Error("Informe o fundamento da avaliação.");
  return db.$transaction(async tx => {
    const rule = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: input.ruleId } });
    if (rule.category !== "PROPERTY_VALUATION_RULE" || rule.entityType !== "TAX") throw new Error("Regra de avaliação inválida.");
    const configuration = propertyValuationRuleSchema.parse(rule.data);
    const stored = taxScopeSnapshot(rule.data);
    const scope = await scopeForRule(tx, actor, rule.entityId);
    if (scope.budgetUnitId !== stored.budgetUnitId || scope.governmentEntityId !== stored.governmentEntityId) throw new Error("A origem da regra diverge do mapeamento atual.");
    await resolveTaxFinancialYear(tx, configuration.year, scope);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`PROPERTY_VALUATION_RULE:${rule.title}`},0))::text`;
    const latest = await tx.taxRegistryEntry.findFirst({ where: { entityType: "TAX", entityId: rule.entityId, category: rule.category, title: rule.title }, orderBy: { version: "desc" } });
    if (latest?.id !== rule.id) throw new Error("A regra selecionada foi substituída. Recarregue a avaliação.");
    await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${input.realEstateId} FOR UPDATE`;
    const property = await tx.realEstate.findUniqueOrThrow({ where: { id: input.realEstateId } });
    if (property.landArea === null || property.builtArea === null) throw new Error("Informe as áreas do imóvel; valores ausentes não são tratados como zero.");
    const evaluated = await evaluateConfiguredPropertyValuation(tx, configuration, { id: property.id, landArea: property.landArea, builtArea: property.builtArea }, scope);
    const category = `CONFIGURED_VALUATION_${scope.taxName.toUpperCase()}`;
    const lastMemory = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: property.id, category, title: String(configuration.year) }, orderBy: { version: "desc" } });
    let valuationId: string | null = null;
    if (scope.taxName.toUpperCase() === "IPTU") {
      const previous = await tx.propertyValuation.findUnique({ where: { realEstateId_year: { realEstateId: property.id, year: configuration.year } } });
      if ((previous?.updatedAt.toISOString() ?? null) !== input.expectedValuationUpdatedAt) throw new Error("A avaliação anual foi alterada. Recarregue antes de salvar.");
      const previousMemory = previous ? await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: property.id, category, data: { path: ["valuationId"], equals: previous.id } }, orderBy: { version: "desc" } }) : null;
      if (previousMemory && taxScopeSnapshot(previousMemory.data).budgetUnitId !== scope.budgetUnitId) throw new Error("A avaliação anual pertence a outra UG.");
      const saved = await tx.propertyValuation.upsert({ where: { realEstateId_year: { realEstateId: property.id, year: configuration.year } }, create: { realEstateId: property.id, year: configuration.year, landUnitValue: evaluated.memory.landUnitValue, constructionUnitValue: configuration.constructionUnitValue, venalValueDecimal: evaluated.value, source: "REGRA_MUNICIPAL", notes: input.reason.trim() }, update: { landUnitValue: evaluated.memory.landUnitValue, constructionUnitValue: configuration.constructionUnitValue, venalValueDecimal: evaluated.value, source: "REGRA_MUNICIPAL", notes: input.reason.trim() } });
      valuationId = saved.id;
      await tx.taxAuditLog.create({ data: { action: "SAVE_PROPERTY_VALUATION", entityType: "PropertyValuation", entityId: saved.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous ? { value: previous.venalValueDecimal.toFixed(2), source: previous.source, updatedAt: previous.updatedAt.toISOString() } : null, after: evaluated.memory, ruleId: rule.id, reason: input.reason.trim(), ...scope } } });
    }
    return tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: property.id, category, title: String(configuration.year), version: (lastMemory?.version ?? 0) + 1, actorUsuarioId: actor.usuarioId, source: "REGRA_MUNICIPAL", data: { ...evaluated.memory, ...scope, ruleId: rule.id, ruleVersion: rule.version, valuationId, reason: input.reason.trim() } } });
  });
}
