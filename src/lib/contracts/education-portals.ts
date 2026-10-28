import type { JsonValue } from "@/db/json";

export type EducationInteractiveData = {
  subjects: { id: string; name: string }[]; teachers: { id: string; employee: { registration: string | null; person: { fullName: string } | null } }[]; classes: { id: string; name: string }[];
  students: { id: string; person: { fullName: string }; enrollments: { classId: string | null }[] }[]; catalog: { id: string; title: string }[];
  releases: { id: string; studentId: string | null; classId: string | null; catalogItem: { title: string; instructions: string; content: JsonValue; durationSeconds: number | null } }[];
  attempts: { id: string; score: number; correctAnswers: number; incorrectAnswers: number; startedAt: Date; completedAt: Date | null; student: { person: { fullName: string } }; release: { catalogItem: { title: string } } }[];
};
export type EducationGuardianChild = {
  id: string; studentCode: string; status: string; person: { fullName: string };
  enrollments: { classId: string | null; supportCode: string | null; status: string; school: { name: string }; schoolClass: { name: string } | null }[];
  grades: { period: string; value: number | null; concept: string | null; schoolSubject: { name: string } }[]; attendances: { isPresent: boolean }[];
};
export type EducationGuardianActivity = {
  id: string; classId: string; title: string; instructions: string; dueAt: Date | null; schoolClass: { name: string }; subject: { name: string };
  submissions: { studentId: string; status: string; answer: string | null; score: number | null; feedback: string | null }[];
};
export type EducationGuardianPortalData = { guardian: { fullName: string }; children: EducationGuardianChild[]; activities: EducationGuardianActivity[] };
