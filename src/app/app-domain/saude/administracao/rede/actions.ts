"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { configureHealthUnitNetwork, saveHealthCareAgreement, saveHealthCareCoverage, saveHealthMaintainer, saveProfessionalWorkingHours, saveHealthProfessionalContact } from "@/lib/saude/care-network-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
export async function saveProfessionalContactAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveHealthProfessionalContact(context, { professionalId: text(data, "professionalId"), phone: text(data, "phone"), email: text(data, "email") || null, zipCode: text(data, "zipCode"), streetName: text(data, "streetName"), number: text(data, "number") });
  revalidatePath("/saude/administracao/rede"); revalidatePath("/cadastros/pessoas-fisicas");
}
export async function saveWorkingHoursAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveProfessionalWorkingHours(context, { assignmentId: text(data, "assignmentId"), weekday: Number(text(data, "weekday")), startTime: text(data, "startTime"), endTime: text(data, "endTime"), validFrom: text(data, "validFrom") || null, validUntil: text(data, "validUntil") || null });
  revalidatePath("/saude/administracao/rede");
}
export async function saveMaintainerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", text(data, "id") ? "update" : "create");
  await saveHealthMaintainer(context, { id: text(data, "id") || undefined, companyId: text(data, "companyId"), bankName: text(data, "bankName"), agency: text(data, "agency"), account: text(data, "account"), characterization: text(data, "characterization"), supportServices: text(data, "supportServices").split(";").map(value => value.trim()).filter(Boolean) });
  revalidatePath("/saude/administracao/rede");
}
export async function saveUnitNetworkAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await configureHealthUnitNetwork(context, { unitId: text(data, "unitId"), maintainerId: text(data, "maintainerId") || null, pharmacyReportingUnitId: text(data, "pharmacyReportingUnitId") || null, spontaneousProviderUnitId: text(data, "spontaneousProviderUnitId") || null });
  revalidatePath("/saude/administracao/rede");
}
export async function saveAgreementAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", text(data, "id") ? "update" : "create");
  await saveHealthCareAgreement(context, { id: text(data, "id") || undefined, code: text(data, "code"), name: text(data, "name"), covenantId: text(data, "covenantId") || null, validFrom: text(data, "validFrom"), validUntil: text(data, "validUntil") || null, isActive: data.get("isActive") !== "false" });
  revalidatePath("/saude/administracao/rede");
}
export async function saveCoverageAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", text(data, "id") ? "update" : "create");
  await saveHealthCareCoverage(context, { id: text(data, "id") || undefined, agreementId: text(data, "agreementId"), unitId: text(data, "unitId"), specialtyId: text(data, "specialtyId") || null, procedureId: text(data, "procedureId") || null, validFrom: text(data, "validFrom"), validUntil: text(data, "validUntil") || null, unitValue: text(data, "unitValue") || null, auxiliaryTable: text(data, "auxiliaryTable") || null, isActive: data.get("isActive") !== "false" });
  revalidatePath("/saude/administracao/rede");
}
