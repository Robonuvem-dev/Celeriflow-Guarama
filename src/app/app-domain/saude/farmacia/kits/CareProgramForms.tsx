import { closeCareProgramAction, enrollCareProgramAction, saveCareProgramAction } from "./actions";
type Option = { id: string; name: string };
const field = "min-w-0 rounded border bg-white p-2 text-sm";
export function CareProgramForms({ programs, patients, units, enrollments }: { programs: Option[]; patients: Option[]; units: Option[]; enrollments: { id: string; startsAt: Date; endsAt: Date | null; reason: string; closureReason: string | null; patient: { person: { fullName: string } }; program: { name: string }; unit: { name: string } }[] }) {
  const select = (name: string, label: string, options: Option[]) => <label className="grid gap-1">{label}<select name={name} required className={field}><option value="">Selecione</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
  return <details className="rounded border bg-white p-3"><summary className="font-semibold">Ações programáticas e vínculos dos pacientes</summary>
    <form action={saveCareProgramAction} className="mt-3 flex flex-wrap gap-2"><input name="code" required placeholder="Código da ação programática" className={field} /><input name="name" required placeholder="Nome da ação programática" className={field} /><button className={field}>Cadastrar ação programática</button></form>
    <form action={enrollCareProgramAction} className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      {select("programId", "Ação programática", programs)}{select("patientId", "Paciente", patients)}{select("unitId", "Unidade do vínculo", units)}
      <label className="grid gap-1">Início do vínculo<input name="startsAt" type="date" required className={field} /></label><label className="grid gap-1">Encerramento previsto, se existente<input name="endsAt" type="date" className={field} /></label>
      <input name="reason" required placeholder="Motivo do vínculo" className={field} /><button className={field}>Vincular paciente à ação programática</button>
    </form>
    {enrollments.map(enrollment => <section key={enrollment.id} className="mt-3 border-t pt-2 text-sm"><p>{enrollment.patient.person.fullName} · {enrollment.program.name} · {enrollment.unit.name} · {enrollment.startsAt.toLocaleDateString("pt-BR")} até {enrollment.endsAt?.toLocaleDateString("pt-BR") || "sem encerramento"}</p><p>{enrollment.reason} {enrollment.closureReason}</p>
      {(!enrollment.endsAt || enrollment.endsAt > new Date()) && <form action={closeCareProgramAction} className="mt-1 flex gap-2"><input type="hidden" name="enrollmentId" value={enrollment.id} /><input name="reason" required placeholder="Motivo do encerramento" className={field} /><button className={field}>Encerrar vínculo</button></form>}
    </section>)}
  </details>;
}
