export type EducationSchoolOption = { id: string; name: string };
export type EducationPersonOption = { id: string; fullName: string; cpf: string | null };
export type EducationStudentRow = {
  id: string; studentCode: string; status: string; usesSchoolTransport: boolean; needsSpecialMeal: boolean;
  person: EducationPersonOption;
  guardians: { kinship: string; person: EducationPersonOption }[];
  enrollments: { school: EducationSchoolOption; schoolClass: EducationSchoolOption | null }[];
};
export type EducationClassRow = {
  id: string; name: string; year: number; stage: string; grade: string; shift: string; classType: string; status: string; capacity: number;
  school: EducationSchoolOption; period: EducationSchoolOption | null; matrix: EducationSchoolOption | null;
  _count: { enrollments: number; teacherAssignments: number; scheduleBoards: number };
};
export type EducationEnrollmentRow = {
  id: string; supportCode: string | null; year: number; status: string; enrollmentDate: Date;
  student: { id: string; studentCode: string; person: EducationPersonOption };
  school: EducationSchoolOption; schoolClass: EducationSchoolOption | null; period: EducationSchoolOption | null;
  movements: { effectiveDate: Date; type: string; reason: string | null }[];
};
export type EducationAcademicData = {
  schools: EducationSchoolOption[];
  periods: { id: string; name: string; school: EducationSchoolOption }[];
  matrices: EducationSchoolOption[]; classes: EducationClassRow[];
  teachers: { id: string; employee: { name: string } }[]; subjects: EducationSchoolOption[];
};
export type EducationCensusOperation = {
  id: string; operationType: string; competence: string; layoutVersion: string; fileName: string; checksum: string; status: string;
  recordsRead: number; validRecords: number; updatedRecords: number; inconsistentRecords: number; ignoredRecords: number;
  issues: import("@/db/json").JsonValue; generatedContent: string | null; actorName: string; createdAt: Date;
};
export type EducationSchoolRow = {
  id: string; name: string; inepCode: string | null; capacity: number; isActive: boolean;
  director: { person: { fullName: string } | null } | null; _count: { classes: number; enrollments: number };
};
export type EducationTeacherRow = {
  id: string; employee: { name: string; registration: string | null; isActive: boolean };
  taughtClasses: { school: EducationSchoolOption }[];
};
