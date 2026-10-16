"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveCatmatUnitMapping, saveDcbSubstance, savePharmacyProductCatalog } from "@/lib/saude/pharmacy-catalog-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const nullable = (data: FormData, key: string) => text(data, key) || null;
export async function saveDcbSubstanceAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveDcbSubstance(context, { code: text(data, "code"), name: text(data, "name"), casNumber: text(data, "casNumber"), version: text(data, "version"), sourceReference: text(data, "sourceReference") });
  revalidatePath("/saude/farmacia/catalogo");
}
export async function savePharmacyCatalogAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await savePharmacyProductCatalog(context, { materialId: text(data, "materialId"), catmatCode: nullable(data, "catmatCode"), supplyUnitCode: nullable(data, "supplyUnitCode"), stockUnitsPerSupply: Number(text(data, "stockUnitsPerSupply")), renameMember: data.get("renameMember") === "on", renameReference: nullable(data, "renameReference"), remumeMember: data.get("remumeMember") === "on", remumeReference: nullable(data, "remumeReference"), prescriptionRecommendation: nullable(data, "prescriptionRecommendation"), pharmaceuticalComponent: nullable(data, "pharmaceuticalComponent"), dcbSubstanceId: nullable(data, "dcbSubstanceId") });
  revalidatePath("/saude/farmacia/catalogo"); revalidatePath("/saude/farmacia");
}
export async function saveCatmatMappingAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveCatmatUnitMapping(context, { materialId: text(data, "materialId"), localUnitCode: text(data, "localUnitCode"), officialUnitCode: text(data, "officialUnitCode"), localUnitsPerOfficial: Number(text(data, "localUnitsPerOfficial")), reference: text(data, "reference") });
  revalidatePath("/saude/farmacia/catalogo");
}
