import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type EmploymentContract = {
  id: string; employeeId: string; registration: string; regimeId: string; roleId: string;
  departmentId: string | null; costCenterId: string | null; workLocation: string; salaryLevel: string | null;
  admittedAt: Date; appointedAt: Date | null; swornAt: Date | null; endsAt: Date | null;
  monthlyHours: number; salary: Decimal; status: string; version: number; details: JsonValue;
  createdAt: Date; updatedAt: Date;
};
export type EmploymentRevision = {
  id: string; contractId: string; version: number; effectiveFrom: Date; snapshot: JsonValue;
  actorId: string; reason: string; createdAt: Date;
};
export type AttendanceRecord = {
  id: string; employeeId: string; date: Date; entryTime: Date | null; exitTime: Date | null;
  status: string; hoursWorked: number; extraHours: number; bankHours: number; contractedHours: number;
  createdAt: Date; updatedAt: Date;
};
export type HrPortalRequest = {
  id: string; employeeId: string; requestKey: string; kind: string; status: string; payload: JsonValue;
  decision: string | null; actorId: string; decidedBy: string | null; createdAt: Date; decidedAt: Date | null;
};
export type PortalEmployee = {
  id: string; name: string; registration: string | null;
  role: { name: string } | null; department: { name: string } | null; secretariat: { name: string } | null;
};
export type RoleLegalHistoryEvent = {
  id: string; governmentEntityId: string; roleId: string; effectiveFrom: Date; version: number; state: string; designation: string; authorizedSeats: number;
  legalReference: string; legalTextVersionId: string; documentId: string; documentVersionId: string; documentHash: string; documentFileUrl: string; reason: string; rectification: boolean;
  previousEventId: string | null; actorUsuarioId: string; idempotencyKey: string; requestHash: string; createdAt: Date;
};
