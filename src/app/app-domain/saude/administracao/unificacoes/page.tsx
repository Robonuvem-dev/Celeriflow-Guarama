import { and, asc, count, desc, eq, ilike, isNull, like, ne, or, sql } from "drizzle-orm";
import { addresses, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { patients } from "@/db/schema/health-registration";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { managementAdministrativeMerges } from "@/db/schema/health-management-operations";
import { users } from "@/db/schema/identity";
import Link from "next/link";
import { Combine } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { UnificationsClient, type MergeCandidate, type MergeHistory, type MergeKind } from "./UnificationsClient";

const PAGE_SIZE = 20;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
function href(page: number, kind: string, q: string) { const query = new URLSearchParams({ tipo: kind, page: String(page), ...(q ? { q } : {}) }); return `/app-domain/saude/administracao/unificacoes?${query}`; }

export default async function UnificationsPage({ searchParams }: { searchParams: Promise<{ tipo?: string | string[]; q?: string | string[]; page?: string | string[] }> }) {
  const context = await getTenantContextForModule("SAUDE");
  const db = context.database;
  const params = await searchParams;
  const rawKind = first(params.tipo);
  const kind: MergeKind = rawKind === "ADDRESS" || rawKind === "PROFESSIONAL" ? rawKind : "PATIENT";
  const q = (first(params.q) || "").trim().slice(0, 120);
  const requestedPage = Number(first(params.page)) || 1;
  let candidates: MergeCandidate[] = [];
  let total = 0;
  let page = requestedPage;
  if (kind === "ADDRESS") {
    const where = and(isNull(addresses.canonicalAddressId), q ? or(ilike(addresses.streetName, `%${q}%`), like(addresses.zipCode, `%${q}%`), ilike(people.fullName, `%${q}%`)) : undefined);
    total = (await db.select({ total: count() }).from(addresses).leftJoin(people, eq(people.id, addresses.personId)).where(where))[0].total; page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const rows = await db.select({ id: addresses.id, zipCode: addresses.zipCode, streetName: addresses.streetName, number: addresses.number, complement: addresses.complement, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(addresses).leftJoin(people, eq(people.id, addresses.personId)).leftJoin(companies, eq(companies.id, addresses.companyId)).where(where).orderBy(asc(addresses.streetName), asc(addresses.id)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE);
    candidates = rows.map(row => ({ id: row.id, title: `${row.streetName || "Logradouro não informado"}, ${row.number || "s/n"}`, subtitle: `CEP ${row.zipCode || "não informado"}`, facts: [row.person?.fullName || row.company?.corporateName || "Sem titular", row.complement || "Sem complemento"] }));
  } else if (kind === "PATIENT") {
    const where = and(ne(patients.status, "Unificado"), q ? or(ilike(people.fullName, `%${q}%`), ilike(people.motherName, `%${q}%`)) : undefined);
    total = (await db.select({ total: count() }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(where))[0].total; page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const rows = await db.select({ id: patients.id, cns: patients.cns, person: { fullName: people.fullName, birthDate: people.birthDate, motherName: people.motherName, cpf: people.cpf }, _count: { records: sql<number>`(SELECT count(*)::integer FROM "MedicalRecord" r WHERE r."patientId"=${patients.id})`.mapWith(Number), appointments: sql<number>`(SELECT count(*)::integer FROM "HealthAppointment" a WHERE a."patientId"=${patients.id})`.mapWith(Number) } }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(where).orderBy(asc(people.fullName), asc(patients.id)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE);
    candidates = rows.map(row => ({ id: row.id, title: row.person.fullName, subtitle: `CNS ${row.cns || "não informado"} · CPF ${row.person.cpf || "não informado"}`, facts: [`Nascimento: ${row.person.birthDate?.toLocaleDateString("pt-BR") || "não informado"}`, `Mãe: ${row.person.motherName || "não informada"}`, `${row._count.records} registro(s) e ${row._count.appointments} agendamento(s)`] }));
  } else {
    const where = and(eq(healthProfessionals.isActive, true), q ? ilike(employees.name, `%${q}%`) : undefined);
    total = (await db.select({ total: count() }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(where))[0].total; page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const rows = await db.select({ id: healthProfessionals.id, cns: healthProfessionals.cns, cbo: healthProfessionals.cbo, councilName: healthProfessionals.councilName, councilNumber: healthProfessionals.councilNumber, employee: { name: employees.name, cpf: employees.cpf }, _count: { records: sql<number>`(SELECT count(*)::integer FROM "MedicalRecord" r WHERE r."professionalId"=${healthProfessionals.id})`.mapWith(Number), appointments: sql<number>`(SELECT count(*)::integer FROM "HealthAppointment" a WHERE a."professionalId"=${healthProfessionals.id})`.mapWith(Number), assignments: sql<number>`(SELECT count(*)::integer FROM "HealthProfessionalAssignment" a WHERE a."professionalId"=${healthProfessionals.id})`.mapWith(Number) } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(where).orderBy(asc(employees.name), asc(healthProfessionals.id)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE);
    candidates = rows.map(row => ({ id: row.id, title: row.employee.name, subtitle: `${row.councilName || "Conselho"} ${row.councilNumber || "não informado"} · CPF ${row.employee.cpf || "não informado"}`, facts: [`CNS: ${row.cns || "não informado"}`, `CBO: ${row.cbo || "não informado"}`, `${row._count.records} registro(s), ${row._count.appointments} agendamento(s) e ${row._count.assignments} vínculo(s)`] }));
  }
  const historyRows = await db.select({ id: managementAdministrativeMerges.id, kind: managementAdministrativeMerges.kind, targetId: managementAdministrativeMerges.targetId, sourceIds: managementAdministrativeMerges.sourceIds, criteria: managementAdministrativeMerges.criteria, result: managementAdministrativeMerges.result, createdAt: managementAdministrativeMerges.createdAt, actorUsuario: { nome: users.nome } }).from(managementAdministrativeMerges).innerJoin(users, eq(users.id, managementAdministrativeMerges.actorUsuarioId)).where(eq(managementAdministrativeMerges.kind, kind)).orderBy(desc(managementAdministrativeMerges.createdAt)).limit(20);
  const history: MergeHistory[] = historyRows.map(row => ({ id: row.id, kind: row.kind, targetId: row.targetId, sourceIds: JSON.stringify(row.sourceIds), criteria: JSON.stringify(row.criteria), result: JSON.stringify(row.result), actor: row.actorUsuario.nome, createdAt: row.createdAt.toISOString() }));
  return <PageFrame className="flex h-full min-h-0 max-w-none flex-1 flex-col gap-2 overflow-hidden"><PageHeader title="Central de Unificações" icon={<Combine className="size-4 text-emerald-700" />} className="mb-0 shrink-0" action={<Link href="/app-domain/saude/administracao" className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold">Administração</Link>} /><form className="grid shrink-0 gap-2 rounded-md border bg-white p-2 sm:grid-cols-[190px_1fr_auto]"><select name="tipo" defaultValue={kind} className="h-8 rounded border bg-white px-2 text-xs"><option value="PATIENT">Prontuários</option><option value="PROFESSIONAL">Profissionais</option><option value="ADDRESS">Endereços</option></select><input name="q" defaultValue={q} placeholder="Buscar candidatos" className="h-8 rounded border px-2 text-xs" /><button className="h-8 rounded bg-slate-800 px-4 text-xs font-bold text-white">Buscar</button></form><UnificationsClient kind={kind} candidates={candidates} history={history} canUpdate={canPerformModuleOperation(context.user, "SAUDE", "update")} /><div className="shrink-0"><ErpPagination page={page} total={total} previousHref={href(Math.max(1, page - 1), kind, q)} nextHref={href(page + 1, kind, q)} label="candidatos" jumpTo={{ pathname: "/app-domain/saude/administracao/unificacoes", values: { tipo: kind, q } }} /></div></PageFrame>;
}
