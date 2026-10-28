import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import FamiliasClient from "./FamiliasClient";
import { db } from "@/db/client";
import { listSocialFamilies, listSocialPeople } from "@/db/repositories/social/queries";

export default async function FamiliasSociaisPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const database = context.database ?? db;
  const familias = await listSocialFamilies(database);
  const persons = await listSocialPeople(database);

  return <FamiliasClient familiasInicial={familias} persons={persons} />;
}
