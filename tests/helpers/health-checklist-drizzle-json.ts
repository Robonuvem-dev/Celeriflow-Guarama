import { z } from "zod";

// Runtime refinement of the same stored snapshots previously type-asserted by
// the test. No defaults/coercion: missing/wrong types fail instead of masking data.
export const narrativeSnapshot = z.object({ narrative: z.string() }).passthrough();
export const nullableNarrativeSnapshot = z.object({ narrative: z.string().optional() }).passthrough().nullable();
export const anamnesisSnapshot = z.object({ anamnesis: z.string().nullable() }).passthrough();
export const programSnapshot = z.object({ programEnrollment: z.object({ id: z.string() }).passthrough() }).passthrough();
export const vaccineSnapshot = z.object({ mappings: z.array(z.object({ system: z.string(), code: z.string() }).passthrough()) }).passthrough();
export const pricingSnapshot = z.object({ table: z.object({ id: z.string(), version: z.number() }).passthrough() }).passthrough();
export const providerSnapshot = z.object({ providerUnit: z.object({ id: z.string(), cnes: z.string() }).passthrough() }).passthrough();
export const chronicPayload = z.object({ data: z.object({ assessments: z.array(z.unknown()), conditions: z.array(z.object({ id: z.string(), medicalRecordId: z.string().nullable(), professionalId: z.string().nullable() }).passthrough()) }).passthrough() }).passthrough();
export const waitlistPayload = z.object({ data: z.object({ events: z.array(z.unknown()) }).passthrough() }).passthrough();
export const statusPayload = z.object({ data: z.object({ status: z.string() }).passthrough() }).passthrough();
