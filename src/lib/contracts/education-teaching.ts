export type TeachingSubject = { id: string; name: string };
export type TeachingEnrollment = { status: string; enrollmentDate: Date; student: { id: string; studentCode: string; person: { fullName: string } } };
export type TeachingClass = {
  id: string; name: string; teacherId: string | null; school: { name: string }; period: { name: string } | null;
  matrix: { subjects: { subjectId: string; subject: TeachingSubject }[] } | null;
  teacherAssignments: { subjectId: string; subject: TeachingSubject }[]; enrollments: TeachingEnrollment[];
};
export type TeachingDiary = { id: string; date: Date; contentTaught: string | null; status: string; stage: string; schoolClass: { name: string }; schoolSubject: { name: string } | null; _count: { attendances: number } };
export type TeachingAssessment = {
  id: string; date: Date; title: string; stage: string; status: string; evaluationMode: string; maxScore: number | null; subject: { name: string }; schoolClass: { name: string; enrollments: TeachingEnrollment[] };
  grades: { studentId: string; value: number | null; concept: string | null; absent: boolean; recoveryValue: number | null; feedback: string | null }[];
};
export type TeachingAcademicRecord = { id: string; type: string; title: string; stage: string | null; status: string; startDate: Date; schoolClass: { name: string }; subject: { name: string } | null };
export type TeachingActivity = {
  id: string; type: string; title: string; status: string; createdAt: Date; schoolClass: { name: string }; subject: { name: string }; questions: { id: string }[];
  submissions: { id: string; status: string; answer: string | null; feedback: string | null; student: { person: { fullName: string } } }[];
};
export type TeachingWorkspaceRecords = { diaries: TeachingDiary[]; assessments: TeachingAssessment[]; records: TeachingAcademicRecord[]; activities: TeachingActivity[] };
