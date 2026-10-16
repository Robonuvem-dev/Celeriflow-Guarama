"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { publishHealthProcedurePrices } from "@/lib/saude/billing-price-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
export async function publishHealthPricesAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const procedures = data.getAll("procedureId").map(String), values = data.getAll("unitValue").map(String);
  await publishHealthProcedurePrices(context, { unitId: text(data, "unitId"), agreementId: text(data, "agreementId") || null, code: text(data, "code"), name: text(data, "name"), validFrom: text(data, "validFrom"), validUntil: text(data, "validUntil"), sourceReference: text(data, "sourceReference"), items: procedures.map((procedureId, index) => ({ procedureId, unitValue: values[index] })) });
  revalidatePath("/saude/producao/tabelas"); revalidatePath("/saude/producao/previas");
}
