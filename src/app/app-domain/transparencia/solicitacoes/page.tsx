import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { asc, desc, inArray } from "drizzle-orm";
import { transparencyCitizenRequests, transparencyCitizenAppeals } from "@/db/schema/citizen-channels";
import { SolicitacoesClient, type CitizenRequestItem } from "./SolicitacoesClient";

export const dynamic = "force-dynamic";

export default async function CitizenManagementPage() {
  const context = await getTenantContextForModule("TRANSPARENCIA");
  const canUpdate = canPerformModuleOperation(context.user, "TRANSPARENCIA", "update");

  const [rawRequests, rawAppeals] = await Promise.all([
    db
      .select()
      .from(transparencyCitizenRequests)
      .orderBy(desc(transparencyCitizenRequests.createdAt), asc(transparencyCitizenRequests.id))
      .limit(1000),
    db
      .select()
      .from(transparencyCitizenAppeals)
      .orderBy(asc(transparencyCitizenAppeals.level)),
  ]);

  const now = Date.now();

  const requests: CitizenRequestItem[] = rawRequests.map((row) => {
    const appeals = rawAppeals.filter((appeal) => appeal.requestId === row.id);
    const createdTime = new Date(row.createdAt).getTime();
    const ageDays = Math.max(0, Math.floor((now - createdTime) / (1000 * 60 * 60 * 24)));

    // Status baseado no tempo em dias da criação (CF17 — 17.19)
    let timeStatus: CitizenRequestItem["timeStatus"];
    if (row.status === "RESPONDIDO") {
      timeStatus = {
        label: "Respondido",
        variant: "success",
        urgency: "concluida",
      };
    } else if (ageDays <= 5) {
      timeStatus = {
        label: `No Prazo (${ageDays}d)`,
        variant: "secondary",
        urgency: "baixa",
      };
    } else if (ageDays <= 15) {
      timeStatus = {
        label: `Em Andamento (${ageDays}d)`,
        variant: "default",
        urgency: "media",
      };
    } else if (ageDays <= 20) {
      timeStatus = {
        label: `Alerta Prazo (${ageDays}d)`,
        variant: "warning",
        urgency: "alta",
      };
    } else {
      timeStatus = {
        label: `Crítico / Vencido (${ageDays}d)`,
        variant: "destructive",
        urgency: "critica",
      };
    }

    return {
      id: row.id,
      protocol: row.protocol,
      type: row.type,
      entity: row.entity,
      name: row.name,
      email: row.email,
      subject: row.subject,
      message: row.message,
      status: row.status,
      response: row.response,
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      dueAt: row.dueAt.toISOString(),
      outcome: row.outcome,
      extendedAt: row.extendedAt ? row.extendedAt.toISOString() : null,
      extensionReason: row.extensionReason,
      nativeTicketId: row.nativeTicketId,
      nativeOmbudsmanId: row.nativeOmbudsmanId,
      createdAt: row.createdAt.toISOString(),
      ageDays,
      timeStatus,
      appeals: appeals.map((a) => ({
        id: a.id,
        level: a.level,
        message: a.message,
        status: a.status,
        response: a.response,
        dueAt: a.dueAt.toISOString(),
        respondedAt: a.respondedAt ? a.respondedAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });

  return <SolicitacoesClient requests={requests} canUpdate={canUpdate} />;
}
