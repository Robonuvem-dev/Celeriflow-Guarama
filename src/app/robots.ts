import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getDiscoverySettings, publicPortalOrigin } from "@/lib/transparencia/discovery-settings";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = publicPortalOrigin(await getDiscoverySettings(prisma));
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/app-domain/"] }, sitemap: `${origin}/sitemap.xml` };
}
