import { authorizeCentralCron } from "@/lib/signatures/central-retention";
import { dispatchGedVercelWorker } from "@/lib/documents/ged-vercel-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!authorizeCentralCron(request.headers.get("authorization"))) return Response.json({ error: "Não autorizado." }, { status: 401, headers });
  try { return Response.json(await dispatchGedVercelWorker(), { status: 202, headers }); }
  catch { return Response.json({ error: "Não foi possível iniciar o processamento GED; confira a configuração do Sandbox." }, { status: 503, headers }); }
}
