import Link from "next/link";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { RightsProcessingForm } from "./RightsProcessingForm";

export const dynamic = "force-dynamic";
export default async function FunctionalProcessingPage() {
  const context = await getTenantContextForModule("RH");
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><h1 className="text-lg font-semibold">Processamentos e direitos funcionais</h1><nav className="flex flex-wrap gap-3 text-sm"><Link href="/rh/registros-funcionais">Regras e vigências</Link><Link href="/rh/operacoes?tab=direitos">Saldos e reservas</Link><Link href="/rh/relatorios?report=129">Planejamento de férias e licença-prêmio</Link><Link href="/rh/relatorios">Relatórios integrais</Link></nav><RightsProcessingForm canApply={canPerformModuleOperation(context.user, "RH", "update")} /></div>;
}
