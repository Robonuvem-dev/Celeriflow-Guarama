import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { scopedPatient } from "./patient-registration-service";

export async function savePatientAddress(context: AppContext, patientId: string, raw: unknown) {
  const input = z.object({ addressType: z.enum(["Residencial", "Comercial"]), zipCode: z.string().trim().min(1).max(20), streetName: z.string().trim().min(1).max(200), streetType: z.string().trim().min(1).max(80), number: z.string().trim().min(1).max(30), complement: z.string().trim().max(200).optional(), neighborhoodName: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(200), state: z.string().trim().regex(/^[A-Z]{2}$/) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const patient = await scopedPatient(tx, context, patientId);
    const neighborhood = await tx.neighborhood.findFirst({ where: { name: { equals: input.neighborhoodName, mode: "insensitive" }, city: { equals: input.city, mode: "insensitive" }, state: input.state } }) || await tx.neighborhood.create({ data: { name: input.neighborhoodName, city: input.city, state: input.state, type: "Bairro" } });
    const street = await tx.street.findFirst({ where: { neighborhoodId: neighborhood.id, name: { equals: input.streetName, mode: "insensitive" }, type: input.streetType } }) || await tx.street.create({ data: { name: input.streetName, type: input.streetType, neighborhoodId: neighborhood.id, city: input.city, state: input.state } });
    const previous = patient.person.addresses.filter(address => address.addressType === input.addressType).sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())[0];
    const address = await tx.address.create({ data: { personId: patient.personId, addressType: input.addressType, zipCode: input.zipCode, streetName: input.streetName, streetId: street.id, neighborhoodId: neighborhood.id, number: input.number, complement: input.complement || null } });
    await tx.healthPatientRegistrationChange.create({ data: { patientId, actorUsuarioId: context.user.id, changes: JSON.parse(JSON.stringify({ field: `address.${input.addressType}`, before: previous || null, after: { ...input, addressId: address.id } })) } });
    return { addressId: address.id };
  });
}
