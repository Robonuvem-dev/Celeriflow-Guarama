import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import VereadoresClient from "./VereadoresClient";
import { db } from "@/db/client";
import { listCouncilors } from "@/db/repositories/chamber/queries";

export default async function VereadoresPage() {
  await getTenantContextForModule("CAMARA");
  const vereadores = await listCouncilors(db);

  return <VereadoresClient vereadores={vereadores} />;
}
