/** Structural contracts for the existing access-filter callers. SQL repositories
 * use their own predicates; these values never execute or translate queries. */
export type ConstructionDepartmentFilter = {
  id?: { in: string[] };
  process?: { currentDepartmentId: string };
};

export type ConstructionParticipantFilter = {
  participants: { some: { identityId: string; isActive: boolean; endsAt: null } };
};
