import { and, eq, or, sql } from "drizzle-orm";
import type { AttendanceContext } from "@/lib/attendance/access";
import { ombudsmans, tickets } from "../../schema/attendance-portals";

export type AttendanceScopeContext = {
  user: Pick<AttendanceContext["user"], "id" | "departmentId">;
  attendanceAccess: Pick<AttendanceContext["attendanceAccess"], "isAdmin" | "isManager" | "isOmbudsman">;
};

export function ticketScopeCondition(context: AttendanceScopeContext) {
  if (context.attendanceAccess.isAdmin || context.attendanceAccess.isManager) return sql`TRUE`;
  return context.user.departmentId ? eq(tickets.departmentId, context.user.departmentId) : eq(tickets.id, "__sem-departamento__");
}
export function ombudsmanScopeCondition(context: AttendanceScopeContext) {
  if (context.attendanceAccess.isAdmin || context.attendanceAccess.isOmbudsman) return sql`TRUE`;
  const departmentScope = context.user.departmentId ? eq(ombudsmans.departmentId, context.user.departmentId) : eq(ombudsmans.id, "__sem-departamento__");
  return or(and(eq(ombudsmans.isConfidential, false), departmentScope), and(eq(ombudsmans.isConfidential, true), sql`EXISTS(SELECT 1 FROM "OmbudsmanAccess" a WHERE a."ombudsmanId"=${ombudsmans.id} AND a."userId"=${context.user.id})`)) ?? sql`FALSE`;
}
