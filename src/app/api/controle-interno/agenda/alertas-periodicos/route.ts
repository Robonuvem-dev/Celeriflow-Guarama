import { timingSafeEqual } from "node:crypto";
import { databaseConnection } from "@/db/client";
import { processControlAgendaCron } from "@/lib/c7/control-agenda-cron";
import { C7OperationError } from "@/lib/c7/operations-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CONTROL_AGENDA_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Chave segura do agendamento não configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const result = await processControlAgendaCron(databaseConnection, process.env.CONTROL_AGENDA_ACTOR_USER_ID);
    if (result.failedPlanIds.length) console.error("CONTROL_AGENDA_PROCESSING_FAILED", { planIds: result.failedPlanIds });
    return Response.json({ status: result.failedPlanIds.length ? "ATTENTION" : "PROCESSED", ...result }, { status: result.failedPlanIds.length ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("CONTROL_AGENDA_CONFIGURATION_BLOCKED", { reason: error instanceof C7OperationError ? error.message : "SERVICE_UNAVAILABLE" });
    return Response.json({ error: "Verifique o ator controlador, suas UGs e a ativação do módulo para o agendamento." }, { status: 503 });
  }
}
