import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const exposureGroupInput = z.object({
  budgetUnitId: z.string().min(1), code: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_.-]+$/),
  name: z.string().trim().min(2).max(160), departmentIds: z.array(z.string().min(1)).max(200).default([]),
  roleIds: z.array(z.string().min(1)).max(200).default([]), startsAt: z.coerce.date(),
  endsAt: z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.date().nullable()),
}).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, "Vigência inválida.");

export function exposureMemberWhere(group: { departmentIds: string[]; roleIds: string[] }, secretariatId: string): Prisma.EmployeeWhereInput {
  return { secretariatId, isActive: true, ...(group.departmentIds.length ? { departmentId: { in: group.departmentIds } } : {}), ...(group.roleIds.length ? { roleId: { in: group.roleIds } } : {}) };
}
