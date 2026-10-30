import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { searchCentralOrigins } from "@/lib/signatures/central-service";
import { serializeOrigin } from "@/app/app-domain/assinatura-digital/usuarios/cadastro-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
    const parameters = new URL(request.url).searchParams;
    const kind = parameters.get("kind");
    const query = (parameters.get("q") ?? "").trim();
    if (kind !== "SERVIDOR" && kind !== "CIDADAO") return Response.json({ error: "Selecione Servidor RH ou Cidadão." }, { status: 400, headers });
    if (query.length < 2) return Response.json({ error: "Digite pelo menos 2 caracteres." }, { status: 400, headers });
    if (query.length > 100) return Response.json({ error: "Use até 100 caracteres na busca." }, { status: 400, headers });
    const origins = await searchCentralOrigins(context, kind, query);
    return Response.json({ origins: origins.slice(0, 20).map(serializeOrigin) }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível consultar as origens." },
      { status: error instanceof AccessError ? error.status : 500, headers });
  }
}
