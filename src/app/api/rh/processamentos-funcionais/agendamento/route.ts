import { timingSafeEqual } from "node:crypto";
import { databaseConnection } from "@/db/client";
import { runAutomaticRightsSchedule } from "@/lib/rh/automatic-rights-scheduler";
import { drainAutomaticRightsBatches } from "@/lib/rh/automatic-rights-daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.RH_RIGHTS_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Chave do agendamento funcional não configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (!process.env.RH_RIGHTS_ACTOR_USER_ID) return Response.json({ status: "NOT_CONFIGURED" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const actorId = process.env.RH_RIGHTS_ACTOR_USER_ID;
    const now = new Date();
    // Stop starting contracts at 150s, leaving 120s for the last transaction and
    // 30s for queries/audit/response inside the function's 300s duration.
    const deadline = Date.now() + 150_000;
    const result = await drainAutomaticRightsBatches((excluded, through) => runAutomaticRightsSchedule(databaseConnection, actorId, now, { deadline: through, excludeContractIds: excluded }), deadline);
    const failed = result.results.some(row => !row.processed);
    const status = failed ? "ATTENTION" : result.completed ? "PROCESSED" : "PARTIAL";
    return Response.json({ status, actorId, referenceDate: now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }), ...result }, { status: failed || !result.completed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Verifique o ator, as permissões e as unidades do agendamento funcional." }, { status: 503 }); }
}
