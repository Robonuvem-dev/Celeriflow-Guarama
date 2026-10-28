import { LicencaForm } from "../../LicencaForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readLeave, readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function EditarLicencaPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id } = await params;
  const leave = await readLeave(database, id);

  if (!leave) {
    notFound();
  }

  const employees = await readEmployeeOptions(database);

  return (
    <LicencaForm data={leave} employees={employees} />
  );
}
