import "dotenv/config";
import { and, asc, eq, sql } from "drizzle-orm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createDatabaseConnection } from "../src/db/connection";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { employees, roles } from "../src/db/schema/administration";
import { hrEmploymentContracts } from "../src/db/schema/personnel-workforce";
import { hrPayrollRuleSets, hrEmploymentRegimes } from "../src/db/schema/personnel-configuration";
import { hrContractInputSchema, saveEmploymentContractInTransaction } from "../src/lib/rh/workforce-service";

const packageId = "RH_ESTIMATIVAS_2026_V1";
const actorId = `SYSTEM:${packageId}`;
const effectiveFrom = "2026-11-01";
const artifactPath = "docs/RH_ESTIMATIVAS_SALARIAIS_2026.json";
// Values are explicitly fictional monthly bases, not statutory municipal pay scales.
const estimates: Record<string, { salary: string; weeklyHours: number }> = {
  "Assistente Social": { salary: "4350.00", weeklyHours: 30 },
  "Enfermeiro": { salary: "4750.00", weeklyHours: 36 },
  "Professor de Educação Básica": { salary: "3600.00", weeklyHours: 30 },
  "Agente Comunitário de Saúde": { salary: "3242.00", weeklyHours: 40 },
  "Agente de Combate às Endemias": { salary: "3242.00", weeklyHours: 40 },
  "Auxiliar de Serviços Gerais": { salary: "1800.00", weeklyHours: 40 },
  "Eletricista": { salary: "2790.00", weeklyHours: 40 },
  "Farmacêutico": { salary: "5200.00", weeklyHours: 40 },
  "Merendeiro": { salary: "1850.00", weeklyHours: 40 },
  "Motorista": { salary: "2800.00", weeklyHours: 40 },
  "Médico de Família": { salary: "14800.00", weeklyHours: 20 },
  "Operador de Máquinas": { salary: "3120.00", weeklyHours: 40 },
  "Pedreiro": { salary: "2490.00", weeklyHours: 40 },
  "Psicólogo": { salary: "4650.00", weeklyHours: 30 },
  "Técnico de Enfermagem": { salary: "3325.00", weeklyHours: 36 },
  "Técnico de Informática": { salary: "3680.00", weeklyHours: 40 },
  "Fiscal de Tributos": { salary: "3850.00", weeklyHours: 40 },
  "Profissional de Educação Física": { salary: "3890.00", weeklyHours: 30 },
  "Técnico Agrícola": { salary: "3290.00", weeklyHours: 40 },
  "Auxiliar Administrativo": { salary: "2850.00", weeklyHours: 40 },
  "Contador": { salary: "6200.00", weeklyHours: 40 },
  "Agente de Segurança": { salary: "2600.00", weeklyHours: 40 },
  "Analista Administrativo": { salary: "4200.00", weeklyHours: 40 },
  "Analista Ambiental": { salary: "4800.00", weeklyHours: 40 },
  "Diretor Administrativo da Câmara": { salary: "6500.00", weeklyHours: 40 },
  "Engenheiro Civil": { salary: "7800.00", weeklyHours: 30 },
  "Técnico em Cultura": { salary: "3200.00", weeklyHours: 40 },
};
const secretaryEstimate = { salary: "9500.00", weeklyHours: 40 };
const secretaryRoles = new Set([
  "Secretário Municipal de Administração", "Secretário Municipal de Agricultura e Desenvolvimento",
  "Secretário Municipal de Assistência Social", "Secretário Municipal de Cultura", "Secretário Municipal de Educação",
  "Secretário Municipal de Esporte e Lazer", "Secretário Municipal de Fazenda", "Secretário Municipal de Governo e Planejamento",
  "Secretário Municipal de Meio Ambiente", "Secretário Municipal de Obras", "Secretário Municipal de Saúde", "Secretário Municipal de Segurança",
]);

