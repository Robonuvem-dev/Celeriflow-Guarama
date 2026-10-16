import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { EMPLOYEE_PORTAL_PATH_HEADER, isEmployeePublicRoute } from "@/lib/portal-servidor/routes";

// O Proxy separa as rotas públicas das rotas internas do sistema.
const SESSION_COOKIE_NAME = "celeriflow_session";

function configuredSystemHostname() {
  const configuredUrl = process.env.CELERIFLOW_PUBLIC_BASE_URL;
  if (!configuredUrl) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp)).*)",
  ],
};

export default function proxy(req: NextRequest) {
  const url = req.nextUrl;
  // Entradas institucionais reutilizam os portais existentes e seus filtros.
   if (url.pathname === "/portal/portaldoservidor") {
    const destination = url.clone();
     destination.pathname = "/portal-servidor";
     return NextResponse.redirect(destination);
   }
   if (url.pathname === "/portal-transparencia") {
     const destination = url.clone();
     destination.pathname = "/portal/portaldatransparencia";
     return NextResponse.redirect(destination);
   }

  // O autosserviço funcional também funciona no domínio institucional.
  // A página e as actions verificam a sessão e o vínculo funcional no servidor.
  if (url.pathname === "/portal-servidor" || url.pathname.startsWith("/portal-servidor/")) {
    if (!req.cookies.has(SESSION_COOKIE_NAME) && !isEmployeePublicRoute(url.pathname)) {
      const loginUrl = new URL("/portal-servidor/entrar", req.url);
      loginUrl.searchParams.set("returnTo", url.pathname + url.search);
      return NextResponse.redirect(loginUrl);
    }
    const destination = url.clone();
    destination.pathname = `/app-domain${url.pathname}`;
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(EMPLOYEE_PORTAL_PATH_HEADER, url.pathname + url.search);
    return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  }

  const isPublicValidation = /^\/validar-(?:documento|aviso|recibo|emissao|alvara)\/[^/]+$/.test(url.pathname);
  const isPublicProtocolPortal = url.pathname === "/portal-protocolos";
  const isPublicInstitutionalPortal = url.pathname === "/portal" || url.pathname.startsWith("/portal/");
  const isPublicTransparencyPortal = url.pathname === "/portal-transparencia";
  if (isPublicValidation) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
    const rateLimit = checkRateLimit(`public-read:${ip}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente novamente mais tarde." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
    return NextResponse.next();
  }
  // Navegação e prefetch não são tentativas de autenticação. O limite de
  // consultas de validação não deve bloquear páginas públicas do cidadão.
  if (isPublicProtocolPortal || isPublicInstitutionalPortal || isPublicTransparencyPortal) {
    return NextResponse.next();
  }
  const hostname = (req.headers.get("host") || "").toLowerCase().split(":")[0];

  const systemDomain = configuredSystemHostname();
  const isSystemDomain = hostname === systemDomain || hostname === "app.localhost" || hostname.endsWith(".vercel.app");

  // Se o usuário tentar acessar a pasta interna via URL, reescreve ou redireciona
  if (url.pathname.startsWith("/app-domain")) {
    const destination = url.clone();
    destination.pathname = url.pathname.replace("/app-domain", "") || "/";
    return NextResponse.redirect(destination);
  }

  // Se for o domínio do sistema ou Vercel app, faz o rewrite (redirecionamento invisível) para /app-domain
  if (isSystemDomain) {
    const internalPath = url.pathname === "/" ? "/login" : url.pathname;
    const newPath = `/app-domain${internalPath}`;

    // Public sign-in routes only perform the Firebase-to-local-session exchange.
    const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
    const isAdministrativeLogin = internalPath === "/login" || internalPath.startsWith("/login/");
    const isEmployeeLogin = internalPath === "/portal-servidor/entrar";
    if (!hasSession && !isAdministrativeLogin && !isEmployeeLogin) {
      const loginPath = internalPath === "/portal-servidor" || internalPath.startsWith("/portal-servidor/")
        ? "/portal-servidor/entrar"
        : "/login";
      const loginUrl = new URL(loginPath, req.url);
      // The destination is always built from the original internal path, never
      // accepted as an absolute URL, so the login flow cannot become an open redirect.
      loginUrl.searchParams.set("returnTo", internalPath + url.search);
      return NextResponse.redirect(loginUrl);
    }

    // Reescrita invisível: domínio -> /app-domain/...
    const destination = url.clone();
    destination.pathname = newPath;
    return NextResponse.rewrite(destination);
  }

  return NextResponse.next();
}
