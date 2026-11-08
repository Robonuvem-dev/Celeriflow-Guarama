import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import SaldosFontesDespesaClient from "./SaldosFontesDespesaClient";

export const dynamic = "force-dynamic";

export default async function SaldosFontesDespesaPage() {
  await getTenantContextForModule("FINANCEIRO");
  return <SaldosFontesDespesaClient />;
}
