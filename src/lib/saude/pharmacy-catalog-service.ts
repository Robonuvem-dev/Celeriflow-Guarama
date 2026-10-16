import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
const optionalText = z.string().trim().min(1).max(2000).nullable();

export async function saveDcbSubstance(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(500), casNumber: z.string().trim().regex(/^\d{2,7}-\d{2}-\d$/, "Informe o número CAS no formato válido."), version: z.string().trim().min(1).max(80), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  const digits = input.casNumber.replaceAll("-", "");
  const checksum = digits.slice(0, -1).split("").reverse().reduce((sum, digit, index) => sum + Number(digit) * (index + 1), 0) % 10;
  if (checksum !== Number(digits.at(-1))) throw new Error("Dígito verificador do CAS inválido.");
  return context.prisma.healthDcbSubstance.upsert({ where: { code_version: { code: input.code, version: input.version } }, create: { ...input, createdByUsuarioId: context.user.id }, update: { name: input.name, casNumber: input.casNumber, sourceReference: input.sourceReference, isActive: true } });
}

export async function savePharmacyProductCatalog(context: AppContext, raw: unknown) {
  const input = z.object({ materialId: z.string().min(1), catmatCode: optionalText, supplyUnitCode: optionalText, stockUnitsPerSupply: z.number().positive().max(1000000), renameMember: z.boolean(), renameReference: optionalText, remumeMember: z.boolean(), remumeReference: optionalText, prescriptionRecommendation: optionalText, pharmaceuticalComponent: z.enum(["BASIC", "SPECIALIZED", "STRATEGIC"]).nullable(), dcbSubstanceId: z.string().nullable() }).strict().parse(raw);
  if (input.renameMember && !input.renameReference || input.remumeMember && !input.remumeReference) throw new Error("Informe a referência/versão de cada relação em que o produto está incluído.");
  return context.prisma.$transaction(async tx => {
    const profile = await tx.healthMaterialProfile.findFirstOrThrow({ where: { materialId: input.materialId, isActive: true, material: { isActive: true } } });
    const substance = input.dcbSubstanceId ? await tx.healthDcbSubstance.findFirstOrThrow({ where: { id: input.dcbSubstanceId, isActive: true } }) : null;
    const { materialId, ...data } = input;
    void materialId;
    return tx.healthMaterialProfile.update({ where: { id: profile.id }, data: { ...data, ...(substance ? { dcbCode: substance.code } : profile.dcbSubstanceId ? { dcbCode: null } : {}) } });
  });
}

export async function saveCatmatUnitMapping(context: AppContext, raw: unknown) {
  const input = z.object({ materialId: z.string().min(1), localUnitCode: z.string().trim().min(1).max(40), officialUnitCode: z.string().trim().min(1).max(80), localUnitsPerOfficial: z.number().positive().max(1000000), reference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  const profile = await context.prisma.healthMaterialProfile.findFirstOrThrow({ where: { materialId: input.materialId, isActive: true }, include: { material: true } });
  if (!profile.catmatCode || input.localUnitCode !== profile.material.unitOfMeasure) throw new Error("Informe CATMAT no produto e utilize a unidade do estoque no mapeamento.");
  const { materialId, ...data } = input; void materialId;
  return context.prisma.healthCatmatUnitMapping.upsert({ where: { profileId_officialUnitCode: { profileId: profile.id, officialUnitCode: input.officialUnitCode } }, create: { profileId: profile.id, ...data }, update: { ...data, isActive: true } });
}

export async function pharmacyQuantityInOfficialUnits(context: AppContext, materialId: string, officialUnitCode: string, stockQuantity: number) {
  z.number().nonnegative().finite().parse(stockQuantity);
  const mapping = await context.prisma.healthCatmatUnitMapping.findFirstOrThrow({ where: { profile: { materialId, isActive: true }, officialUnitCode, isActive: true } });
  return { officialUnitCode, quantity: stockQuantity / mapping.localUnitsPerOfficial, localUnitsPerOfficial: mapping.localUnitsPerOfficial, mappingId: mapping.id, reference: mapping.reference };
}
