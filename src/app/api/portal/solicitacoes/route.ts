import { prisma } from "@/lib/prisma";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { submitPortalService, operatePortalRequest, ratePortalRequest } from "@/lib/portal-cidadao/requests";
import { getProtocolContextForOperation } from "@/lib/protocols/access";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const account = await getCitizenApiAccount();
    const rate = checkRateLimit(`portal-request:${account.id}`);
    if (!rate.allowed) return Response.json({ error: "Aguarde antes de enviar novamente." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body = await request.json();
    if (body.action === "operar") {
      const operation = body.input?.operation;
      const context = ["COMPLEMENTAR", "CANCELAR"].includes(operation) ? undefined : await getProtocolContextForOperation("update");
      const result = await operatePortalRequest(prisma, account.id, body.input, context);
      return Response.json({ id: result.id }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action === "avaliar") {
      await ratePortalRequest(prisma, account.id, String(body.requestId || ""), body.input);
      return Response.json({ recorded: true });
    }
    const result = await submitPortalService(prisma, account.id, body);
    return Response.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
