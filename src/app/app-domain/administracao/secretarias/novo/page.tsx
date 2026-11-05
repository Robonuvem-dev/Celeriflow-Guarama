import { asc, eq } from "drizzle-orm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import NovaSecretariaForm from "./NovaSecretariaForm";
import { db } from "@/db/client";
import { listUnassignedManagerOptions } from "@/db/repositories/administration/queries";
import { secretariats } from "@/db/schema/administration";

export default async function NovaSecretariaPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const database = context.database ?? db;
  const [employees, existingSecretariats] = await Promise.all([
    listUnassignedManagerOptions(database),
    database
      .select({ id: secretariats.id, name: secretariats.name, acronym: secretariats.acronym })
      .from(secretariats)
      .where(eq(secretariats.isActive, true))
      .orderBy(asc(secretariats.name)),
  ]);
  return <NovaSecretariaForm employees={employees} secretariats={existingSecretariats} />;
}
