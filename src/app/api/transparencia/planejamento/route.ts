import { db } from "@/db/client";
import { listPlanningPublications } from "@/lib/transparencia/planning-publications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const query = Object.fromEntries([...new URL(request.url).searchParams].filter(([, value]) => value !== "")); return Response.json(await listPlanningPublications(db, query), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Não foi possível consultar publicações de Planejamento." }, { status: 400 }); }
}
