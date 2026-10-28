import { config } from "dotenv";
import { and, asc, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { departments, employees, roles, secretariats } from "../src/db/schema/administration";
import { accessProfiles, users } from "../src/db/schema/identity";
import { auditEvents } from "../src/db/schema/audit";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveSecretariatManager } from "../src/lib/administration/secretariat-manager";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const prefix = "aurora-leadership-v1";
// Appoint existing fictional employees; preserve their canonical person records,
// salary, payroll items and other operational history.
const appointments = [
  ["aurora-system-v1:secretariat:000", "aurora-system-v1:employee:009", "Secretário Municipal de Administração"],
  ["aurora-system-v1:secretariat:001", "aurora-mg-50k-v1:employee:001", "Secretário Municipal de Educação"],
  ["aurora-system-v1:secretariat:002", "aurora-mg-50k-v1:employee:002", "Secretário Municipal de Saúde"],
  ["aurora-system-v1:secretariat:003", "aurora-mg-50k-v1:employee:006", "Secretário Municipal de Assistência Social"],
  ["aurora-system-v1:secretariat:004", "aurora-system-v1:employee:013", "Secretário Municipal de Obras"],
  ["aurora-system-v1:secretariat:005", "aurora-system-v1:employee:014", "Secretário Municipal de Cultura"],
  ["aurora-system-v1:secretariat:006", "aurora-system-v1:employee:015", "Secretário Municipal de Meio Ambiente"],
  ["aurora-system-v1:secretariat:007", "aurora-system-v1:employee:016", "Secretário Municipal de Segurança"],
  ["aurora-system-v1:secretariat:008", "aurora-mg-50k-v1:employee:013", "Secretário Municipal de Fazenda"],
  ["aurora-system-v1:secretariat:009", "aurora-mg-50k-v1:employee:000", "Secretário Municipal de Governo e Planejamento"],
  ["aurora-system-v1:secretariat:010", "aurora-mg-50k-v1:employee:018", "Secretário Municipal de Agricultura e Desenvolvimento"],
  ["aurora-system-v1:secretariat:011", "aurora-mg-50k-v1:employee:019", "Secretário Municipal de Esporte e Lazer"],
  ["p0-current-secretariat-leg", "aurora-mg-50k-v1:employee:020", "Diretor Administrativo da Câmara Municipal"],
] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(connectionString);
  const db = connection.db;
  try {
    const preview = await Promise.all(appointments.map(async ([secretariatId, employeeId, role]) => {
      const [[secretariat], [employee]] = await Promise.all([
        db.select({ id: secretariats.id, name: secretariats.name, managerId: secretariats.managerId }).from(secretariats).where(eq(secretariats.id, secretariatId)).limit(1),
        db.select({ id: employees.id, name: employees.name, secretariatId: employees.secretariatId, departmentId: employees.departmentId, unitId: employees.unitId, roleId: employees.roleId }).from(employees).where(eq(employees.id, employeeId)).limit(1),
      ]);
      if (!secretariat || !employee) throw new Error(`Secretaria ou servidor não encontrado para ${secretariatId}.`);
      return { secretariat, employee, role };
    }));
    if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "PREVIEW", appointments: preview }, null, 2)); return; }
    const [actor] = await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1);
    if (!actor) throw new Error("Administrador ativo não encontrado.");
    mkdirSync(".next/cache/data-review", { recursive: true });
    const snapshotPath = `.next/cache/data-review/leadership-before-${Date.now()}.json`;
    writeFileSync(snapshotPath, JSON.stringify(preview, null, 2));
    await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`);
      for (const [index, appointment] of preview.entries()) {
        const { secretariat, employee, role } = appointment;
        const marker = `${prefix}:${index}`;
        if ((await tx.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.id, marker)).limit(1)).length) continue;
        if (secretariat.managerId) continue; // Preserve any manager already assigned by the user.
        const [existingRole] = await tx.select({ id: roles.id }).from(roles).where(and(eq(roles.name, role), eq(roles.isActive, true))).limit(1);
        const roleRecord = existingRole || (await tx.insert(roles).values({ id: `${prefix}:role:${index}`, name: role, level: "Agente político / Direção", description: "Nomeação fictícia para a base de demonstração municipal." }).returning({ id: roles.id }))[0];
        let departmentId = employee.departmentId;
        let unitId = employee.unitId;
        if (employee.secretariatId !== secretariat.id) {
          const [existingDepartment] = await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.secretariatId, secretariat.id), eq(departments.isActive, true))).limit(1);
          const department = existingDepartment || (await tx.insert(departments).values({ id: `${prefix}:department:${index}`, name: secretariat.id === "p0-current-secretariat-leg" ? "Diretoria Administrativa" : "Gabinete da Secretaria", secretariatId: secretariat.id }).returning({ id: departments.id }))[0];
          departmentId = department.id;
          unitId = null;
        }
        await tx.update(employees).set({ roleId: roleRecord.id, secretariatId: secretariat.id, departmentId, unitId }).where(eq(employees.id, employee.id));
        const manager = await resolveSecretariatManager(tx, secretariat.id, employee.id);
        await tx.update(secretariats).set(manager).where(eq(secretariats.id, secretariat.id));
        await tx.insert(auditEvents).values({ id: marker, eventType: "ADMINISTRATIVE_MUTATION", targetType: "SECRETARIAT", targetId: secretariat.id, actorUsuarioId: actor.id });
      }
    }, { timeoutMs: 120_000 });
    const rows = await db.select({ name: secretariats.name, managerId: secretariats.managerId, manager: { name: employees.name, isActive: employees.isActive, secretariatId: employees.secretariatId }, role: { name: roles.name } }).from(secretariats).leftJoin(employees, eq(secretariats.managerId, employees.id)).leftJoin(roles, eq(employees.roleId, roles.id)).orderBy(asc(secretariats.name));
    const result = rows.map(({ manager, role, ...row }) => ({ ...row, manager: manager ? { ...manager, role } : null }));
    console.log(JSON.stringify({ mode: "APPLIED", snapshotPath, result }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
