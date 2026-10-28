import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import RedesimClient from "./RedesimClient";
import { db } from "@/db/client";
import { listPageIntegrationEvents } from "@/db/repositories/taxation-pages/integration-events";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { listFiscalRegistrations } from "@/db/repositories/taxation-pages/lookups";

export const dynamic = "force-dynamic";

export default async function RedesimPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [events, rows, registrations] = await Promise.all([
    listPageIntegrationEvents(database, ["REDESIM"], allowed, true),
    listPageTaxpayers(database, { companyOnly: true, order: "updated-desc" }),
    listFiscalRegistrations(database),
  ]);
  const taxpayers = rows.map(row => ({ ...row, economicRegistrations: registrations.filter(registration => registration.taxpayerId === row.id) }));
  return <RedesimClient events={events.map((event) => ({ id: event.id, eventType: event.eventType, status: event.status, evidenceLevel: event.evidenceLevel, protocol: event.protocol, externalReference: event.externalReference, taxpayerId: event.taxpayerId, economicRegistrationId: event.economicRegistrationId, receivedAt: event.receivedAt.toISOString(), result: event.result }))} taxpayers={taxpayers.map((taxpayer) => ({ id: taxpayer.id, name: taxpayer.company?.corporateName ?? "Pessoa jurídica", cnpj: taxpayer.company?.cnpj ?? "", municipalInsc: taxpayer.economicRegistrations[0]?.municipalInsc ?? "" }))} />;
}
