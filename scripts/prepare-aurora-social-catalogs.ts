import { config } from "dotenv";
import { writeAuditEvent, auditEventTypes } from "../src/lib/platform/audit-evidence";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-social-catalogs-2026-v1";
const decision = "Estrutura socioassistencial exemplificativa autorizada: CRAS, profissional e três famílias unipessoais com pessoas fictícias previamente documentadas. Sem NIS, renda, vulnerabilidade, benefício ou atendimento presumidos.";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, select: { id: true, ativo: true } });
      if (!actor.ativo) throw new Error("Administrador autorizado inativo.");
      const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: "p0-current-exe-ug-1" } });
      if (binding.governmentEntityId !== "p0-current-exe") throw new Error("Vínculo do Executivo divergente.");
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: binding.budgetUnitId }, select: { secretariatId: true } });
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_SOCIAL_CATALOGS", entityId: key } });
      if (!prior) {
        for (let number = 1; number <= 3; number++) {
          const personId = `p1-poc-person-${number}`;
          await tx.person.findFirstOrThrow({ where: { id: personId, status: "Ativo" }, select: { id: true } });
          if (await tx.familyMember.count({ where: { personId } }) || await tx.socialFamily.count({ where: { representativeId: personId } })) throw new Error("Pessoa já possui composição familiar; preserve e concilie o cadastro existente.");
        }
        if (apply) {
          const employeeId = `${key}:employee`;
          const unitId = `${key}:cras`;
          await tx.employee.create({ data: { id: employeeId, name: "Lúcia Monteiro", secretariatId: unit.secretariatId } });
          await tx.socialUnit.create({ data: { id: unitId, name: "CRAS Central — Aurora das Veredas", type: "CRAS", managerId: employeeId } });
          await tx.socialProfessionalLink.create({ data: { employeeId, unitId, jobTitle: "Técnica de referência", startsAt: new Date("2026-01-01"), individualScope: "UNIT", familyScope: "UNIT", includeInRma: false } });
          for (let number = 1; number <= 3; number++) {
            const personId = `p1-poc-person-${number}`;
            const familyId = `${key}:family:${number}`;
            await tx.family.create({ data: { id: familyId, responsiblePersonId: personId, members: { create: { personId, kinship: "RESPONSAVEL", isRepresentative: true } } } });
            await tx.socialFamily.create({ data: { id: `${key}:social-family:${number}`, representativeId: personId, masterFamilyId: familyId } });
          }
          await tx.financialAuditLog.create({ data: { action: "PREPARE_SOCIAL_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { decision, parameterOrigin: "OWNER_ESTIMATE", unitId, employeeId, families: 3, benefitsCreated: false, attendancesCreated: false } } });
          await writeAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "SOCIAL_CATALOGS", targetId: key });
        }
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), unitId: `${key}:cras`, families: 3, decision };
    }, { timeout: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação socioassistencial."); process.exitCode = 1; });
