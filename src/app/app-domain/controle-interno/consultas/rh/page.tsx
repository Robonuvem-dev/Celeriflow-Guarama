import Link from "next/link";
import { canViewModule, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readControlWorkforceStatistics, workforceStatisticsInput } from "@/lib/c7/workforce-statistics";
import { db, databaseConnection } from "@/db/client";
import { modules } from "@/db/schema/identity";
import { and, eq } from "drizzle-orm";
import { listControlWorkforceYears } from "@/db/repositories/internal-control/workforce";

export default async function ControlWorkforceConsultation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await getTenantContextForModule("ADMINISTRACAO");
  if (!canViewModule(user, "RH") || !(await db.select({ id: modules.id }).from(modules).where(and(eq(modules.codigo, "RH"), eq(modules.ativo, true))).limit(1)).length) return <p className="p-5">Estatísticas funcionais exigem RH ativo e leitura autorizada.</p>;
  const actor = { usuarioId: user.id, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds };
  const years = await listControlWorkforceYears(db, actor.allowedBudgetUnitIds);
  if (!years.length) return <p className="p-5">Sem exercício municipal autorizado.</p>;
  const raw = await searchParams;
  const values = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== ""));
  const selectedYear = years.find(year => year.id === values.financialYearId) ?? years[0];
  const input = workforceStatisticsInput.safeParse({ financialYearId: selectedYear.id, referenceDate: `${selectedYear.year}-12-31`, ...values });
  if (!input.success) return <p className="p-5">{input.error.issues[0]?.message ?? "Filtros inválidos."}</p>;
  if (!years.some(year => year.id === input.data.financialYearId) || !input.data.referenceDate.startsWith(`${selectedYear.year}-`)) return <p className="p-5">Exercício ou referência fora do escopo selecionado.</p>;
  const data = await readControlWorkforceStatistics(databaseConnection, actor, input.data);
  const exportQuery = new URLSearchParams(Object.entries(input.data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  return <section className="space-y-4 p-5">
    <h1 className="text-xl font-semibold">Controle Interno — estatísticas funcionais por referência</h1>
    <Link href="/controle-interno" className="underline">Voltar ao Controle</Link>
    <form className="flex flex-wrap items-end gap-3">
      <label>Entidade/exercício<select name="financialYearId" defaultValue={input.data.financialYearId} className="block rounded border p-2">{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} — {year.year}</option>)}</select></label>
      <label>Referência<input type="date" name="referenceDate" required defaultValue={input.data.referenceDate} className="block rounded border p-2" /></label>
      <label>Cargo ID<input name="roleId" defaultValue={input.data.roleId} className="block rounded border p-2" /></label>
      <label>Servidor ID<input name="employeeId" defaultValue={input.data.employeeId} className="block rounded border p-2" /></label>
      <label>Enquadramento<input name="salaryLevel" defaultValue={input.data.salaryLevel} className="block rounded border p-2" /></label>
      <label>Situação cadastral do cargo<select name="roleStatus" defaultValue={input.data.roleStatus} className="block rounded border p-2"><option value="ALL">Todos</option><option value="ACTIVE">Ativos atuais</option><option value="INACTIVE">Inativos atuais</option></select></label>
      <label>Situação legal na referência<select name="legalStatus" defaultValue={input.data.legalStatus} className="block rounded border p-2"><option value="ALL">Todas</option><option value="EXISTING">Existentes documentados</option><option value="EXTINGUISHED">Extintos documentados</option><option value="NOT_DOCUMENTED">Sem posição legal</option></select></label>
      <button className="rounded border p-2">Consultar</button>
    </form>
    <nav className="flex gap-3" aria-label="Exportações funcionais">{["PDF", "CSV", "XLSX"].map(format => <a key={format} className="underline" href={`/api/controle-interno/estatisticas-rh?${exportQuery}&format=${format}`}>Exportar {format}</a>)}</nav>
    <p className="text-sm">{data.metadata}</p>
    <p>Cargos sem posição legal vigente: {data.undocumentedRoleCount} · Vínculos em cargos extintos: {data.contractsInExtinguishedRoles}. <Link href="/rh/quadro-cargos/historico-legal" className="underline">Histórico legal de origem</Link></p>
    <p>Pessoas distintas: <strong>{data.totalPeople}</strong> · Vínculos ativos na referência: <strong>{data.totalContracts}</strong>. Pessoas por cargo não são somáveis quando há multivínculo.</p>
    {(data.missingRevisionCount > 0 || data.missingRoleCount > 0) && <p role="status">Conferência incompleta: {data.missingRevisionCount} contratos candidatos sem revisão vigente; {data.missingRoleCount} vínculos com cargo ausente no catálogo.</p>}
    <div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th className="border p-2">Cargo</th><th className="border p-2">Situação atual</th><th className="border p-2">Situação legal na data</th><th className="border p-2">Pessoas</th><th className="border p-2">Vínculos</th></tr></thead><tbody>{data.groups.map(group => <tr key={group.id}><td className="border p-2">{group.name} · {group.id}</td><td className="border p-2">{group.currentlyActive ? "Ativo" : "Inativo"}</td><td className="border p-2">{group.legalState} · {group.historicalDesignation ?? "sem denominação histórica"} · {group.legalEffectiveFrom} · {group.legalReference}<br />{group.legalEventId}</td><td className="border p-2">{group.people}</td><td className="border p-2">{group.contracts}</td></tr>)}</tbody></table></div>
    <details><summary>Vínculos e revisões utilizados na apuração</summary><div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{["Servidor", "Matrícula", "Cargo", "Enquadramento", "Centro/localização", "Revisão"].map(title => <th key={title} className="border p-2">{title}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.contractId}><td className="border p-2">{row.employeeName} · {row.employeeId}</td><td className="border p-2">{row.registration}</td><td className="border p-2">{row.roleName}</td><td className="border p-2">{row.salaryLevel}</td><td className="border p-2">{row.costCenterName} · {row.workLocation}</td><td className="border p-2">{row.version} · {row.revisionId}</td></tr>)}</tbody></table></div></details>
  </section>;
}
