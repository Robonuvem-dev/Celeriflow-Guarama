import { db } from "@/db/client";
import { and, eq, sql } from "drizzle-orm";
import { publicServices, portalServiceFavorites } from "@/db/schema/portal-services";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { z } from "zod";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const account = await getCitizenApiAccount();
    const input = z.object({ publicServiceId: z.string().min(1), favorite: z.boolean() }).strict().parse(await request.json());
    const [common] = await db.select({ id: publicServices.id }).from(publicServices).where(and(eq(publicServices.id, input.publicServiceId), eq(publicServices.isActive, true), sql`(EXISTS(SELECT 1 FROM "PortalServiceConfiguration" digital WHERE digital."publicServiceId"=${publicServices.id} AND digital.published=TRUE) OR EXISTS(SELECT 1 FROM "HrPortalServiceConfiguration" functional WHERE functional."publicServiceId"=${publicServices.id}))`)).limit(1);
    if (!common) throw new Error("Serviço indisponível.");
    if (input.favorite) await db.insert(portalServiceFavorites).values({ actorId: account.id, publicServiceId: common.id }).onConflictDoNothing({ target: [portalServiceFavorites.actorId, portalServiceFavorites.publicServiceId] });
    else await db.delete(portalServiceFavorites).where(and(eq(portalServiceFavorites.actorId, account.id), eq(portalServiceFavorites.publicServiceId, common.id)));
    return Response.json({ recorded: true });
  } catch (error) { return portalApiError(error); }
}
