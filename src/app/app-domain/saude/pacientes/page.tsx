import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Users } from 'lucide-react';
import PacientesClient from './PacientesClient';
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { patients } from "@/db/schema/health-registration";
import { people as personTable } from "@/db/schema/people";
import { healthUnits, healthTeams } from "@/db/schema/health-workforce";

export default async function Page() {
  const context = await getTenantContextForModule("SAUDE"), database = context.database ?? db;
  const personFields = { id: personTable.id, fullName: personTable.fullName, cpf: personTable.cpf, birthDate: personTable.birthDate, gender: personTable.gender, raceColor: personTable.raceColor, motherName: personTable.motherName, fatherName: personTable.fatherName, phonePrimary: personTable.phonePrimary, whatsapp: personTable.whatsapp, email: personTable.email, profession: personTable.profession };
  const [items, people, units, teams] = await Promise.all([
    database.select({ id: patients.id, personId: patients.personId, cns: patients.cns, bloodType: patients.bloodType, bloodDonor: patients.bloodDonor, referenceUnitId: patients.referenceUnitId, teamId: patients.teamId, status: patients.status, person: personFields }).from(patients).innerJoin(personTable, eq(personTable.id, patients.personId)).orderBy(desc(patients.createdAt)),
    database.select(personFields).from(personTable).orderBy(asc(personTable.fullName)),
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(eq(healthUnits.isActive, true)).orderBy(asc(healthUnits.name)),
    database.select({ id: healthTeams.id, name: healthTeams.name, unitId: healthTeams.unitId }).from(healthTeams).where(eq(healthTeams.isActive, true)).orderBy(asc(healthTeams.name)),
  ]);

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Pacientes" icon={<Users className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <PacientesClient patients={items} people={people} units={units} teams={teams} />
    </PageFrame>
  );
}
