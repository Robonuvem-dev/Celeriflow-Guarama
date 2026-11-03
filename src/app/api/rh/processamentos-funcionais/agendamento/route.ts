import { timingSafeEqual } from "node:crypto";
import { databaseConnection } from "@/db/client";
import { runAutomaticRightsSchedule } from "@/lib/rh/automatic-rights-scheduler";

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
    const result = await runAutomaticRightsSchedule(databaseConnection, process.env.RH_RIGHTS_ACTOR_USER_ID);
    const failed = result.results.some(row => !row.processed);
    return Response.json({ status: failed ? "ATTENTION" : "PROCESSED", ...result }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Verifique o ator, as permissões e as unidades do agendamento funcional." }, { status: 503 }); }
}
