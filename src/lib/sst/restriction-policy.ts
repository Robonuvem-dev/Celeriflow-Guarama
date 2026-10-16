import { z } from "zod";

export const restrictionInput = z.object({
  submissionKey: z.uuid(), budgetUnitId: z.string().min(1), employeeId: z.string().min(1), professionalRoleId: z.string().min(1),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(), type: z.string().trim().min(1).max(200), reason: z.string().trim().min(1).max(10000), degree: z.string().trim().min(1).max(200),
  cidCodes: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/)).min(1).max(30),
  attributes: z.array(z.object({ attributeId: z.string().min(1), allowed: z.boolean(), note: z.string().max(3000).default("") })).min(1).max(100),
  notificationEnabled: z.boolean().default(false), notifyDays: z.number().int().min(0).max(365).default(7), responsibleEmployeeId: z.string().default(""),
}).refine(i => i.endsAt >= i.startsAt, "Período inválido.").refine(i => new Set(i.attributes.map(a => a.attributeId)).size === i.attributes.length, "Atribuição repetida.");
export const followupInput = z.object({ restrictionId: z.string().min(1), submissionKey: z.uuid(), followedAt: z.coerce.date(), professionalRoleId: z.string().min(1), notes: z.string().trim().min(1).max(10000), outcome: z.enum(["MAINTAIN", "RELEASE", "REASSESS"]) });
