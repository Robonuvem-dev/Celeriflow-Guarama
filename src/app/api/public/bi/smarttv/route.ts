import { getPublicDisplay } from "@/lib/bi/display-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getPublicDisplay(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[bi-smarttv] Falha ao carregar programação pública.");
    return Response.json({ error: "Programação temporariamente indisponível." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
