import Link from "next/link";
import { db } from "@/db/client";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { ownPortalContents } from "@/lib/portal-servidor/content-catalog";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
export const dynamic = "force-dynamic";
export default async function EmployeeLibrary() {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p>Acesso funcional indisponível.</p>;
  const records = (await ownPortalContents(access.context.database ?? db, access.employee.id)).filter(row => row.data.kind !== "LOCAL");
  return <PortalOperationalList id="biblioteca" label="Documentos, normas e manuais" columns={[portalColumn("name", "Descrição", 320, 140), portalColumn("kind", "Tipo", 150, 100), portalColumn("file", "Arquivo", 300, 120), portalColumn("download", "Download", 120, 90, "actions")]} rows={records.map(row => ({ id: row.id, label: row.data.title, values: { name: row.data.title, kind: row.data.kind, file: row.data.fileName || "", download: "" }, cells: { download: <Link href={`/api/portal-servidor/biblioteca/${row.id}`} className="underline">Baixar</Link> } }))} />;
}
