import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Stethoscope } from 'lucide-react';
import ProfissionaisClient from './ProfissionaisClient';
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { employees as employeeTable } from "@/db/schema/administration";

export default async function Page() {
  const context = await getTenantContextForModule("SAUDE"), database = context.database ?? db;
  const items = await database.select({ id: healthProfessionals.id, employeeId: healthProfessionals.employeeId, specialty: healthProfessionals.specialty, councilName: healthProfessionals.councilName, councilNumber: healthProfessionals.councilNumber, isActive: healthProfessionals.isActive, employee: { id: employeeTable.id, name: employeeTable.name, cpf: employeeTable.cpf, registration: employeeTable.registration } }).from(healthProfessionals).innerJoin(employeeTable, eq(employeeTable.id, healthProfessionals.employeeId)).orderBy(desc(healthProfessionals.createdAt));
  const employees = await database.select({ id: employeeTable.id, name: employeeTable.name, cpf: employeeTable.cpf, registration: employeeTable.registration }).from(employeeTable).where(eq(employeeTable.isActive, true)).orderBy(asc(employeeTable.name));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Profissionais de Saúde" icon={<Stethoscope className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <ProfissionaisClient professionals={items} employees={employees} />
    </PageFrame>
  );
}
