import { config } from "dotenv";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-procurement-actors-2026-v1";
const departmentId = `${key}:department`;
const reviewerId = "cmv2sbpnj000106lbisa3zhwf";
const reviewerEmployeeId = `${key}:reviewer`;
const receiverEmployeeId = `${key}:receiver`;
const decision = "Responsável autorizou expressamente Admin Teste como segundo operador: admin@email.com solicitante, segundo login aprovador, vínculo funcional e acesso às UGs explicitamente vinculadas a Aurora; recebedor exemplificativo distinto para ateste segregado. Credenciais e perfil compartilhado preservados.";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const requester = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { employee: true } });
      const reviewer = await tx.usuario.findUniqueOrThrow({ where: { id: reviewerId }, include: { perfil: true } });
      if (!requester.ativo || !requester.employee?.isActive || !reviewer.ativo || !reviewer.firebaseUid || reviewer.nome !== "Admin Teste") throw new Error("Operadores autorizados indisponíveis; nenhuma substituição por outro login.");
      const permissions = JSON.parse(reviewer.perfil.permissoes) as { modules?: Record<string, { blocked?: boolean; create?: boolean; update?: boolean }> };
      if (["COMPRAS", "PATRIMONIO"].some(code => !permissions.modules?.[code]?.update || permissions.modules[code].blocked)) throw new Error("Perfil do segundo operador não permite as aprovações solicitadas; conferir antes de conceder.");
      const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: "p0-current-exe-ug-1" } });
      if (binding.governmentEntityId !== "p0-current-exe") throw new Error("UG do Executivo divergente.");
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: binding.budgetUnitId } });
      const units = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: { in: ["p0-current-exe", "p0-current-leg"] } }, orderBy: { budgetUnitId: "asc" }, select: { budgetUnitId: true } });
      if (reviewer.employeeId && reviewer.employeeId !== reviewerEmployeeId) throw new Error("Segundo operador já vinculado a outro servidor; preservar cadastro atual.");
      if (requester.employee!.departmentId && requester.employee!.departmentId !== departmentId) throw new Error("Solicitante já lotado em outro setor; preservar a lotação atual.");
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_PROCUREMENT_ACTORS", entityId: key } });
      if (apply && !prior) {
        await tx.department.create({ data: { id: departmentId, name: "Departamento de Suprimentos e Almoxarifado", secretariatId: unit.secretariatId } });
        await tx.employee.create({ data: { id: reviewerEmployeeId, name: "Responsável pela Aprovação de Suprimentos", secretariatId: unit.secretariatId, departmentId } });
        await tx.employee.create({ data: { id: receiverEmployeeId, name: "Rafael Moreira — Almoxarife", secretariatId: unit.secretariatId, departmentId } });
        await tx.employee.update({ where: { id: requester.employeeId! }, data: { departmentId } });
        await tx.usuario.update({ where: { id: reviewer.id }, data: { employeeId: reviewerEmployeeId } });
        for (const scopedUnit of units) await tx.usuarioUnidadeGestora.upsert({ where: { usuarioId_budgetUnitId: { usuarioId: reviewer.id, budgetUnitId: scopedUnit.budgetUnitId } }, update: {}, create: { usuarioId: reviewer.id, budgetUnitId: scopedUnit.budgetUnitId } });
        await tx.financialAuditLog.create({ data: { action: "PREPARE_PROCUREMENT_ACTORS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: requester.id, payload: { decision, requesterId: requester.id, reviewerId: reviewer.id, reviewerEmployeeId, receiverEmployeeId, departmentId, previousRequesterDepartmentId: requester.employee!.departmentId, previousReviewerEmployeeId: reviewer.employeeId, profileId: reviewer.perfilId, budgetUnitIds: units.map(item => item.budgetUnitId), authenticationCredentialsChanged: false } } });
      }
      if (prior && ((prior.payload as Prisma.JsonObject).reviewerId !== reviewer.id || reviewer.employeeId !== reviewerEmployeeId || requester.employee!.departmentId !== departmentId)) throw new Error("Preparação anterior foi alterada; preserve e confira pela interface.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), requesterId: requester.id, reviewerId: reviewer.id, reviewerEmail: reviewer.email, reviewerEmployeeId, receiverEmployeeId, departmentId, allowedBudgetUnits: units.length, decision };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação de operadores."); process.exitCode = 1; });
