import type { MetadataRoute } from "next";
import { db } from "@/db/client";
import { getDiscoverySettings, publicPortalOrigin } from "@/lib/transparencia/discovery-settings";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = publicPortalOrigin(await getDiscoverySettings(db));
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/app-domain/"] }, sitemap: `${origin}/sitemap.xml` };
}
