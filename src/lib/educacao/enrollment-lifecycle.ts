export function canRecordAttendance(student: { enrollmentDate: string; endDate?: string | null }, lessonDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) return false;
  return student.enrollmentDate.slice(0, 10) <= lessonDate && (!student.endDate || lessonDate <= student.endDate.slice(0, 10));
}
export function consecutiveAbsentDays(records: { date: string; isPresent: boolean | null }[]) {
  const days = new Map<string, boolean[]>();
  for (const record of records) { const day = record.date.slice(0, 10); days.set(day, [...(days.get(day) || []), record.isPresent === false]); }
  let count = 0;
  for (const day of [...days.keys()].sort().reverse()) {
    if (!days.get(day)!.every(Boolean)) break;
    count++;
  }
  return count;
}
