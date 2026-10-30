"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { saveDiaryAction, saveGradesAction } from "./actions";
import { canRecordAttendance } from "@/lib/educacao/enrollment-lifecycle";
import { diaryPayload, gradesPayload, type GradeDraft } from "./entry-drafts";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import styles from "@/components/app-ui/operational/operational.module.css";

type Student = { id: string; name: string; code: string; status: string; enrollmentDate: string; endDate?: string | null };
type ClassData = { id: string; label: string; subjects: { id: string; name: string }[]; students: Student[] };
type Assessment = { id: string; label: string; mode: string; maxScore: number | null; students: Student[]; grades: Record<string, { value: number | null; concept: string; absent: boolean; recoveryValue: number | null; feedback: string }> };
const emptyLesson = { subjectId: "", date: "", stage: "1º Bimestre", lessonCount: "1", contentTaught: "", observations: "" };
const field = "h-6 w-full min-w-0 rounded border border-slate-200 bg-white px-1 text-sm dark:bg-slate-950";
const attendanceColumns: OperationalColumn[] = [
  { key: "order", label: "Ordem", type: "text", initialWidth: 80, minWidth: 65, align: "center", resizable: true, sortable: false, details: "overflow" },
  { key: "name", label: "Aluno", type: "identifier", initialWidth: 420, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "present", label: "Presente", type: "text", initialWidth: 110, minWidth: 90, align: "center", resizable: true, sortable: false, details: "none" },
];
const gradeColumns: OperationalColumn[] = [
  { key: "name", label: "Aluno", type: "identifier", initialWidth: 350, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  ...[ ["value", "Nota"], ["concept", "Conceito"], ["absent", "Ausente"], ["recoveryValue", "Recuperação"] ].map(([key, label]): OperationalColumn => ({ key, label, type: "text", initialWidth: 120, minWidth: key === "recoveryValue" ? 110 : 90, resizable: true, sortable: false, details: "none" })),
];

export function ProfessorEntryGrids({ teacherId, classes, assessments }: { teacherId: string; classes: ClassData[]; assessments: Assessment[] }) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [assessmentId, setAssessmentId] = useState(assessments[0]?.id || "");
  const [attendancePage, setAttendancePage] = useState(1);
  const [gradePage, setGradePage] = useState(1);
  // Rascunhos pertencem à turma/avaliação, nunca à página renderizada.
  const [presence, setPresence] = useState<Record<string, Record<string, boolean>>>({});
  const [gradeDraft, setGradeDraft] = useState<Record<string, Record<string, GradeDraft>>>({});
  const [lessons, setLessons] = useState<Record<string, typeof emptyLesson>>({});
  const lesson = lessons[classId] || emptyLesson;
  const setLesson = (value: typeof emptyLesson) => setLessons((current) => ({ ...current, [classId]: value }));
  const activeClass = classes.find((item) => item.id === classId);
  const activeAssessment = assessments.find((item) => item.id === assessmentId);
  const subjectId = activeClass?.subjects.some((subject) => subject.id === lesson.subjectId) ? lesson.subjectId : activeClass?.subjects[0]?.id || "";
  function submit(event: React.FormEvent<HTMLFormElement>, mode: "attendance" | "grades") {
    event.preventDefault();
    if (mode === "attendance" && (!lesson.date || !lesson.contentTaught.trim() || !subjectId || Number(lesson.lessonCount) < 1)) { setNotice("Informe disciplina, data, quantidade de aulas e conteúdo em Dados da aula."); return; }
    const data = new FormData();
    data.set("teacherId", teacherId);
    if (mode === "attendance") {
      Object.entries(lesson).forEach(([key, value]) => data.set(key, value));
      data.set("classId", classId); data.set("subjectId", subjectId);
      data.set("attendances", JSON.stringify(diaryPayload((activeClass?.students || []).filter(s => canRecordAttendance(s, lesson.date)), presence[classId] || {})));
    } else {
      data.set("assessmentId", assessmentId);
      data.set("grades", JSON.stringify(gradesPayload(activeAssessment?.students || [], activeAssessment?.grades || {}, gradeDraft[assessmentId] || {})));
    }
    const action = mode === "attendance" ? saveDiaryAction : saveGradesAction;
    startTransition(async () => {
      try { const result = await action(data); setNotice(result.error || result.message || ""); if (!result.error) router.refresh(); }
      catch { setNotice("Falha de comunicação. Os rascunhos permanecem disponíveis para nova tentativa."); }
    });
  }
  return <>
    <div className="flex shrink-0 flex-wrap gap-2">{(["attendance", "grades"] as const).map((mode) => {
      const students = (mode === "attendance" ? activeClass?.students : activeAssessment?.students) || [];
      const page = Math.min(mode === "attendance" ? attendancePage : gradePage, Math.max(1, Math.ceil(students.length / OPERATIONAL_PAGE_SIZE)));
      const start = (page - 1) * OPERATIONAL_PAGE_SIZE;
      const gridFormId = `${formId}-${mode}`;
      return <OperationalTablePanel key={mode} title={mode === "attendance" ? "Chamada e conteúdo" : "Notas, conceitos e recuperação"} triggerLabel={mode === "attendance" ? "Registrar chamada e conteúdo" : "Lançar notas, conceitos e recuperação"} description="20 alunos por página. Salvar envia todos os alunos da turma ou avaliação. Rascunhos são preservados ao fechar e reabrir.">
        <form id={gridFormId} onSubmit={(event) => submit(event, mode)} />
          <OperationalListFrame actions={<button form={gridFormId} disabled={pending || !students.length} type="submit" className={styles.dialogButton}><Save />{pending ? "Salvando…" : "Salvar"}</button>} toolbar={<div className="flex w-full min-w-0 gap-2">
            {mode === "attendance" ? <><select aria-label="Turma" disabled={pending} className={field} value={classId} onChange={(event) => { setClassId(event.target.value); setAttendancePage(1); }}>{classes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><OperationalFilters label="Dados da aula"><div className={styles.filterFields}>{(Object.keys(lesson) as (keyof typeof lesson)[]).map((key) => <label key={key}>{({ subjectId: "Disciplina", date: "Data", stage: "Etapa", lessonCount: "Quantidade de aulas", contentTaught: "Conteúdo ministrado", observations: "Observações" })[key]}{key === "subjectId" ? <select disabled={pending} className={field} value={subjectId} onChange={(event) => setLesson({ ...lesson, subjectId: event.target.value })}>{activeClass?.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : key === "stage" ? <select disabled={pending} className={field} value={lesson.stage} onChange={(event) => setLesson({ ...lesson, stage: event.target.value })}>{["1º Bimestre", "2º Bimestre", "3º Bimestre", "4º Bimestre", "Final"].map((stage) => <option key={stage}>{stage}</option>)}</select> : <input disabled={pending} className={field} type={key === "date" ? "date" : key === "lessonCount" ? "number" : "text"} min={key === "lessonCount" ? 1 : undefined} value={lesson[key]} onChange={(event) => setLesson({ ...lesson, [key]: event.target.value })} />}</label>)}</div></OperationalFilters></> : <select aria-label="Avaliação" disabled={pending} className={field} value={assessmentId} onChange={(event) => { setAssessmentId(event.target.value); setGradePage(1); }}>{assessments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
            <OperationalFilters label={notice ? "Resultado da gravação" : "Ajuda"}><p role="status">{notice || "Salvar envia todos os alunos da turma ou avaliação, inclusive os das outras páginas."}</p></OperationalFilters>
          </div>} pagination={<OperationalPagination page={page} total={students.length} onPageChange={mode === "attendance" ? setAttendancePage : setGradePage} />}>
            <OperationalTable caption={mode === "attendance" ? "Chamada — presença dos alunos" : "Notas, conceitos e recuperação"} preferenceId={`educacao-professor-${mode}`} columns={mode === "attendance" ? attendanceColumns : gradeColumns} rows={students.slice(start, start + OPERATIONAL_PAGE_SIZE).map((student, index) => {
              const old = activeAssessment?.grades[student.id], draft = gradeDraft[assessmentId]?.[student.id] || {};
              const update = (part: GradeDraft) => setGradeDraft((current) => ({ ...current, [assessmentId]: { ...current[assessmentId], [student.id]: { ...current[assessmentId]?.[student.id], ...part } } }));
              return { id: student.id, label: student.name, values: { name: `${student.name}${student.status !== "Matriculado" ? ` · ${student.status}` : ""}`, order: String(start + index + 1), present: !canRecordAttendance(student, lesson.date) ? "Inabilitado" : presence[classId]?.[student.id] !== false ? "Sim" : "Não", value: String(draft.value ?? old?.value ?? ""), concept: draft.concept ?? old?.concept ?? "", absent: (draft.absent ?? old?.absent) ? "Sim" : "Não", recoveryValue: String(draft.recoveryValue ?? old?.recoveryValue ?? "") }, cells: mode === "attendance" ? { present: <input aria-label={`Presença de ${student.name}`} disabled={pending || !canRecordAttendance(student, lesson.date)} type="checkbox" checked={canRecordAttendance(student, lesson.date) && presence[classId]?.[student.id] !== false} onChange={(event) => { const checked = event.target.checked; setPresence((current) => ({ ...current, [classId]: { ...current[classId], [student.id]: checked } })); }} /> } : {
                value: <input form={gridFormId} aria-label={`Nota de ${student.name}`} disabled={pending} type="number" step="0.01" max={activeAssessment?.maxScore ?? undefined} value={draft.value ?? old?.value ?? ""} onChange={(event) => update({ value: event.target.value })} className={field} />,
                concept: <input aria-label={`Conceito de ${student.name}`} disabled={pending} value={draft.concept ?? old?.concept ?? ""} onChange={(event) => update({ concept: event.target.value })} className={field} />,
                absent: <input aria-label={`Ausência de ${student.name}`} disabled={pending} type="checkbox" checked={draft.absent ?? old?.absent ?? false} onChange={(event) => update({ absent: event.target.checked })} />,
                recoveryValue: <input form={gridFormId} aria-label={`Recuperação de ${student.name}`} disabled={pending} type="number" step="0.01" value={draft.recoveryValue ?? old?.recoveryValue ?? ""} onChange={(event) => update({ recoveryValue: event.target.value })} className={field} />,
              } };
            })} />
          </OperationalListFrame>
      </OperationalTablePanel>;
    })}</div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </>;
}
