import { prisma } from "@/lib/prisma";
import { listPlanningPublications } from "@/lib/planejamento/publication";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const query = Object.fromEntries([...new URL(request.url).searchParams].filter(([, value]) => value !== "")); return Response.json(await listPlanningPublications(prisma, query), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Não foi possível consultar publicações de Planejamento." }, { status: 400 }); }
}
