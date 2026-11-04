import { z } from "zod";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { loginEmployeeCredentials, redeemEmployeeAccessLink, requestEmployeeAccessLink } from "@/lib/portal-servidor/credentials";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers });
  const trace = { ip: request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown", host: request.headers.get("host") || "unknown" };
  const limit = checkRateLimit(`employee-credentials:${trace.ip}`);
  if (!limit.allowed) return Response.json({ error: "Aguarde antes de tentar novamente." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const body = await request.json();
    const operation = z.enum(["login", "request", "redeem"]).parse(body.operation);
    if (operation === "login") {
      const result = await loginEmployeeCredentials(body, trace);
      return Response.json(result, { status: "error" in result ? 401 : 200, headers });
    }
    if (operation === "redeem") {
      await redeemEmployeeAccessLink(body, trace);
      return Response.json({ message: "Senha definida. Entre novamente com seu CPF e a nova senha." }, { headers });
    }
    await requestEmployeeAccessLink(body);
    return Response.json({ message: "Se os dados e o documento corresponderem ao cadastro funcional autorizado, enviaremos um link ao e-mail cadastrado, válido por 24 horas. Caso necessário, solicite ao RH a conferência do cadastro." }, { headers });
  } catch {
    return Response.json({ error: "Não foi possível concluir. Confira os dados, a validade do link ou procure o RH." }, { status: 400, headers });
  }
}
