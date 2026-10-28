import { PontoForm } from "../../PontoForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readAttendance, readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function EditarPontoPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id } = await params;
  const record = await readAttendance(database, id);

  if (!record) {
    notFound();
  }

  const employees = await readEmployeeOptions(database);

  return (
    <PontoForm data={record} employees={employees} />
  );
}
