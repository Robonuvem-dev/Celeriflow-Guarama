import { DependenteForm } from "../../DependenteForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readDependent, readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function EditarDependentePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id } = await params;
  const dependent = await readDependent(database, id, context.user);

  if (!dependent) {
    notFound();
  }

  const employees = await readEmployeeOptions(database, context.user);

  return (
    <DependenteForm data={dependent} employees={employees} />
  );
}
