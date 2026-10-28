import { db, databaseConnection } from "@/db/client";
import { restrictionCronAuthorized, configuredRestrictionEmailSender, RestrictionEmailConfigurationError } from "@/lib/sst/restriction-email-provider";
import { restrictionCronScope, runRestrictionExpiryCron } from "@/lib/sst/restriction-cron-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.SST_RESTRICTION_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    console.error("SST_RESTRICTION_EMAIL_CONFIGURATION_BLOCKED", { reason:"CRON_SECRET_MISSING_OR_SHORT" });
    return Response.json({ status:"BLOCKED", error:"Chave segura do agendamento não configurada." }, { status:503 });
  }
  if (!restrictionCronAuthorized(request.headers.get("authorization"),secret)) return Response.json({ error:"Não autorizado." }, { status:401 });
  try {
    const send = configuredRestrictionEmailSender();
    const scope = await restrictionCronScope(db,process.env.SST_RESTRICTION_EMAIL_ACTOR_USER_ID);
    const result = await runRestrictionExpiryCron(databaseConnection,scope,send);
    if (result.failed || result.reconciliationRequired) console.error("SST_RESTRICTION_EMAIL_DELIVERY_BLOCKED", { failed:result.failed, reconciliationRequired:result.reconciliationRequired });
    return Response.json({ status:result.failed || result.reconciliationRequired ? "ATTENTION" : "PROCESSED", ...result }, { headers: { "Cache-Control":"no-store" } });
  } catch (error) {
    console.error("SST_RESTRICTION_EMAIL_CONFIGURATION_BLOCKED", { reason:error instanceof RestrictionEmailConfigurationError ? error.message : "SERVICE_UNAVAILABLE" });
    return Response.json({ status:"BLOCKED", error:"Verifique a configuração do provedor, ator autorizado e migração do serviço de e-mail." }, { status:503 });
  }
}
export async function POST(request: Request) { return GET(request); }
