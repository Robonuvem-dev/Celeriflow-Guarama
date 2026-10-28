import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import LegislaturasClient from "./LegislaturasClient";
import { db } from "@/db/client";
import { listLegislatures } from "@/db/repositories/chamber/queries";

export default async function LegislaturasPage() {
  await getTenantContextForModule("CAMARA");
  const legislaturas = await listLegislatures(db);

  return <LegislaturasClient legislaturas={legislaturas} />;
}
