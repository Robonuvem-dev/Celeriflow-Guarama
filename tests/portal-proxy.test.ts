import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import proxy from "../src/proxy";

test("domínio de Guarama abre o login do sistema e mantém o portal público acessível", () => {
  const hostname = "guarama.celeriflow.com.br";
  const request = (path: string) => new NextRequest(`https://${hostname}${path}`, {
    headers: { host: hostname },
  });

  const home = proxy(request("/"));
  assert.equal(new URL(home.headers.get("x-middleware-rewrite")!).pathname, "/app-domain/login");

  const privatePage = proxy(request("/dashboard"));
  assert.equal(privatePage.status, 307);
  const login = new URL(privatePage.headers.get("location")!);
  assert.equal(login.hostname, hostname);
  assert.equal(login.pathname, "/login");
  assert.equal(login.searchParams.get("returnTo"), "/dashboard");

  const portal = proxy(request("/portal"));
  assert.equal(portal.headers.get("x-middleware-next"), "1");
  assert.equal(portal.headers.get("x-middleware-rewrite"), null);
});

test("navegação, prefetch e ações do portal não consomem o limite de validação pública", () => {
  const ip = "192.0.2.180";
   const routes = ["/portal", "/portal/historia", "/portal/contato", "/portal/minha-area", "/portal-protocolos", "/portal/portaldatransparencia"];
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const route of routes) {
      const response = proxy(new NextRequest(`https://app.localhost${route}`, {
        headers: attempt % 2 === 0
          ? { "x-forwarded-for": ip }
          : { "x-forwarded-for": ip, "next-router-prefetch": "1" },
      }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("x-middleware-rewrite"), null);
    }
  }
  const action = proxy(new NextRequest("https://app.localhost/portal/construcao-civil", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  }));
  assert.equal(action.status, 200);

  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal(proxy(new NextRequest("https://app.localhost/validar-documento/documento", {
      headers: { "x-forwarded-for": ip },
    })).status, 200);
  }
  const blocked = proxy(new NextRequest("https://app.localhost/validar-documento/documento", {
    headers: { "x-forwarded-for": ip },
  }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) > 0);
  assert.equal(proxy(new NextRequest("https://app.localhost/portal", {
    headers: { "x-forwarded-for": ip },
  })).status, 200);
});

test("rotas internas continuam exigindo sessão e preservando o destino", () => {
  const response = proxy(new NextRequest("https://app.localhost/compras?pagina=2", {
    headers: { host: "app.localhost" },
  }));
  assert.equal(response.status, 307);
  const destination = new URL(response.headers.get("location")!);
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("returnTo"), "/compras?pagina=2");
});

