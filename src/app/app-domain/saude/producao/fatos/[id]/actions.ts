"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { reviseManualProductionFact } from "@/lib/saude/production-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
export async function reviseManualFactAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const result = await reviseManualProductionFact(context, { factId: text(data, "factId"), expectedVersion: Number(data.get("expectedVersion")), unitId: text(data, "unitId"), patientId: text(data, "patientId") || null, professionalId: text(data, "professionalId") || null, procedureId: text(data, "procedureId"), agreementId: text(data, "agreementId") || null, quantity: Number(data.get("quantity")), value: text(data, "value") ? Number(data.get("value")) : null, occurredAt: text(data, "occurredAt"), reason: text(data, "reason"), cidReferenceId: text(data, "cidReferenceId") || null, municipality: text(data, "municipality") || null, state: text(data, "state") || null });
  revalidatePath("/saude/producao"); revalidatePath(`/saude/producao/fatos/${encodeURIComponent(result.id)}`);
}
