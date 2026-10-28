export type AcademicDocumentSource = {
  id: string; studentCode: string; status: string; person: { fullName: string; cpf: string | null };
  enrollments: { year: number; status: string; school: { name: string }; schoolClass: { name: string } | null; period: { name: string } | null }[];
  grades: { period: string; value: number | null; concept: string | null; recoveryValue: number | null; schoolSubject: { name: string } }[];
  attendances: { isPresent: boolean }[];
};
export type AcademicDocumentIssueRow = { id: string; type: string; fileName: string; actorName: string; createdAt: Date; student: { person: { fullName: string } } | null };
export type EducationPreEnrollmentProcessRow = { id: string; name: string; status: string; school: { name: string }; _count: { applications: number } };
export type EducationPreEnrollmentRow = { id: string; protocol: string | null; year: number; stage: string; grade: string; shift: string; rankingScore: number; position: number | null; status: string; student: { person: { fullName: string } }; school: { name: string }; process: { name: string } | null };
