import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import PcaspMovimentacaoClient from "./PcaspMovimentacaoClient";

export const dynamic = "force-dynamic";

export default async function PcaspMovimentacaoPage() {
  await getTenantContextForModule("FINANCEIRO");
  return <PcaspMovimentacaoClient />;
}
