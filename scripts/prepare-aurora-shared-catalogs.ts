import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { writeAuditEvent, auditEventTypes } from "../src/lib/platform/audit-evidence";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-shared-catalogs-2026-v1";
const decision = "Cadastros exemplificativos autorizados para as jornadas municipais: catálogo compartilhado Compras/Almoxarifado e rede inicial de Saúde. Pessoas reutilizadas da massa fictícia documentada; CNES, CNS, conselho profissional, procedimentos SUS e saldos não presumidos.";
const materials = [
  { code: "AUR-EXP-001", name: "Papel sulfite A4 75 g/m²", unit: "RESMA", category: "Material de expediente", estimatedValue: 28.5 },
  { code: "AUR-EXP-002", name: "Caneta esferográfica azul", unit: "UN", category: "Material de expediente", estimatedValue: 2.5 },
  { code: "AUR-OBR-001", name: "Cimento Portland CP II 50 kg", unit: "SC", category: "Material de construção", estimatedValue: 38 },
];
const unitId = `${key}:ubs`;
const specialtyId = `${key}:specialty`;
const professionalId = `${key}:professional`;
const employeeId = `${key}:employee`;
const teamId = `${key}:team`;
const configurationHash = createHash("sha256").update(JSON.stringify({ key, decision, materials, unitId, specialtyId, professionalId, employeeId, teamId, patientPeople: [1, 2, 3] })).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, select: { id: true, ativo: true } });
      if (!actor.ativo) throw new Error("Administrador autorizado inativo.");
      const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: "p0-current-exe-ug-1" } });
      if (binding.governmentEntityId !== "p0-current-exe") throw new Error("Vínculo do Executivo divergente.");
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: binding.budgetUnitId }, select: { secretariatId: true } });
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_SHARED_CATALOGS", entityId: key } });
      if (prior && (prior.payload as Prisma.JsonObject).configurationHash !== configurationHash) throw new Error("Preparação anterior divergente.");
      const people = await tx.person.findMany({ where: { id: { in: [1, 2, 3].map(number => `p1-poc-person-${number}`) }, status: "Ativo" }, select: { id: true } });
      if (people.length !== 3) throw new Error("Identidades fictícias documentadas indisponíveis.");
      for (const person of people) {
        const patient = await tx.patient.findUnique({ where: { personId: person.id } });
        if (patient && patient.id !== `${key}:patient:${person.id}`) throw new Error("Pessoa já vinculada a outro paciente; preservar cadastro existente.");
      }
      for (const material of materials) {
        const existing = await tx.material.findUnique({ where: { code: material.code } });
        const catalog = await tx.catalogItem.findUnique({ where: { code: material.code } });
        if ((existing && existing.id !== `${key}:material:${material.code}`) || (catalog && catalog.id !== `${key}:catalog:${material.code}`)) throw new Error("Código de material preexistente; conciliar antes de preparar.");
      }
      if (apply && !prior) {
        for (const [index, category] of [...new Set(materials.map(material => material.category))].entries()) {
          await tx.materialCategory.create({ data: { id: `${key}:category:${index}`, code: `AUR-CAT-${index + 1}`, name: category } });
          for (const material of materials.filter(material => material.category === category)) {
            const catalogId = `${key}:catalog:${material.code}`;
            await tx.catalogItem.create({ data: { id: catalogId, ...material, description: material.name, specification: material.name, productKind: "MATERIAL" } });
            await tx.material.create({ data: { id: `${key}:material:${material.code}`, code: material.code, name: material.name, description: material.name, unitOfMeasure: material.unit, categoryId: `${key}:category:${index}`, catalogItemId: catalogId, minStock: 0, maxStock: 0 } });
          }
        }
        await tx.healthUnit.create({ data: { id: unitId, name: "Unidade Básica de Saúde Central — Aurora das Veredas", type: "UBS" } });
        await tx.healthSpecialty.create({ data: { id: specialtyId, code: "AUR-ENFERMAGEM", name: "Enfermagem" } });
        await tx.healthTeam.create({ data: { id: teamId, name: "Equipe de Atenção Primária Central", code: "AUR-APS-001", unitId } });
        await tx.employee.create({ data: { id: employeeId, name: "Helena Duarte", secretariatId: unit.secretariatId, isActive: true } });
        await tx.healthProfessional.create({ data: { id: professionalId, employeeId, unitId, teamId, specialty: "Enfermagem", consultationIntervalMinutes: 30 } });
        await tx.healthUnitSpecialty.create({ data: { unitId, specialtyId } });
        await tx.healthProfessionalAssignment.create({ data: { professionalId, unitId, specialtyId, weeklyHours: 40 } });
        for (const person of people) await tx.patient.create({ data: { id: `${key}:patient:${person.id}`, personId: person.id, referenceUnitId: unitId, teamId } });
        for (let weekday = 1; weekday <= 5; weekday++) await tx.healthCareSchedule.create({ data: { id: `${key}:schedule:${weekday}`, kind: "FIXO", unitId, specialtyId, professionalId, weekday, startTime: "08:00", endTime: "12:00", totalSlots: 8, createdByUsuarioId: actor.id } });
        await tx.financialAuditLog.create({ data: { action: "PREPARE_SHARED_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { decision, configurationHash, parameterOrigin: "OWNER_ESTIMATE", materials: materials.map(material => material.code), unitId, professionalId, patientPersonIds: people.map(person => person.id), medicalActsCreated: false, stockBalancesCreated: false } } });
        await writeAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "MUNICIPAL_SHARED_CATALOGS", targetId: key });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash, materials: materials.map(material => material.code), unitId, professionalId, patientPersonIds: people.map(person => person.id), decision };
    }, { timeout: 60000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação cadastral."); process.exitCode = 1; });