test("validação da Central é pública em todos os hosts, sem liberar a área administrativa", () => {
  for (const [index, hostname] of ["app.localhost", "guarama.celeriflow.com.br", "celeriflow.vercel.app", "www.ibema.celeriflow.com.br"].entries()) {
    for (const path of ["/validar-assinatura", "/validar-assinatura/12345678-1234-4123-8123-123456789abc"]) {
      const response = proxy(new NextRequest(`https://${hostname}${path}`, { headers: { host: hostname, "x-forwarded-for": `192.0.2.${200 + index}` } }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("x-middleware-rewrite"), null);
      assert.equal(response.headers.get("location"), null);
    }
  }
  const privatePage = proxy(new NextRequest("https://app.localhost/assinatura-digital/validacao", { headers: { host: "app.localhost" } }));
  assert.equal(privatePage.status, 307);
  assert.equal(new URL(privatePage.headers.get("location")!).searchParams.get("returnTo"), "/assinatura-digital/validacao");
  const nested = proxy(new NextRequest("https://app.localhost/validar-assinatura/codigo/administracao", { headers: { host: "app.localhost" } }));
  assert.equal(nested.status, 307);
});

test("autenticidade de alvará permanece pública nos hosts internos sem contornar rotas administrativas",()=>{
  for(const hostname of ["app.localhost","celeriflow.vercel.app"]) {
    const response=proxy(new NextRequest(`https://${hostname}/validar-alvara/12345678-1234-4123-8123-123456789abc`,{headers:{host:hostname,"x-forwarded-for":"192.0.2.181"}}));
    assert.equal(response.status,200);assert.equal(response.headers.get("x-middleware-next"),"1");
    const internal=proxy(new NextRequest(`https://${hostname}/tributacao/alvaras/configurados`,{headers:{host:hostname}}));
    assert.equal(internal.status,307);assert.equal(new URL(internal.headers.get("location")!).pathname,"/login");
  }
});

test("navegação autenticada preserva paginação, filtros e identificação do bem", () => {
  for (const hostname of ["app.localhost", "celeriflow.vercel.app"]) {
    for (const path of [
      "/patrimonio/materiais?page=4&q=Envelope%20pardo&warehouse=central",
      "/patrimonio/bens/editar?id=review%3Abem%3A01",
    ]) {
      const source = new URL(`https://${hostname}${path}`);
      const response = proxy(new NextRequest(source, {
        headers: { host: hostname, cookie: "celeriflow_session=session" },
      }));
      assert.equal(response.status, 200);
      const destination = new URL(response.headers.get("x-middleware-rewrite")!);
      assert.equal(destination.hostname, hostname);
      assert.equal(destination.pathname, `/app-domain${source.pathname}`);
      assert.equal(destination.search, source.search);
    }
  }
});

test("URL interna de edição redireciona para a URL pública sem perder o ID", () => {
  const response = proxy(new NextRequest("https://app.localhost/app-domain/patrimonio/bens/editar?id=review%3Abem%3A01", {
    headers: { host: "app.localhost", cookie: "celeriflow_session=session" },
  }));
  assert.equal(response.status, 307);
  const destination = new URL(response.headers.get("location")!);
  assert.equal(destination.pathname, "/patrimonio/bens/editar");
  assert.equal(destination.searchParams.get("id"), "review:bem:01");
  const publicResponse = proxy(new NextRequest(destination, {
    headers: { host: "app.localhost", cookie: "celeriflow_session=session" },
  }));
  assert.equal(publicResponse.status, 200);
  assert.equal(new URL(publicResponse.headers.get("x-middleware-rewrite")!).searchParams.get("id"), "review:bem:01");
});

test("entradas institucionais encaminham aos portais existentes e preservam filtros", () => {
  for (const hostname of ["www.ibema.celeriflow.com.br", "app.localhost", "celeriflow.vercel.app"]) {
    for (const [entry, target] of [
      ["/portal/portaldoservidor", "/portal-servidor"],
       ["/portal-transparencia", "/portal/portaldatransparencia"],
    ]) {
      const response = proxy(new NextRequest(`https://${hostname}${entry}?view=receitas&year=2026`, {
        headers: { host: hostname },
      }));
      assert.equal(response.status, 307);
      const destination = new URL(response.headers.get("location")!);
      assert.equal(destination.hostname, hostname);
      assert.equal(destination.pathname, target);
      assert.equal(destination.search, "?view=receitas&year=2026");
       if (target === "/portal/portaldatransparencia") {
        const publicResponse = proxy(new NextRequest(destination, { headers: { host: hostname } }));
        assert.equal(publicResponse.headers.get("x-middleware-next"), "1");
      }
    }
  }
});

test("portal do servidor oferece login em todos os hosts, sem ciclo de redirecionamento", () => {
  for (const hostname of ["www.ibema.celeriflow.com.br", "app.localhost", "celeriflow.vercel.app"]) {
    const response = proxy(new NextRequest(`https://${hostname}/portal-servidor`, {
      headers: { host: hostname },
    }));
    assert.equal(response.status, 307);
    const login = new URL(response.headers.get("location")!);
    assert.equal(login.pathname, "/portal-servidor/entrar");
    assert.equal(login.searchParams.get("returnTo"), "/portal-servidor");
    const loginResponse = proxy(new NextRequest(login, { headers: { host: hostname } }));
    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.headers.get("location"), null);
    assert.equal(new URL(loginResponse.headers.get("x-middleware-rewrite")!).pathname, "/app-domain/portal-servidor/entrar");
  }
});

test("portal do servidor encaminha páginas e ações autenticadas e conserva parâmetros", () => {
  for (const method of ["GET", "POST"]) {
    const response = proxy(new NextRequest("https://www.ibema.celeriflow.com.br/portal-servidor/demonstrativos?year=2026", {
      method,
      headers: { host: "www.ibema.celeriflow.com.br", cookie: "celeriflow_session=session" },
    }));
    assert.equal(response.status, 200);
    const destination = new URL(response.headers.get("x-middleware-rewrite")!);
    assert.equal(destination.pathname, "/app-domain/portal-servidor/demonstrativos");
    assert.equal(destination.search, "?year=2026");
  }
});

test("recuperação funcional é pública e o contexto de rota do Proxy sobrescreve cabeçalhos externos", () => {
  const recovery = proxy(new NextRequest("https://www.ibema.celeriflow.com.br/portal-servidor/recuperar-senha", {
    headers: { host: "www.ibema.celeriflow.com.br", "x-celeriflow-employee-path": "/rh" },
  }));
  assert.equal(recovery.status, 200);
  assert.equal(new URL(recovery.headers.get("x-middleware-rewrite")!).pathname, "/app-domain/portal-servidor/recuperar-senha");
  assert.equal(recovery.headers.get("x-middleware-request-x-celeriflow-employee-path"), "/portal-servidor/recuperar-senha");
  const privatePage = proxy(new NextRequest("https://www.ibema.celeriflow.com.br/portal-servidor/seguranca", {
    headers: { host: "www.ibema.celeriflow.com.br", "x-celeriflow-employee-path": "/portal-servidor/entrar" },
  }));
  assert.equal(privatePage.status, 307);
  assert.equal(new URL(privatePage.headers.get("location")!).pathname, "/portal-servidor/entrar");
});
