export type HealthCareProgramRecord = { id: string; code: string; name: string; isActive: boolean; createdAt: Date };
export type HealthCareProgramEnrollmentRecord = { id: string; programId: string; patientId: string; unitId: string; startsAt: Date; endsAt: Date | null; reason: string; closureReason: string | null; createdByUsuarioId: string; closedByUsuarioId: string | null; createdAt: Date };
