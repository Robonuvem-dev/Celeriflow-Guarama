import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { scopedPatient } from "./patient-registration-service";
import { and, eq, sql } from "drizzle-orm";
import { addresses } from "@/db/schema/registry";
import { neighborhoods, streets } from "@/db/schema/localities";
import { healthPatientRegistrationChanges } from "@/db/schema/health-registration";
import { runHealthTransaction } from "./health-transaction";

export async function savePatientAddress(context: AppContext, patientId: string, raw: unknown) {
  const input = z.object({ addressType: z.enum(["Residencial", "Comercial"]), zipCode: z.string().trim().min(1).max(20), streetName: z.string().trim().min(1).max(200), streetType: z.string().trim().min(1).max(80), number: z.string().trim().min(1).max(30), complement: z.string().trim().max(200).optional(), neighborhoodName: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(200), state: z.string().trim().regex(/^[A-Z]{2}$/) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const patient = await scopedPatient(tx, context, patientId);
    let [neighborhood] = await tx.select().from(neighborhoods).where(and(sql`lower(${neighborhoods.name}) = lower(${input.neighborhoodName})`, sql`lower(${neighborhoods.city}) = lower(${input.city})`, eq(neighborhoods.state, input.state))).limit(1);
    if (!neighborhood) [neighborhood] = await tx.insert(neighborhoods).values({ name: input.neighborhoodName, city: input.city, state: input.state, type: "Bairro" }).returning();
    let [street] = await tx.select().from(streets).where(and(eq(streets.neighborhoodId, neighborhood.id), sql`lower(${streets.name}) = lower(${input.streetName})`, eq(streets.type, input.streetType))).limit(1);
    if (!street) [street] = await tx.insert(streets).values({ name: input.streetName, type: input.streetType, neighborhoodId: neighborhood.id, city: input.city, state: input.state }).returning();
    const previous = patient.person.addresses.filter(address => address.addressType === input.addressType).sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())[0];
    const [address] = await tx.insert(addresses).values({ personId: patient.personId, addressType: input.addressType, zipCode: input.zipCode, streetName: input.streetName, streetId: street.id, neighborhoodId: neighborhood.id, number: input.number, complement: input.complement || null }).returning();
    await tx.insert(healthPatientRegistrationChanges).values({ patientId, actorUsuarioId: context.user.id, changes: JSON.parse(JSON.stringify({ field: `address.${input.addressType}`, before: previous || null, after: { ...input, addressId: address.id } })) });
    return { addressId: address.id };
  });
}
