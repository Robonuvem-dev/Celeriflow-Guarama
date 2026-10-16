import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function TfdReportsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const status = typeof params.status === "string" ? params.status.slice(0, 30) : "";
  const where = {
    ...(context.user.hasHealthAccessScope ? { originUnitId: { in: context.user.allowedHealthUnitIds || [] } } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ destination: { contains: q, mode: "insensitive" as const } }, { patient: { person: { fullName: { contains: q, mode: "insensitive" as const } } } }] } : {}),
  };
  const total = await context.prisma.healthTfdRequest.count({ where });
  const page = Math.min(Math.max(1, Number(params.page) || 1), Math.max(1, Math.ceil(total / 30)));
  const requests = await context.prisma.healthTfdRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (Math.floor(page) - 1) * 30, take: 30, include: { patient: { include: { person: { select: { fullName: true } } } }, originUnit: true, clinicalReport: { select: { version: true, diagnosis: true } } } });
  const [units, professionals, procedures] = await Promise.all([
    context.prisma.healthUnit.findMany({ where: { ...(context.user.hasHealthAccessScope ? { id: { in: context.user.allowedHealthUnitIds || [] } } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    context.prisma.healthProfessional.findMany({ where: { tfdClinicalReports: { some: { request: { ...(context.user.hasHealthAccessScope ? { originUnitId: { in: context.user.allowedHealthUnitIds || [] } } : {}) } } } }, orderBy: { employee: { name: "asc" } }, select: { id: true, employee: { select: { name: true } } } }),
    context.prisma.healthSusProcedure.findMany({ where: { tfdClinicalReports: { some: { request: { ...(context.user.hasHealthAccessScope ? { originUnitId: { in: context.user.allowedHealthUnitIds || [] } } : {}) } } } }, orderBy: { code: "asc" }, select: { id: true, code: true, description: true } }),
  ]);
  const pageUrl = (next: number) => `/saude/tfd/laudos?${new URLSearchParams({ q, status, page: String(next) })}`;
  return <main className="space-y-4 p-4">
    <header><Link href="/saude/tfd" className="text-sm underline">Transporte TFD</Link><h1 className="text-xl font-semibold">Laudos, trâmites e benefícios TFD</h1></header>
    <form className="flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Paciente ou destino" className="rounded border p-2"/><select name="status" defaultValue={status} className="rounded border p-2"><option value="">Todas as situações</option>{["SOLICITADA", "APROVADA", "AUTORIZADA", "GLOSADA", "ALTERACAO", "NEGADA", "CANCELADA", "ARQUIVADA"].map(value => <option key={value}>{value}</option>)}</select><button className="rounded bg-amber-700 px-4 text-white">Filtrar</button></form>
    <details className="rounded border bg-white p-3"><summary className="cursor-pointer font-semibold">Emitir relatório de processos TFD</summary><form action="/api/saude/tfd/relatorio" target="_blank" className="mt-3 grid gap-2 text-sm md:grid-cols-3"><label>Unidade solicitante<select name="unitId" className="w-full rounded border p-2"><option value="">Todas as unidades autorizadas</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label>Destino<input name="destination" className="w-full rounded border p-2"/></label><label>Profissional<select name="professionalId" className="w-full rounded border p-2"><option value="">Todos</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.employee.name}</option>)}</select></label><label>Procedimento<select name="procedureId" className="w-full rounded border p-2"><option value="">Todos</option>{procedures.map(procedure => <option key={procedure.id} value={procedure.id}>{procedure.code} · {procedure.description}</option>)}</select></label><label>De<input name="from" type="date" className="w-full rounded border p-2"/></label><label>Até<input name="to" type="date" className="w-full rounded border p-2"/></label><button className="rounded border p-2 md:col-span-3">Baixar relatório CSV</button></form></details>
    <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead><tr className="bg-slate-100"><th className="p-2">Paciente</th><th>Unidade</th><th>Destino</th><th>Laudo</th><th>Situação</th><th/></tr></thead><tbody>{requests.map(request => <tr key={request.id} className="border-t"><td className="p-2">{request.patient.person.fullName}</td><td>{request.originUnit?.name || "Não informada"}</td><td>{request.destination}</td><td>{request.clinicalReport ? `Versão ${request.clinicalReport.version} · ${request.clinicalReport.diagnosis}` : "A incluir"}</td><td>{request.status}</td><td className="p-2"><Link className="underline" href={`/saude/tfd/laudos/${encodeURIComponent(request.id)}`}>Abrir processo</Link></td></tr>)}</tbody></table>{requests.length === 0 && <p className="p-3">Nenhum processo encontrado neste recorte.</p>}</div>
    <nav className="flex gap-4 text-sm"><span>{total} processos · página {page}</span>{page > 1 && <Link className="underline" href={pageUrl(page - 1)}>Anterior</Link>}{page * 30 < total && <Link className="underline" href={pageUrl(page + 1)}>Próxima</Link>}</nav>
  </main>;
}
