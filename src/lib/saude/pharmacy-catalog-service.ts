import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { materials } from "@/db/schema/assets-stock";
import { healthCatmatUnitMappings, healthDcbSubstances, healthMaterialProfiles } from "@/db/schema/health-pharmacy";
import { pharmacyRecord } from "@/db/repositories/health-pharmacy/records";
import type { HealthPharmacyContext } from "@/lib/contracts/health-pharmacy";
const optionalText = z.string().trim().min(1).max(2000).nullable();

export async function saveDcbSubstance(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(500), casNumber: z.string().trim().regex(/^\d{2,7}-\d{2}-\d$/, "Informe o número CAS no formato válido."), version: z.string().trim().min(1).max(80), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  const digits = input.casNumber.replaceAll("-", "");
  const checksum = digits.slice(0, -1).split("").reverse().reduce((sum, digit, index) => sum + Number(digit) * (index + 1), 0) % 10;
  if (checksum !== Number(digits.at(-1))) throw new Error("Dígito verificador do CAS inválido.");
  return withDatabaseTransaction(connection, async tx => pharmacyRecord((await tx.insert(healthDcbSubstances).values({ ...input, createdByUsuarioId: context.user.id })
    .onConflictDoUpdate({ target: [healthDcbSubstances.code, healthDcbSubstances.version], set: { name: input.name, casNumber: input.casNumber, sourceReference: input.sourceReference, isActive: true } }).returning())[0]), { timeoutMs: 5_000 });
}

export async function savePharmacyProductCatalog(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ materialId: z.string().min(1), catmatCode: optionalText, supplyUnitCode: optionalText, stockUnitsPerSupply: z.number().positive().max(1000000), renameMember: z.boolean(), renameReference: optionalText, remumeMember: z.boolean(), remumeReference: optionalText, prescriptionRecommendation: optionalText, pharmaceuticalComponent: z.enum(["BASIC", "SPECIALIZED", "STRATEGIC"]).nullable(), dcbSubstanceId: z.string().nullable() }).strict().parse(raw);
  if (input.renameMember && !input.renameReference || input.remumeMember && !input.remumeReference) throw new Error("Informe a referência/versão de cada relação em que o produto está incluído.");
  return withDatabaseTransaction(connection, async tx => {
    const { profile } = pharmacyRecord((await tx.select({ profile: healthMaterialProfiles }).from(healthMaterialProfiles).innerJoin(materials, eq(materials.id, healthMaterialProfiles.materialId)).where(and(eq(healthMaterialProfiles.materialId, input.materialId), eq(healthMaterialProfiles.isActive, true), eq(materials.isActive, true))).limit(1))[0]);
    const substance = input.dcbSubstanceId ? pharmacyRecord((await tx.select().from(healthDcbSubstances).where(and(eq(healthDcbSubstances.id, input.dcbSubstanceId), eq(healthDcbSubstances.isActive, true))).limit(1))[0]) : null;
    const { materialId, ...data } = input;
    void materialId;
    return pharmacyRecord((await tx.update(healthMaterialProfiles).set({ ...data, ...(substance ? { dcbCode: substance.code } : profile.dcbSubstanceId ? { dcbCode: null } : {}) }).where(eq(healthMaterialProfiles.id, profile.id)).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function saveCatmatUnitMapping(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ materialId: z.string().min(1), localUnitCode: z.string().trim().min(1).max(40), officialUnitCode: z.string().trim().min(1).max(80), localUnitsPerOfficial: z.number().positive().max(1000000), reference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const row = pharmacyRecord((await tx.select({ profile: healthMaterialProfiles, material: materials }).from(healthMaterialProfiles).innerJoin(materials, eq(materials.id, healthMaterialProfiles.materialId)).where(and(eq(healthMaterialProfiles.materialId, input.materialId), eq(healthMaterialProfiles.isActive, true))).limit(1))[0]);
    const profile = { ...row.profile, material: row.material };
    if (!profile.catmatCode || input.localUnitCode !== profile.material.unitOfMeasure) throw new Error("Informe CATMAT no produto e utilize a unidade do estoque no mapeamento.");
    const { materialId, ...data } = input; void materialId;
    return pharmacyRecord((await tx.insert(healthCatmatUnitMappings).values({ profileId: profile.id, ...data }).onConflictDoUpdate({ target: [healthCatmatUnitMappings.profileId, healthCatmatUnitMappings.officialUnitCode], set: { ...data, isActive: true } }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function pharmacyQuantityInOfficialUnits(context: HealthPharmacyContext, materialId: string, officialUnitCode: string, stockQuantity: number) {
  z.number().nonnegative().finite().parse(stockQuantity);
  const { mapping } = pharmacyRecord((await (context.database ?? databaseConnection.db).select({ mapping: healthCatmatUnitMappings }).from(healthCatmatUnitMappings).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.id, healthCatmatUnitMappings.profileId)).where(and(eq(healthMaterialProfiles.materialId, materialId), eq(healthMaterialProfiles.isActive, true), eq(healthCatmatUnitMappings.officialUnitCode, officialUnitCode), eq(healthCatmatUnitMappings.isActive, true))).limit(1))[0]);
  return { officialUnitCode, quantity: stockQuantity / mapping.localUnitsPerOfficial, localUnitsPerOfficial: mapping.localUnitsPerOfficial, mappingId: mapping.id, reference: mapping.reference };
}
