import { createHash } from "node:crypto";
import Link from "next/link";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { getDiscoverySettings } from "@/lib/transparencia/discovery-settings";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { publishedTransparencyCatalog } from "@/lib/transparencia/consultation-service";
import { buildTransparencyDiscovery } from "@/lib/transparencia/discovery";
import { DiscoveryPresentationEditor } from "@/components/transparencia/DiscoveryPresentationEditor";

export const dynamic = "force-dynamic";
export default async function DiscoveryPresentationPage() {
  const context = await getTenantContextForModule("TRANSPARENCIA");
  const [settings, portal] = await Promise.all([getDiscoverySettings(context.prisma), getTransparencySettings(context.prisma)]);
  return <main className="mx-auto max-w-6xl space-y-5 p-5"><Link href="/transparencia" className="underline">← Gestão da transparência</Link><header><h1 className="text-2xl font-bold">Apresentação e navegação pública</h1><p className="mt-2 text-sm text-slate-600">Organize as seções, atalhos, textos, sinônimos e destinos do portal. Alterações ficam registradas na auditoria.</p></header><nav className="flex flex-wrap gap-4 text-sm"><Link href="/portal/portaldatransparencia" className="underline">Visualizar portal</Link><Link href="/transparencia/publicacoes" className="underline">Configurações e documentos</Link><Link href="/transparencia/avaliacoes" className="underline">Avaliações das páginas</Link></nav><DiscoveryPresentationEditor settings={settings} sections={buildTransparencyDiscovery(publishedTransparencyCatalog(portal), portal)} version={createHash("sha256").update(JSON.stringify(settings)).digest("hex")} canUpdate={canPerformModuleOperation(context.user, "TRANSPARENCIA", "update")} /></main>;
}
