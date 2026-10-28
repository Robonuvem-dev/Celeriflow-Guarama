export type ConstructionAccess = { administrator: boolean; employeeId: string | null; departmentId: string | null; roles: string[] };

export type ConstructionPropertyUpdateRecord = {
  id: string; completionId: string; requestKey: string; processId: string; status: string;
  proposedSnapshot: unknown; beforeSnapshot: unknown; afterSnapshot: unknown;
  createdBy: string; createdAt: Date; appliedBy: string | null; appliedAt: Date | null;
  completion: { number: string; kind: string };
};
export type ConstructionPropertyUpdateList = { updates: ConstructionPropertyUpdateRecord[]; processes: { id: string; protocolNumber: string }[]; total: number; page: number };
