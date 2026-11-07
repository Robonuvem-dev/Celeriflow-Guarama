import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import DividaFundadaClient from "./DividaFundadaClient";

export const dynamic = "force-dynamic";

export default async function DividaFundadaPage() {
  await getTenantContextForModule("FINANCEIRO");
  return <DividaFundadaClient />;
}
