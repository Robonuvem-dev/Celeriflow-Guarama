import { notFound } from "next/navigation";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readBenefitStatement } from "@/lib/sst/benefit-query";
import { BenefitStatement } from "@/app/app-domain/sst/planos/BenefitStatement";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";

export default async function PortalBenefitStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") notFound();
  const { id } = await params;
  const query = await searchParams;
  const competence = `01/${new Date().getUTCFullYear()}`;
  const data = await readBenefitStatement(access.context, id, { from: query.from ?? competence, to: query.to ?? `12/${new Date().getUTCFullYear()}`, page: query.page }, true);
  if (!data) notFound();
  await writeAuditEvent(access.context.database ?? db, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.pageView, targetType: "PORTAL_SST_BENEFIT_STATEMENT", targetId: id });
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Meu demonstrativo de plano de saúde</h1><BenefitStatement data={data} base={`/portal-servidor/sst/planos/${id}`}/></div>;
}
