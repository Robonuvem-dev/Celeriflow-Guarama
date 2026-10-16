import { prisma } from "@/lib/prisma";
import { getIdTokenPrincipal } from "@/lib/platform/session";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { requestCitizenAccess } from "@/lib/portal-cidadao/registration";
import { portalApiError } from "@/lib/portal-cidadao/api-access";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  if (!checkRateLimit(`citizen-access:${request.headers.get("x-forwarded-for") || "local"}`).allowed) return Response.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  try {
    const body = await request.json();
    const principal = typeof body.idToken === "string" ? await getIdTokenPrincipal(body.idToken) : null;
    if (!principal) return Response.json({ error: "Entre com uma conta de e-mail verificado para solicitar acesso." }, { status: 401 });
    if (body.operation === "consultar") {
      const application = await prisma.citizenAccessApplication.findUnique({ where: { firebaseUid: principal.firebaseUid }, select: { status: true, reason: true, process: { select: { protocolNumber: true } } } });
      return application ? Response.json({ status: application.status, reason: application.reason, protocolNumber: application.process.protocolNumber }) : Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
    }
    return Response.json(await requestCitizenAccess(prisma, principal, body.document), { status: 201 });
  } catch (error) { return portalApiError(error); }
}
