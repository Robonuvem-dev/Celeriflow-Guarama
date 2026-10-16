import { z } from "zod";

export const patientRegistrationPolicySchema = z.object({
  cpfRequiredFromAge: z.number().int().min(0).max(120).default(0),
  preRegistrationDays: z.number().int().min(1).max(3650).nullable().default(null),
  registrationDays: z.number().int().min(1).max(3650).nullable().default(null),
  allowOutdatedForUrgency: z.boolean().default(false),
  cardTitle: z.string().trim().min(1).max(200).default("Cartão de Saúde"),
  cardFooter: z.string().trim().max(2000).default(""),
}).strict();
export type PatientRegistrationPolicy = z.infer<typeof patientRegistrationPolicySchema>;
export const patientRegistrationPolicyKey = (unitId: string) => `HEALTH_PATIENT_REGISTRATION:${unitId}`;

export function ageOn(birthDate: Date | null, date = new Date()) {
  if (!birthDate) return null;
  let age = date.getUTCFullYear() - birthDate.getUTCFullYear();
  if (date.getUTCMonth() < birthDate.getUTCMonth() || date.getUTCMonth() === birthDate.getUTCMonth() && date.getUTCDate() < birthDate.getUTCDate()) age--;
  if (age < 0) throw new Error("Nascimento não pode ser posterior à data do cadastro.");
  return age;
}

export function cpfRequired(policy: PatientRegistrationPolicy, stage: string, birthDate: Date | null, date = new Date()) {
  const age = ageOn(birthDate, date);
  if (stage === "PRE" && age === null) return false;
  return age === null || age >= policy.cpfRequiredFromAge;
}

export function registrationValidity(policy: PatientRegistrationPolicy, stage: string, reviewedAt: Date, date = new Date()) {
  const days = stage === "PRE" ? policy.preRegistrationDays : policy.registrationDays;
  if (days === null) return { expiresAt: null, expired: false };
  const expiresAt = new Date(reviewedAt); expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return { expiresAt, expired: date.valueOf() > expiresAt.valueOf() };
}
