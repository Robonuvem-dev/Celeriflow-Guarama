import Link from "next/link";
import { canViewModule, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readControlWorkforceStatistics, workforceStatisticsInput } from "@/lib/c7/workforce-statistics";
import { db, databaseConnection } from "@/db/client";
import { modules } from "@/db/schema/identity";
import { and, eq } from "drizzle-orm";
import { listControlWorkforceYears } from "@/db/repositories/internal-control/workforce";
import WorkforceTables from "./WorkforceTables";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";

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
  return <WorkforceTables key={exportQuery.toString()}
    actions={<><Link href="/controle-interno" className={styles.dialogButton}>Voltar ao Controle</Link>{["PDF", "CSV", "XLSX"].map(format => <a key={format} className={styles.dialogButton} href={`/api/controle-interno/estatisticas-rh?${exportQuery}&format=${format}`}>Exportar {format}</a>)}</>}
    filters={<OperationalFilters activeCount={[input.data.roleId, input.data.employeeId, input.data.salaryLevel, input.data.roleStatus !== "ALL", input.data.legalStatus !== "ALL"].filter(Boolean).length}>
    <form method="get" className={styles.filterFields}>
      <label>Entidade/exercício<select name="financialYearId" defaultValue={input.data.financialYearId} className="block rounded border p-2">{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} — {year.year}</option>)}</select></label>
      <label>Referência<input type="date" name="referenceDate" required defaultValue={input.data.referenceDate} className="block rounded border p-2" /></label>
      <label>Cargo ID<input name="roleId" defaultValue={input.data.roleId} className="block rounded border p-2" /></label>
      <label>Servidor ID<input name="employeeId" defaultValue={input.data.employeeId} className="block rounded border p-2" /></label>
      <label>Enquadramento<input name="salaryLevel" defaultValue={input.data.salaryLevel} className="block rounded border p-2" /></label>
      <label>Situação cadastral do cargo<select name="roleStatus" defaultValue={input.data.roleStatus} className="block rounded border p-2"><option value="ALL">Todos</option><option value="ACTIVE">Ativos atuais</option><option value="INACTIVE">Inativos atuais</option></select></label>
      <label>Situação legal na referência<select name="legalStatus" defaultValue={input.data.legalStatus} className="block rounded border p-2"><option value="ALL">Todas</option><option value="EXISTING">Existentes documentados</option><option value="EXTINGUISHED">Extintos documentados</option><option value="NOT_DOCUMENTED">Sem posição legal</option></select></label>
      <button className="rounded border p-2">Consultar</button>
    </form>
    <p className="text-sm">{data.metadata}</p>
    <p>Cargos sem posição legal vigente: {data.undocumentedRoleCount} · Vínculos em cargos extintos: {data.contractsInExtinguishedRoles}. <Link href="/rh/quadro-cargos/historico-legal" className="underline">Histórico legal de origem</Link></p>
    <p>Pessoas distintas: <strong>{data.totalPeople}</strong> · Vínculos ativos na referência: <strong>{data.totalContracts}</strong>. Pessoas por cargo não são somáveis quando há multivínculo.</p>
    {(data.missingRevisionCount > 0 || data.missingRoleCount > 0) && <p role="status">Conferência incompleta: {data.missingRevisionCount} contratos candidatos sem revisão vigente; {data.missingRoleCount} vínculos com cargo ausente no catálogo.</p>}
    <Link className={styles.dialogButton} href="/controle-interno/consultas/rh">Limpar filtros</Link>
    </OperationalFilters>}
    groups={data.groups.map(group => ({ id: group.id, label: group.name, values: { role: group.name, id: group.id, current: group.currentlyActive ? "Ativo" : "Inativo", legal: group.legalState, designation: group.historicalDesignation ?? "sem denominação histórica", effective: group.legalEffectiveFrom ?? "—", reference: group.legalReference ?? "—", event: group.legalEventId ?? "—", people: String(group.people), contracts: String(group.contracts) } }))}
    records={data.rows.map(row => ({ id: row.contractId, label: row.employeeName, values: { employee: row.employeeName, id: row.employeeId, registration: row.registration ?? "—", role: row.roleName ?? "—", salary: row.salaryLevel ?? "—", center: row.costCenterName ?? "—", location: row.workLocation ?? "—", version: String(row.version), revision: row.revisionId } }))} />;
}
