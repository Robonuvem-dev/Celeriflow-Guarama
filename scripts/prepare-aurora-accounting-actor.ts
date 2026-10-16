import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const employeeId = "aurora-accounting-responsible-admin";
const decision = "Vínculo de admin@email.com a servidor exemplificativo autorizado pelo responsável para execução das jornadas financeiras; sem CPF, matrícula legal, contrato de trabalho ou remuneração presumidos.";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))::text`;
      const user = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, select: { id: true, ativo: true, firebaseUid: true, employeeId: true, perfil: { select: { codigo: true } } } });
      if (!user.ativo || !user.firebaseUid || user.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Login autorizado não é administrador ativo/autenticável; vínculo preservado.");
      if (user.employeeId && user.employeeId !== employeeId) throw new Error("O login já possui outro servidor vinculado; nenhuma substituição automática.");
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: "p0-current-exe-ug-1" }, select: { secretariatId: true } });
      const employee = await tx.employee.findUnique({ where: { id: employeeId } });
      if (employee && (!employee.isActive || employee.secretariatId !== unit.secretariatId)) throw new Error("Servidor exemplificativo existente diverge do vínculo previsto.");
      const previous = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_ACCOUNTING_ACTOR", entityId: user.id } });
      if (previous && (!employee || user.employeeId !== employeeId)) throw new Error("Vínculo alterado após preparação; preserve e confira pela interface.");
      if (apply && !previous) {
        if (!employee) await tx.employee.create({ data: { id: employeeId, name: "Administrador Municipal — Responsável Financeiro", secretariatId: unit.secretariatId, isActive: true } });
        await tx.usuario.update({ where: { id: user.id }, data: { employeeId } });
        await tx.financialAuditLog.create({ data: { action: "PREPARE_ACCOUNTING_ACTOR", entityType: "Usuario", entityId: user.id, authorUsuarioId: user.id, payload: { previousEmployeeId: user.employeeId, employeeId, decision, parameterOrigin: "OWNER_ESTIMATE", authenticationCredentialsChanged: false } } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", usuarioId: user.id, employeeId, replay: Boolean(previous), linked: apply || user.employeeId === employeeId, decision, authenticationCredentialsChanged: false };
    }, { timeout: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação do autor contábil."); process.exitCode = 1; });
