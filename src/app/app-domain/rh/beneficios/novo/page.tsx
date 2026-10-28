import { BeneficioForm } from "../BeneficioForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readSupplierOptions } from "@/db/repositories/personnel-pages/records";

export default async function NovoBeneficioPage() {
  const context = await getTenantContextForModule("RH");
  const suppliers = await readSupplierOptions(context.database ?? db);
  
  return (
    <BeneficioForm suppliers={suppliers} />
  );
}
