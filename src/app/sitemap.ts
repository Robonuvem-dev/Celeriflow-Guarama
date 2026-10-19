import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getDiscoverySettings, publicPortalOrigin } from "@/lib/transparencia/discovery-settings";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicPortalOrigin(await getDiscoverySettings(prisma));
  return [
    ...(["celeriflow.com.br", "www.celeriflow.com.br"].includes(new URL(origin).hostname) ? [
      { url: origin, changeFrequency: "weekly" as const, priority: 1 },
      { url: `${origin}/privacidade`, changeFrequency: "monthly" as const, priority: 0.5 },
      { url: `${origin}/termos`, changeFrequency: "monthly" as const, priority: 0.5 },
    ] : []),
    ...["/portal", "/portal/portaldatransparencia", "/portal/portaldatransparencia/mapa", "/portal/portaldatransparencia/estatisticas", "/portal/planejamento", "/portal/acesso-informacao", "/portal/ouvidoria", "/portal/privacidade"].map(path => ({ url: `${origin}${path}`, changeFrequency: "weekly" as const, priority: path === "/portal/portaldatransparencia" ? 0.9 : 0.7 })),
  ];
}
