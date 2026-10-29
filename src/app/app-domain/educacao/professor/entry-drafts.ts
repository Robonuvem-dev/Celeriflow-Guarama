export type GradeDraft = { value?: string; concept?: string; absent?: boolean; recoveryValue?: string; feedback?: string };
type Grade = { value: number | null; concept: string; absent: boolean; recoveryValue: number | null; feedback: string };

export function diaryPayload(students: { id: string }[], presence: Record<string, boolean>) {
  return students.map((student) => ({ studentId: student.id, isPresent: presence[student.id] !== false }));
}

export function gradesPayload(students: { id: string }[], grades: Record<string, Grade>, drafts: Record<string, GradeDraft>) {
  return students.map((student) => {
    const old = grades[student.id], draft = drafts[student.id] || {};
    return {
      studentId: student.id,
      value: draft.value === "" ? null : draft.value !== undefined ? Number(draft.value) : old?.value ?? null,
      concept: draft.concept ?? old?.concept ?? "",
      absent: draft.absent ?? old?.absent ?? false,
      recoveryValue: draft.recoveryValue === "" ? null : draft.recoveryValue !== undefined ? Number(draft.recoveryValue) : old?.recoveryValue ?? null,
      feedback: draft.feedback ?? old?.feedback ?? "",
    };
  });
}
