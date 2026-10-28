import { FeriasForm } from "../../FeriasForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readVacation, readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function EditarFeriasPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id } = await params;
  const vacation = await readVacation(database, id);

  if (!vacation) {
    notFound();
  }

  const employees = await readEmployeeOptions(database);

  return (
    <FeriasForm data={vacation} employees={employees} />
  );
}
