import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolveSecretariatManager } from "../src/lib/administration/secretariat-manager";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
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
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }), transactionOptions: { timeout: 120000 } });
  try {
    const preview = await Promise.all(appointments.map(async ([secretariatId, employeeId, role]) => ({ secretariat: await db.secretariat.findUniqueOrThrow({ where: { id: secretariatId }, select: { id: true, name: true, managerId: true } }), employee: await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, name: true, secretariatId: true, departmentId: true, unitId: true, roleId: true } }), role })));
    if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "PREVIEW", appointments: preview }, null, 2)); return; }
    const actor = await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } }, select: { id: true } });
    mkdirSync(".next/cache/data-review", { recursive: true });
    const snapshotPath = `.next/cache/data-review/leadership-before-${Date.now()}.json`;
    writeFileSync(snapshotPath, JSON.stringify(preview, null, 2));
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`;
      for (const [index, appointment] of preview.entries()) {
        const { secretariat, employee, role } = appointment;
        const marker = `${prefix}:${index}`;
        if (await tx.auditEvent.findUnique({ where: { id: marker } })) continue;
        if (secretariat.managerId) continue; // Preserve any manager already assigned by the user.
        const roleRecord = await tx.role.findFirst({ where: { name: role, isActive: true }, select: { id: true } }) || await tx.role.create({ data: { id: `${prefix}:role:${index}`, name: role, level: "Agente político / Direção", description: "Nomeação fictícia para a base de demonstração municipal." } });
        let departmentId = employee.departmentId;
        let unitId = employee.unitId;
        if (employee.secretariatId !== secretariat.id) {
          const department = await tx.department.findFirst({ where: { secretariatId: secretariat.id, isActive: true }, select: { id: true } }) || await tx.department.create({ data: { id: `${prefix}:department:${index}`, name: secretariat.id === "p0-current-secretariat-leg" ? "Diretoria Administrativa" : "Gabinete da Secretaria", secretariatId: secretariat.id } });
          departmentId = department.id;
          unitId = null;
        }
        await tx.employee.update({ where: { id: employee.id }, data: { roleId: roleRecord.id, secretariatId: secretariat.id, departmentId, unitId } });
        const manager = await resolveSecretariatManager(tx, secretariat.id, employee.id);
        await tx.secretariat.update({ where: { id: secretariat.id }, data: manager });
        await tx.auditEvent.create({ data: { id: marker, eventType: "ADMINISTRATIVE_MUTATION", targetType: "SECRETARIAT", targetId: secretariat.id, actorUsuarioId: actor.id } });
      }
    });
    const result = await db.secretariat.findMany({ select: { name: true, managerId: true, manager: { select: { name: true, isActive: true, role: { select: { name: true } }, secretariatId: true } } }, orderBy: { name: "asc" } });
    console.log(JSON.stringify({ mode: "APPLIED", snapshotPath, result }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
