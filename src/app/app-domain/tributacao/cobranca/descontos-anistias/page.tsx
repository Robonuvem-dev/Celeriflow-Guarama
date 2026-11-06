import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listDiscountAmnesties } from "./repository";
import DescontosAnistiasClient from "./DescontosAnistiasClient";

export const dynamic = "force-dynamic";

export default async function DescontosAnistiasPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;
  const amnesties = await listDiscountAmnesties(database);

  return (
    <DescontosAnistiasClient rules={amnesties} />
  );
}
