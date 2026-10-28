import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { employees } from "@/db/schema/administration";

export const exposureGroupInput = z.object({
  budgetUnitId: z.string().min(1), code: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_.-]+$/),
  name: z.string().trim().min(2).max(160), departmentIds: z.array(z.string().min(1)).max(200).default([]),
  roleIds: z.array(z.string().min(1)).max(200).default([]), startsAt: z.coerce.date(),
  endsAt: z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.date().nullable()),
}).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, "Vigência inválida.");

export function exposureMemberWhere(group: { departmentIds: string[] | null; roleIds: string[] | null }, secretariatId: string) {
  return and(eq(employees.secretariatId, secretariatId), eq(employees.isActive, true), group.departmentIds?.length ? inArray(employees.departmentId, group.departmentIds) : undefined, group.roleIds?.length ? inArray(employees.roleId, group.roleIds) : undefined)!;
}
