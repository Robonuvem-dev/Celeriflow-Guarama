import Link from "next/link";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { AccessApplicationPanel } from "./AccessApplicationPanel";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { citizenAccessApplications } from "@/db/schema/citizen-access";
import { processes } from "@/db/schema/processes";
import { taxpayers as taxpayerTable, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";

export const dynamic = "force-dynamic";
export default async function CitizenAccessApplicationsPage() {
  await getTenantContextForSystemAdministration();
  const applications = await db.select({ application: citizenAccessApplications, process: { protocolNumber: processes.protocolNumber } }).from(citizenAccessApplications).innerJoin(processes, eq(processes.id, citizenAccessApplications.processId)).where(eq(citizenAccessApplications.status, "PENDENTE")).orderBy(asc(citizenAccessApplications.createdAt)).limit(100).then(rows => rows.map(row => ({ ...row.application, process: row.process })));
  return <main className="mx-auto max-w-5xl space-y-5 p-4"><Link href="/protocolos/servicos" className="text-sm font-semibold text-emerald-800">← Serviços</Link><h1 className="text-2xl font-semibold">Conferência de acesso ao Autoatendimento</h1><p className="text-sm leading-6 text-slate-600">A identidade Firebase é verificada, mas o vínculo cadastral exige conferência municipal. A aprovação cria uma conta externa sem permissões ERP.</p>{await Promise.all(applications.map(async (application) => {
    const taxpayers = await db.select({ id: taxpayerTable.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayerTable).leftJoin(people, eq(people.id, taxpayerTable.personId)).leftJoin(companies, eq(companies.id, taxpayerTable.companyId)).where(and(eq(taxpayerTable.status, "Ativo"), or(eq(people.cpf, application.declaredDocument), eq(companies.cnpj, application.declaredDocument))));
    return <section key={application.id} className="rounded border bg-white p-5"><h2 className="font-semibold">{application.process.protocolNumber} — {application.name}</h2><p className="mt-2 text-sm">E-mail verificado: {application.email} • Documento declarado: {application.declaredDocument}</p><AccessApplicationPanel id={application.id} taxpayers={taxpayers.map((item) => ({ id: item.id, name: item.person?.fullName || item.company?.corporateName || "Contribuinte" }))} /></section>;
  }))}{!applications.length && <p className="rounded border p-5 text-sm">Nenhuma solicitação de acesso pendente.</p>}</main>;
}
