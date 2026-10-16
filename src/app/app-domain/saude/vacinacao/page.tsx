import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";
import { Syringe } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { HealthSimpleListClient } from "../HealthSimpleListClient";
import { exportVaccinationAction } from "./actions";
import { VaccineApplicationForm } from "./VaccineApplicationForm";
import { vaccinationFormOptions } from "@/lib/saude/vaccination-form-options";

const field = "h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-xs";
const PAGE_SIZE = 20;
type Params = { q?: string | string[]; filter?: string | string[]; page?: string | string[]; patientId?: string | string[]; appointmentId?: string | string[]; medicalRecordId?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const positivePage = (value: string | undefined) => value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1;

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  const { prisma } = context;
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const params = await searchParams;
  if (first(params.patientId)) {
    const query = new URLSearchParams();
    if (first(params.appointmentId)) query.set("appointmentId", first(params.appointmentId)!);
    if (first(params.medicalRecordId)) query.set("medicalRecordId", first(params.medicalRecordId)!);
    redirect(`/saude/vacinacao/carteira/${encodeURIComponent(first(params.patientId)!)}?${query}`);
  }
  const q = (first(params.q) || "").trim().slice(0, 120);
  const filter = (first(params.filter) || "").trim().slice(0, 120);
  const itemWhere: Prisma.VaccinationRecordWhereInput = { ...(unitIds ? { unitId: { in: unitIds } } : {}), ...(filter ? { vaccine: { name: filter } } : {}), ...(q ? { OR: [{ patient: { person: { fullName: { contains: q, mode: "insensitive" } } } }, { vaccine: { name: { contains: q, mode: "insensitive" } } }, { professional: { employee: { person: { fullName: { contains: q, mode: "insensitive" } } } } }, { lotNumber: { contains: q, mode: "insensitive" } }] } : {}) };
  const total = await prisma.vaccinationRecord.count({ where: itemWhere });
  const page = Math.min(positivePage(first(params.page)), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const [items, exportItems, vaccines, patients, applicationOptions] = await Promise.all([
    prisma.vaccinationRecord.findMany({ where: itemWhere, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, orderBy: { createdAt: "desc" }, include: { patient: { include: { person: true } }, vaccine: true, professional: { include: { employee: { include: { person: true } } } }, unit: true } }),
    prisma.vaccinationRecord.findMany({ where: unitIds ? { unitId: { in: unitIds } } : {}, take: 500, orderBy: { createdAt: "desc" }, include: { patient: { include: { person: true } }, vaccine: true } }),
    prisma.vaccine.findMany({ where: { isActive: true, materialId: { not: null } }, orderBy: { name: "asc" } }),
    prisma.patient.findMany({ where: { status: "Ativo", ...(unitIds ? { referenceUnitId: { in: unitIds } } : {}) }, orderBy: { person: { fullName: "asc" } }, take: 500, include: { person: true } }),
    vaccinationFormOptions(context),
  ]);

  return (
    <PageFrame className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Vacinação Básica" icon={<Syringe className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <nav className="flex shrink-0 flex-wrap gap-3 text-xs"><Link href="/saude/vacinacao/carteiras" className="rounded border bg-white p-2 font-semibold underline">Carteiras e busca ativa</Link><Link href="/saude/vacinacao/gestao" className="rounded border bg-white p-2 font-semibold underline">Imunobiológicos, calendário, diluentes e estoque</Link><Link href="/saude/vacinacao/esavi" className="rounded border bg-white p-2 font-semibold underline">ESAVI e condutas</Link></nav>
      <div className="grid shrink-0 gap-2 lg:grid-cols-[2fr_1fr_1fr]">
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Registrar aplicação</summary><VaccineApplicationForm options={applicationOptions} patients={patients.map(patient => ({ id: patient.id, name: patient.person.fullName }))} idempotencyKey={randomUUID()} /></details>
        <div className="rounded border bg-white p-2 text-xs"><h2 className="font-semibold">Frascos e perdas</h2><Link href="/saude/vacinacao/gestao" className="mt-2 block underline">Abrir/preparar frasco, registrar perda de doses e conciliar saldos</Link></div>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Enviar ficha e-SUS</summary><form action={exportVaccinationAction} className="mt-2 grid gap-1"><select name="recordId" required className={field}><option value="">Ficha</option>{exportItems.map(x => <option key={x.id} value={x.id}>{x.patient.person.fullName} · {x.vaccine.name} · {x.date.toLocaleDateString("pt-BR")}</option>)}</select><p className="text-[10px] text-slate-500">Exige conexão ativa e endpoint controlado.</p><button className="h-8 rounded bg-slate-800 px-2 font-semibold text-white">Enviar</button></form></details>
      </div>
      <HealthSimpleListClient rows={items.map((item) => ({ id: item.id, cells: { date: item.date.toLocaleString("pt-BR"), patient: item.patient.person.fullName, vaccine: item.vaccine.name, professional: item.professional.employee.person?.fullName || "-", unit: item.unit.name, dose: String(item.doseNumber), lot: item.lotNumber || "-", strategy: item.strategy || "-" } }))} columns={[{ key: "date", label: "Data", width: "medium" }, { key: "patient", label: "Paciente" }, { key: "vaccine", label: "Vacina", responsive: "sm" }, { key: "professional", label: "Profissional", responsive: "md" }, { key: "unit", label: "Unidade", responsive: "lg" }, { key: "dose", label: "Dose", align: "center", width: "narrow" }, { key: "lot", label: "Lote", responsive: "md", width: "medium" }]} label="aplicações" searchPlaceholder="Buscar paciente, vacina, profissional ou lote" filterKey="vaccine" filterLabel="Todas as vacinas" serverPagination={{ page, total, pathname: "/app-domain/saude/vacinacao", search: q, filter, filterOptions: vaccines.map(x => x.name) }} />
    </PageFrame>
  );
}
