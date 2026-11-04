import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { writeFile } from "node:fs/promises";

// Read-only inventory. Persist only aggregates, never CPF, salary per person or credentials.
const sql = neon(process.env.DATABASE_URL);
const result = {
  checkedAt: new Date().toISOString(),
  identity: await sql`SELECT count(*)::int total,count(*) FILTER(WHERE "isActive")::int active,count(*) FILTER(WHERE "personId" IS NULL)::int without_person,count(*) FILTER(WHERE "roleId" IS NULL)::int without_role,count(*) FILTER(WHERE "departmentId" IS NULL)::int without_department,count(*) FILTER(WHERE "salaryBase"=0)::int zero_salary FROM "Employee"`,
  contracts: await sql`SELECT status,count(*)::int total FROM "HrEmploymentContract" GROUP BY status`,
  coverage: await sql`SELECT count(*)::int active_without_contract FROM "Employee" e WHERE e."isActive" AND NOT EXISTS(SELECT 1 FROM "HrEmploymentContract" c WHERE c."employeeId"=e.id AND c.status='ATIVO')`,
  consistency: await sql`SELECT count(*) FILTER(WHERE e.name IS DISTINCT FROM p."fullName")::int name_differences,count(*) FILTER(WHERE regexp_replace(coalesce(e.cpf,''),'[^0-9]','','g') IS DISTINCT FROM regexp_replace(coalesce(p.cpf,''),'[^0-9]','','g'))::int cpf_differences FROM "Employee" e JOIN "Person" p ON p.id=e."personId"`,
  runs: await sql`SELECT p.competence,r.mode,r.scope,r.status,count(DISTINCT r.id)::int runs,count(s.id)::int statements,count(s.id) FILTER(WHERE s."releaseAt"<=now() AND s."revokedAt" IS NULL)::int released FROM "Payroll" p LEFT JOIN "HrPayrollRun" r ON r."payrollId"=p.id LEFT JOIN "HrPayrollStatement" s ON s."runId"=r.id WHERE p.competence LIKE '%2026' GROUP BY p.competence,r.mode,r.scope,r.status ORDER BY p.competence`,
  attendance: await sql`SELECT to_char(date,'YYYY-MM') AS period,count(*)::int records,count(DISTINCT "employeeId")::int employees FROM "AttendanceRecord" WHERE date>='2026-01-01' AND date<'2027-01-01' GROUP BY 1 ORDER BY 1`,
  users: await sql`SELECT count(*)::int total,count(*) FILTER(WHERE "employeeId" IS NOT NULL)::int linked FROM "Usuario"`,
  portalRequests: await sql`SELECT kind,status,count(*)::int total FROM "HrPortalRequest" GROUP BY kind,status ORDER BY 1,2`,
  moduleActivation: await sql`SELECT codigo,ativo FROM "ConfiguracaoModulo" WHERE codigo IN ('RH','PORTAL_SERVIDOR','SST','ADMINISTRACAO') ORDER BY codigo`,
  relationships: await sql`SELECT tc.table_name,kcu.column_name,ccu.table_name AS target FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.constraint_schema=tc.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name IN ('Employee','Person','HrEmploymentContract') ORDER BY 1,2`,
  references: await sql`SELECT kind,count(*)::int total FROM "HrReferenceRecord" GROUP BY kind ORDER BY kind`,
  integration: await sql`SELECT domain,status,count(*)::int total FROM "HrIntegrationEvent" GROUP BY domain,status ORDER BY 1,2`,
};
const identifier = value => `"${value.replaceAll('"', '""')}"`;
result.moduleCoverage = await Promise.all(result.relationships.filter(row => row.target === "Employee").map(async row => {
  const table = identifier(row.table_name), column = identifier(row.column_name);
  const [counts] = await sql.query(`SELECT count(*)::int records,count(${column})::int linked,count(DISTINCT ${column})::int employees FROM ${table}`);
  return { table: row.table_name, column: row.column_name, ...counts };
}));
const output = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--save")) await writeFile("docs/RH_PORTAL_DIAGNOSTICO_2026.json", output);
if (process.argv.includes("--save-after")) await writeFile("docs/RH_PORTAL_RESULTADO_2026.json", output);
console.log(output);