function gradeFor(id: string) {
  // Stable fictional salary reference, never interpreted as seniority or ATS.
  return [...id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 100000, 0) % 5;
}
function civil(date: Date | null) { return date?.toISOString().slice(0, 10) ?? ""; }
type EvidenceRow = { employeeId: string; role: string; beforeSalary: number; beforeMonthlyHours: number; salary: string; weeklyHours: number; monthlyHours: number; reference: string; contractId: string; applied: boolean };

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(connectionString);
  try {
    // Includes inactive registrations too; do not silently omit a registered employee.
    const selected = await connection.db.select({ employee: employees, role: roles.name }).from(employees).leftJoin(roles, eq(roles.id, employees.roleId)).orderBy(asc(employees.id));
    if (!selected.length) throw new Error("Nenhum servidor cadastrado.");
    const rows: EvidenceRow[] = selected.map(({ employee, role }) => {
      const estimate = role ? estimates[role] ?? (secretaryRoles.has(role) ? secretaryEstimate : null) : null;
      if (!role || !estimate) throw new Error(`Cargo sem estimativa explícita: ${role ?? "não informado"}. Inclua-o no mapa antes de aplicar.`);
      const grade = secretaryRoles.has(role) ? 0 : gradeFor(employee.id);
      return { employeeId: employee.id, role, beforeSalary: employee.salaryBase, beforeMonthlyHours: employee.contractedHours, salary: new Decimal(estimate.salary).mul(new Decimal(1).plus(new Decimal(grade).mul("0.02"))).toFixed(2), weeklyHours: estimate.weeklyHours, monthlyHours: estimate.weeklyHours * 5, reference: `DEMO-${grade + 1}`, contractId: "", applied: false };
    });
    const groups = [...new Set(rows.map(row => row.role))].sort().map(role => {
      const group = rows.filter(row => row.role === role);
      return { role, employees: group.length, minimum: Decimal.min(...group.map(row => row.salary)).toFixed(2), maximum: Decimal.max(...group.map(row => row.salary)).toFixed(2), weeklyHours: group[0].weeklyHours, monthlyHours: group[0].monthlyHours };
    });
    const summary = { packageId, scope: "DEMONSTRACAO", effectiveFrom, employees: rows.length, groups, totalMonthlyBase: rows.reduce((sum, row) => sum.plus(row.salary), new Decimal(0)).toFixed(2), realPayments: false, createsUsers: false, preservesClosedStatements: true };
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify({ mode: "PREVIEW", ...summary }, null, 2));
      return;
    }
    // Preserve the original pre-image when a partially completed package is resumed.
    try {
      const previous = JSON.parse(await readFile(artifactPath, "utf8")) as { packageId: string; effectiveFrom: string; rows: EvidenceRow[] };
      if (previous.packageId !== packageId || previous.effectiveFrom !== effectiveFrom || previous.rows.length !== rows.length) throw new Error("Manifesto anterior incompatível.");
      for (const row of rows) {
        const old = previous.rows.find(item => item.employeeId === row.employeeId);
        if (!old || old.salary !== row.salary || old.monthlyHours !== row.monthlyHours || old.role !== row.role) throw new Error("Cadastro ou estimativa mudou desde o manifesto inicial.");
        row.beforeSalary = old.beforeSalary;
        row.beforeMonthlyHours = old.beforeMonthlyHours;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // Entire roster must have exactly one eligible demonstrative contract before any write.
    const contracts = await connection.db.select({ contract: hrEmploymentContracts, isDemo: hrPayrollRuleSets.isDemo, scope: hrPayrollRuleSets.scope })
      .from(hrEmploymentContracts).innerJoin(hrEmploymentRegimes, eq(hrEmploymentRegimes.id, hrEmploymentContracts.regimeId))
      .innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrEmploymentRegimes.ruleSetId));
    for (const row of rows) {
      const own = contracts.filter(item => item.contract.employeeId === row.employeeId);
      if (own.length !== 1 || !own[0].isDemo || own[0].scope !== "DEMONSTRACAO" || (own[0].contract.details as { seedPackage?: string }).seedPackage !== "RH_PORTAL_2026_V1") throw new Error("Servidor sem contrato único do pacote demonstrativo anterior. Concilie antes de aplicar.");
      row.contractId = own[0].contract.id;
    }
    await mkdir("docs", { recursive: true });
    async function save() {
      await writeFile(artifactPath, JSON.stringify({ ...summary, applied: rows.filter(row => row.applied).length, recordedAt: new Date().toISOString(), layer: "database-population-not-homologation", criterion: "Base mensal por cargo × referência fictícia de 0%, 2%, 4%, 6% ou 8%; secretários sem variação. Jornada estimada por cargo; divisor mensal = semanal × 5. Não representa ATS nem plano legal.", rows }, null, 2) + "\n");
    }
    await save();
    for (const row of rows) {
      await withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        await tx.execute(sql`SELECT id FROM "Employee" WHERE id=${row.employeeId} FOR UPDATE`);
        const [employee] = await tx.select().from(employees).where(eq(employees.id, row.employeeId));
        const [contract] = await tx.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.id, row.contractId));
        if (!employee || !contract || employee.roleId !== contract.roleId) throw new Error("Cadastro/cargo mudou durante a população.");
        const details = contract.details as Record<string, unknown>;
        const previousEstimate = details.salaryEstimate as { packageId?: string; effectiveFrom?: string } | undefined;
        if (previousEstimate?.packageId === packageId) {
          if (previousEstimate.effectiveFrom !== effectiveFrom || contract.salary.toFixed(2) !== row.salary || contract.monthlyHours !== row.monthlyHours || employee.salaryBase !== Number(row.salary) || employee.contractedHours !== row.monthlyHours) throw new Error("Estimativa aplicada foi alterada; concilie sem sobrescrever o operador.");
          return;
        }
        if (employee.salaryBase !== row.beforeSalary || employee.contractedHours !== row.beforeMonthlyHours) throw new Error("Base cadastral mudou após a prévia; recalcule o plano explicitamente.");
        const [closed] = await tx.execute<{ blocked: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE s."contractId"=${contract.id} AND r.status='FECHADA' AND to_date(p.competence,'MM/YYYY')>=${new Date(`${effectiveFrom}T00:00:00Z`)}) AS blocked`).then(result => result.rows);
        if (closed?.blocked) throw new Error("Há competência fechada alcançada pela estimativa. Preserve o histórico e escolha nova vigência.");
        await saveEmploymentContractInTransaction(tx, actorId, hrContractInputSchema.parse({
          id: contract.id, version: contract.version, employeeId: contract.employeeId, registration: contract.registration,
          regimeId: contract.regimeId, roleId: contract.roleId, departmentId: contract.departmentId || undefined,
          costCenterId: contract.costCenterId || undefined, workLocation: contract.workLocation, salaryLevel: contract.salaryLevel || undefined,
          admittedAt: civil(contract.admittedAt), appointedAt: civil(contract.appointedAt), swornAt: civil(contract.swornAt), endsAt: civil(contract.endsAt),
          effectiveFrom, salary: row.salary, monthlyHours: row.monthlyHours,
          details: { ...details, salaryEstimated: true, salarySource: "Estimativa fictícia por cargo autorizada; não é remuneração oficial", weeklyHours: row.weeklyHours, monthlyDivisor: row.monthlyHours, salaryEstimate: { packageId, effectiveFrom, reference: row.reference, baseCriterion: "Mapa explícito por cargo; variação fictícia por referência, sem ATS", originalSalary: row.beforeSalary, originalMonthlyHours: row.beforeMonthlyHours, weeklyHours: row.weeklyHours, monthlyHours: row.monthlyHours } },
          reason: "Estimativa fictícia de salário e jornada para todos os servidores, autorizada em 02/11/2026. Vigência posterior aos três meses históricos; preserva recibos já fechados.",
        }));
        await tx.update(employees).set({ salaryBase: Number(row.salary), contractedHours: row.monthlyHours }).where(and(eq(employees.id, row.employeeId), eq(employees.salaryBase, row.beforeSalary)));
      }, { timeoutMs: 120000 });
      row.applied = true;
      await save();
      if (rows.filter(item => item.applied).length % 20 === 0) console.log(JSON.stringify({ event: "salary-estimates", applied: rows.filter(item => item.applied).length, total: rows.length }));
    }
    console.log(JSON.stringify({ event: "salary-estimates-complete", ...summary, applied: rows.filter(row => row.applied).length }, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
