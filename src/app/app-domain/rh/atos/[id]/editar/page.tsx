import { AtoForm } from "../../AtoForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readPersonnelAct, readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function EditarAtoPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id } = await params;
  const act = await readPersonnelAct(database, id);

  if (!act) {
    notFound();
  }

  const employees = await readEmployeeOptions(database);

  return (
    <AtoForm data={act} employees={employees} />
  );
}
