import { z } from "zod";

export const responsibilityInput = z.object({
  submissionKey: z.string().uuid(), budgetUnitId: z.string().min(1), personId: z.string().min(1),
  kind: z.enum(["ENVIRONMENTAL", "BIOLOGICAL"]), groupId: z.string().default(""),
  council: z.string().trim().min(3).max(100), sourceReference: z.string().trim().min(10).max(1000),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(),
}).refine((v) => v.endsAt > v.startsAt, "Vigência inválida.");

export const serviceOrderInput = z.object({
  submissionKey: z.string().uuid(), budgetUnitId: z.string().min(1), programGroupId: z.string().min(1),
  employeeId: z.string().default(""), functionalPeriodId: z.string().default(""), responsibilityId: z.string().min(1),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  prevention: z.string().trim().min(10).max(10000), standards: z.string().trim().min(5).max(10000),
  accidentConduct: z.string().trim().min(10).max(10000),
  trainingRequirements: z.array(z.string().trim().min(3).max(500)).max(100).default([]),
  // Material is the canonical inventory identity. No fabricated delivery/stock movement.
  equipmentRequirements: z.array(z.object({ materialId: z.string().min(1), quantity: z.coerce.number().int().positive().max(10000), requirement: z.string().trim().min(3).max(500) })).max(100).default([]),
}).refine((v) => v.endsAt > v.startsAt, "Vigência inválida.")
  .refine((v) => !!v.employeeId === !!v.functionalPeriodId, "Servidor individual exige período funcional explícito.")
  .refine((v) => new Set(v.equipmentRequirements.map((e) => e.materialId)).size === v.equipmentRequirements.length, "Material repetido.");
