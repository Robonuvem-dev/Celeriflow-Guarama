import type { JsonValue } from "@/db/json";

export type SstPageOption = { id: string; name: string };
export type SstPageUser = { id: string; nome: string };
export type SstPagePerson = { id: string; fullName: string };
export type SstPageUnit = SstPageOption & { secretariatId: string };
export type SstPageResult<T> = { records: T[]; total: number; page: number };

export type SstReasonPageDto = {
  id: string; budgetUnitId: string; code: string; name: string; dependentPolicy: string;
  restrictedRoleIds: string[]; autoProtocol: boolean; autoPresentedAt: boolean;
  printReceipt: boolean; suggestLeave: boolean; createLeaveOnApproval: boolean;
  leaveType: string; isActive: boolean; createdAt: Date; updatedAt: Date;
};
export type SstAccessGrantPageDto = {
  id: string; usuarioId: string; budgetUnitId: string; canReadClinical: boolean;
  canAssess: boolean; isActive: boolean; createdAt: Date; updatedAt: Date;
  budgetUnit: { name: string };
};
export type SstProfessionalPageDto = {
  id: string; budgetUnitId: string; personId: string; usuarioId: string | null;
  discipline: string; council: string; startsAt: Date; endsAt: Date; isActive: boolean;
  createdById: string; createdAt: Date; person: { fullName: string };
};
export type SstShiftPageDto = {
  id: string; budgetUnitId: string; employeeId: string; startsAt: Date; endsAt: Date;
  source: string; roleIdSnapshot: string | null; departmentIdSnapshot: string | null;
  createdById: string; createdAt: Date; employee: { name: string };
};
export type SstBoardPageDto = {
  id: string; budgetUnitId: string; name: string; startsAt: Date; endsAt: Date;
  isActive: boolean; createdById: string; createdAt: Date; updatedAt: Date;
  budgetUnit: { name: string };
  members: { id: string; boardId: string; personId: string; council: string; person: { fullName: string } }[];
};
export type SstExposurePageDto = {
  id: string; budgetUnitId: string; code: string; name: string; departmentIds: string[];
  roleIds: string[]; startsAt: Date; endsAt: Date | null; isActive: boolean;
  createdById: string; createdAt: Date; updatedAt: Date;
};
export type SstProgramPageDto = {
  id: string; budgetUnitId: string; code: string; kind: string; version: number;
  startsAt: Date; endsAt: Date; responsiblePersonId: string; responsibleCouncil: string;
  responsibleSnapshot: JsonValue; content: JsonValue; createdById: string; createdAt: Date;
};
export type SstProgramGroupPageDto = {
  id: string; programId: string; groupId: string; groupSnapshot: JsonValue;
  risks: JsonValue; exams: JsonValue;
};
export type SstQuestionnairePageDto = {
  id: string; budgetUnitId: string; discipline: string; code: string; title: string;
  version: number; questions: JsonValue; submissionKey: string; requestHash: string;
  createdById: string; createdAt: Date;
};
export type SstAvailabilityPageDto = {
  id: string; budgetUnitId: string; professionalPersonId: string; unitName: string;
  startsAt: Date; endsAt: Date; slotMinutes: number; isActive: boolean; createdById: string;
  createdAt: Date; updatedAt: Date; professional: { fullName: string };
};
export type SstAppointmentPageDto = {
  id: string; availabilityId: string; employeeId: string; purpose: string; startsAt: Date;
  endsAt: Date; status: string; cancellationReason: string | null; cancelledAt: Date | null;
  createdById: string; createdAt: Date; updatedAt: Date;
};
export type SstSelectedAvailabilityPageDto = SstAvailabilityPageDto & {
  budgetUnit: SstPageUnit & { code: string };
  blocks: { id: string; availabilityId: string; startsAt: Date; endsAt: Date; reason: string; createdById: string; createdAt: Date }[];
  appointments: SstAppointmentPageDto[];
};
export type SstEquipmentPageDto = {
  id: string; budgetUnitId: string; materialId: string; kind: string; ca: string;
  caValidUntil: Date | null; validityDays: number; reviewDays: number; supplierId: string | null;
  createdById: string; createdAt: Date; submissionKey: string; requestHash: string;
  name: string; code: string;
};
export type SstSupplierPageDto = { id: string; person: { fullName: string } | null; company: { corporateName: string } | null };
export type SstPlanRegistrationPageDto = {
  id: string; budgetUnitId: string; benefitConfigId: string; supplierId: string; operatorCompanyId: string;
  ansPlanNumber: string; ansOperatorNumber: string; monthlyRubricId: string; extraordinaryRubricId: string;
  monthlyEventId: string | null; extraordinaryEventId: string | null; contractReference: string;
  snapshot: JsonValue; createdById: string; createdAt: Date;
  benefitConfig: { id: string; name: string; type: string; baseValue: number; supplierId: string | null; isActive: boolean; createdAt: Date; updatedAt: Date };
};
