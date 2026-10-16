import { z } from "zod";

export type SocialUnitInput = {
  name: string; type: string; phone?: string; email?: string;
  addressId?: string; realEstateId?: string; managerId?: string;
  identificationCode?: string; implementationDate?: string;
  streetAddress?: string; municipality?: string; latitude?: string; longitude?: string;
  isConfidential?: boolean;
};

const optionalText = z.string().trim().max(250).optional();
const coordinate = (min: number, max: number) => z.string().optional().transform((value) => value?.trim() ? Number(value) : null)
  .refine((value) => value === null || (Number.isFinite(value) && value >= min && value <= max), "Coordenada inválida.");

export const socialUnitInputSchema = z.object({
  name: z.string().trim().min(2).max(160), type: z.string().trim().min(2).max(80),
  phone: optionalText, email: z.union([z.literal(""), z.email()]).optional(),
  addressId: optionalText, realEstateId: optionalText, managerId: optionalText,
  identificationCode: z.string().trim().max(80).optional(),
  implementationDate: z.string().optional().refine((value) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Data de implantação inválida."),
  streetAddress: optionalText, municipality: optionalText,
  latitude: coordinate(-90, 90), longitude: coordinate(-180, 180),
  isConfidential: z.boolean().optional(),
}).refine((value) => (value.latitude === null) === (value.longitude === null), "Informe latitude e longitude juntas.");

export function parseSocialUnitInput(input: SocialUnitInput) {
  const data = socialUnitInputSchema.parse(input);
  return {
    name: data.name, type: data.type, phone: data.phone, email: data.email,
    isConfidential: data.isConfidential,
    identificationCode: data.identificationCode === undefined ? undefined : data.identificationCode || null,
    implementationDate: data.implementationDate === undefined ? undefined : data.implementationDate ? new Date(`${data.implementationDate}T00:00:00Z`) : null,
    streetAddress: data.streetAddress === undefined ? undefined : data.streetAddress || null,
    municipality: data.municipality === undefined ? undefined : data.municipality || null,
    latitude: input.latitude === undefined ? undefined : data.latitude,
    longitude: input.longitude === undefined ? undefined : data.longitude,
  };
}
