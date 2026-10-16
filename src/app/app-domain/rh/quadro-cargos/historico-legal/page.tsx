import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { RoleLegalHistoryClient } from "./RoleLegalHistoryClient";

export default async function RoleLegalHistoryPage({ searchParams }: { searchParams: Promise<{ financialYearId?: string; roleId?: string; page?: string }> }) {
  const { prisma, user } = await getTenantContextForModule("RH");
  const input = await searchParams;
  const units = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const years = await prisma.financialYear.findMany({ where: { governmentEntity: { planningUnits: { some: units ? { budgetUnitId: { in: units } } : {} } } }, select: { id: true, year: true, governmentEntity: { select: { id: true, name: true } } }, orderBy: [{ year: "desc" }, { id: "asc" }] });
  const year = years.find(row => row.id === input.financialYearId) ?? years[0];
  if (!year?.governmentEntity) return <p className="p-5">Selecione exercício de entidade autorizada.</p>;
  const page = Math.max(1, Math.min(100000, Number.parseInt(input.page ?? "1", 10) || 1));
  const where = { governmentEntityId: year.governmentEntity.id, ...(input.roleId ? { roleId: input.roleId } : {}) };
  const [roles, acts, history, count, latest] = await Promise.all([
    prisma.role.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    prisma.legalTextVersion.findMany({ where: { legalText: { governmentEntityId: year.governmentEntity.id }, document: { status: "Válido", versions: { some: { status: { in: ["FINAL", "SIGNED"] } } } } }, include: { legalText: true, document: { include: { versions: { where: { status: { in: ["FINAL", "SIGNED"] } }, orderBy: { versionNumber: "desc" } } } } }, orderBy: [{ legalTextId: "asc" }, { versionNumber: "desc" }] }),
    prisma.hrRoleLegalHistory.findMany({ where, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }, { id: "desc" }], take: 30, skip: (page - 1) * 30 }),
    prisma.hrRoleLegalHistory.count({ where }),
    prisma.hrRoleLegalHistory.groupBy({ by: ["roleId"], where: { governmentEntityId: year.governmentEntity.id }, _max: { version: true } }),
  ]);
  const href = (at: number) => `?${new URLSearchParams({ financialYearId: year.id, roleId: input.roleId ?? "", page: String(at) })}`;
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">RH — histórico legal de cargos</h1><Link className="underline" href="/rh/quadro-cargos">Voltar ao quadro de cargos</Link><form className="flex flex-wrap gap-3"><label>Entidade/exercício<select name="financialYearId" defaultValue={year.id} className="block rounded border p-2">{years.map(row => <option key={row.id} value={row.id}>{row.governmentEntity?.name} · {row.year}</option>)}</select></label><label>Filtrar histórico por cargo<select name="roleId" defaultValue={input.roleId ?? ""} className="block rounded border p-2"><option value="">Todos</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><button className="rounded border p-2">Consultar</button></form><RoleLegalHistoryClient key={year.id} financialYearId={year.id} roles={roles} acts={acts.map(act => ({ id: act.id, label: `${act.legalText.type} ${act.legalText.number} · edição ${act.versionNumber}`, versions: act.document?.versions.map(version => ({ id: version.id, label: `GED v${version.versionNumber} · ${version.hashSha256}` })) ?? [] }))} latestVersions={Object.fromEntries(latest.map(row => [row.roleId, row._max.version ?? 0]))} history={history.map(row => ({ id: row.id, roleId: row.roleId, effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10), version: row.version, state: row.state, designation: row.designation, authorizedSeats: row.authorizedSeats, legalReference: row.legalReference, documentVersionId: row.documentVersionId, documentHash: row.documentHash, reason: row.reason, rectification: row.rectification }))} /><nav className="flex gap-3">{page > 1 && <Link href={href(page - 1)}>Anterior</Link>}<span>{count} edições · página {page}</span>{page * 30 < count && <Link href={href(page + 1)}>Próxima</Link>}</nav></section>;
}
