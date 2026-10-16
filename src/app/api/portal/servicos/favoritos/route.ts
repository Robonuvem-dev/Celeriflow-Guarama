import { prisma } from "@/lib/prisma";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { z } from "zod";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const account = await getCitizenApiAccount();
    const input = z.object({ publicServiceId: z.string().min(1), favorite: z.boolean() }).strict().parse(await request.json());
    const common = await prisma.publicService.findFirst({ where: { id: input.publicServiceId, isActive: true, OR: [{ digitalConfiguration: { published: true } }, { functionalPortalConfiguration: { isNot: null } }] }, select: { id: true } });
    if (!common) throw new Error("Serviço indisponível.");
    if (input.favorite) await prisma.portalServiceFavorite.upsert({ where: { actorId_publicServiceId: { actorId: account.id, publicServiceId: common.id } }, create: { actorId: account.id, publicServiceId: common.id }, update: {} });
    else await prisma.portalServiceFavorite.deleteMany({ where: { actorId: account.id, publicServiceId: common.id } });
    return Response.json({ recorded: true });
  } catch (error) { return portalApiError(error); }
}
