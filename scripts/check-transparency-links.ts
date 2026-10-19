import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const { getTransparencySettings } = await import("../src/lib/transparencia/presentation-settings");
    const { publishedTransparencyCatalog } = await import("../src/lib/transparencia/consultation-service");
    const { buildTransparencyDiscovery } = await import("../src/lib/transparencia/discovery");
    const { getDiscoverySettings, applyDiscoverySettings, publicPortalOrigin } = await import("../src/lib/transparencia/discovery-settings");
    const [portal, presentation] = await Promise.all([getTransparencySettings(prisma), getDiscoverySettings(prisma)]);
    const origin = process.env.TRANSPARENCY_CHECK_ORIGIN || publicPortalOrigin(presentation);
    const sections = applyDiscoverySettings(buildTransparencyDiscovery(publishedTransparencyCatalog(portal), portal), presentation);
    let failed = 0;
    for (const item of sections.flatMap(section => section.items)) {
      const url = new URL(item.href, origin);
      try {
        let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000) });
        if (response.status === 405) response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
        if (!response.ok) failed++;
        console.log(JSON.stringify({ item: item.id, url: url.href, status: response.status, ok: response.ok }));
        await response.body?.cancel();
      } catch { failed++; console.log(JSON.stringify({ item: item.id, url: url.href, ok: false, error: "Destino indisponível ou tempo de resposta excedido." })); }
    }
    console.log(JSON.stringify({ failed, checkedAt: new Date().toISOString() }));
    if (failed) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha ao verificar destinos."); process.exitCode = 1; });
