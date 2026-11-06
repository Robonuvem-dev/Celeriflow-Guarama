import { asc, eq } from "drizzle-orm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import EditarSecretariaForm from "./EditarSecretariaForm";
import { db } from "@/db/client";
import { listManagerOptions } from "@/db/repositories/administration/queries";
import { secretariats, departments, administrativeUnits } from "@/db/schema/administration";

export const dynamic = "force-dynamic";

export default async function EditarSecretariaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const database = context.database ?? db;

  const [secRows, employees, depts, units] = await Promise.all([
    database.select().from(secretariats).where(eq(secretariats.id, id)).limit(1),
    listManagerOptions(database),
    database.select().from(departments).where(eq(departments.secretariatId, id)).orderBy(asc(departments.name)),
    database.select().from(administrativeUnits).where(eq(administrativeUnits.secretariatId, id)).orderBy(asc(administrativeUnits.name)),
  ]);

  const secretariat = secRows[0];
  if (!secretariat) {
    notFound();
  }

  return (
    <EditarSecretariaForm
      secretariat={secretariat}
      employees={employees}
      departments={depts}
      units={units}
    />
  );
}
