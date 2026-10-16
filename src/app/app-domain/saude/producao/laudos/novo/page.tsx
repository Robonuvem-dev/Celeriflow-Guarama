import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { TreatmentReportEditor } from "../TreatmentReportEditor";

export default async function NewTreatmentReportPage() {
  const context = await getTenantContextForModule("SAUDE");
  const scope = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const [patients, units, professional, performers] = await Promise.all([
    context.prisma.patient.findMany({ where: { status: "Ativo", ...(scope ? { referenceUnitId: { in: scope } } : {}) }, orderBy: { person: { fullName: "asc" } }, take: 500, select: { id: true, person: { select: { fullName: true } } } }),
    context.prisma.healthUnit.findMany({ where: { isActive: true, ...(scope ? { id: { in: scope } } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    context.prisma.healthProfessional.findFirst({ where: { employeeId: context.user.employeeId || "__SEM_PROFISSIONAL__", isActive: true, employee: { isActive: true } }, select: { id: true, employee: { select: { name: true } } } }),
    context.prisma.healthProfessional.findMany({ where: { isActive: true, employee: { isActive: true }, ...(scope ? { OR: [{ unitId: { in: scope } }, { assignments: { some: { unitId: { in: scope }, isActive: true } } }] } : {}) }, orderBy: { employee: { name: "asc" } }, select: { id: true, employee: { select: { name: true } } } }),
  ]);
  return <main className="space-y-4 p-4"><Link href="/saude/producao/laudos" className="text-sm underline">Laudos AIH/APAC</Link><h1 className="text-xl font-semibold">Incluir laudo AIH/APAC</h1>{professional ? <TreatmentReportEditor patients={patients.map(patient => ({ id: patient.id, name: patient.person.fullName }))} units={units} professional={{ id: professional.id, name: professional.employee.name }} performers={performers.map(performer => ({ id: performer.id, name: performer.employee.name }))}/> : <p className="rounded border bg-amber-50 p-3 text-sm">Entre com o profissional de Saúde responsável para emitir o laudo clínico.</p>}</main>;
}
