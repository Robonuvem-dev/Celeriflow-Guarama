export class PatientPortalError extends Error {}

export type PortalPatientIdentity = { id: string; personId: string; fullName: string };
export type PortalAppointment = { id: string; date: Date; status: string; specialty: string | null; priority: string; unit: { name: string }; professional: { specialty: string | null } | null };
export type PortalDocument = { id: string; title: string; fileUrl: string };
export type PortalLabReport = { id: string; createdAt: Date; releasedAt: Date | null; document: PortalDocument };
export type PortalVaccination = { id: string; date: Date; doseNumber: number; lotNumber: string | null; vaccine: { name: string }; unit: { name: string } };
export type PortalDispensation = { id: string; date: Date; quantity: number; dosageSnapshot: string | null; observation: string | null; nextWithdrawalAt: Date | null; medicine: { name: string }; unit: { name: string } | null };
export type PortalReferral = { id: string; date: Date; specialty: string; status: string; priority: string };
export type PortalRegulation = { id: string; createdAt: Date; status: string; guideNumber: string | null; priority: string; specialty: { name: string } | null; service: { name: string } | null };
export type PortalClinicalDocument = { id: string; kind: string; createdAt: Date; document: PortalDocument };
export type PortalSchedule = { id: string; unitId: string; unit: string; specialty: string | null; professional: string | null; when: string; free: number; total: number };
export type PortalManifestation = { id: string; protocolNumber: string; type: string; subject: string; status: string; response: string | null; respondedAt: Date | null; createdAt: Date; movements: { toDepartmentId: string; reason: string; createdAt: Date }[]; interactions: { type: string; message: string; createdAt: Date }[] };
export type PortalCampaign = { id: string; name: string; startsAt: Date; endsAt: Date; publicInformation: string; actorUsuarioId: string; createdAt: Date };
