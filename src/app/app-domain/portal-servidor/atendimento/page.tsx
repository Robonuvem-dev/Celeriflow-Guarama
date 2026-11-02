import { db } from "@/db/client";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { ownPortalContents } from "@/lib/portal-servidor/content-catalog";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
export const dynamic = "force-dynamic";
export default async function EmployeeServiceLocations() {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p>Acesso funcional indisponível.</p>;
  const records = (await ownPortalContents(access.context.database ?? db, access.employee.id)).filter(row => row.data.kind === "LOCAL");
  return <PortalOperationalList id="locais-atendimento" label="Locais de atendimento ao público" columns={[portalColumn("name", "Local", 250, 100), portalColumn("address", "Endereço", 350, 130), portalColumn("hours", "Horário", 250, 110), portalColumn("contact", "Contato", 220, 100)]} rows={records.map(row => ({ id: row.id, label: row.data.title, values: { name: row.data.title, address: row.data.address, hours: row.data.hours, contact: row.data.contact } }))} />;
}
