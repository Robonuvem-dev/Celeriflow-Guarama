import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { patients, healthPatientRegistrations } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { addresses } from "@/db/schema/registry";
import { neighborhoods, streets } from "@/db/schema/localities";

export async function findHealthPatientRegistration(database: DatabaseExecutor, patientId: string) {
  const [row] = await database.select({ patient: patients, person: people, registrationProfile: healthPatientRegistrations }).from(patients).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthPatientRegistrations, eq(healthPatientRegistrations.patientId, patients.id)).where(eq(patients.id, patientId)).limit(1);
  if (!row) throw new Error("Paciente não encontrado.");
  return { ...row.patient, person: row.person, registrationProfile: row.registrationProfile };
}

export async function findHealthPatientWithAddresses(database: DatabaseExecutor, patientId: string) {
  const patient = await findHealthPatientRegistration(database, patientId);
  const rows = await database.select({ address: addresses, neighborhood: neighborhoods, street: streets }).from(addresses).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).leftJoin(streets, eq(streets.id, addresses.streetId)).where(eq(addresses.personId, patient.personId));
  return { ...patient, person: { ...patient.person, addresses: rows.map(row => ({ ...row.address, neighborhood: row.neighborhood, street: row.street })) } };
}
