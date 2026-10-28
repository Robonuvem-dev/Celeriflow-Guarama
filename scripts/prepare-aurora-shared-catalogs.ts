import { config } from "dotenv";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { insertToolRows, openCrossDomainDatabase, queryRows } from "./lib/cross-domain-database";

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
  const connection = openCrossDomainDatabase(2_000);
  try {
    console.log(JSON.stringify(await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const [actor] = await queryRows<{ id: string; ativo: boolean }>(tx, sql`SELECT id,ativo FROM "Usuario" WHERE email='admin@email.com'`);
      if (!actor?.ativo) throw new Error("Administrador autorizado inativo.");
      const [binding] = await queryRows<{ budgetUnitId: string; governmentEntityId: string }>(tx, sql`SELECT "budgetUnitId","governmentEntityId" FROM "PlanningEntityUnit" WHERE "budgetUnitId"='p0-current-exe-ug-1'`);
      if (binding?.governmentEntityId !== "p0-current-exe") throw new Error("Vínculo do Executivo divergente.");
      const [unit] = await queryRows<{ secretariatId: string }>(tx, sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${binding.budgetUnitId}`);
      if (!unit) throw new Error("Unidade gestora indisponível.");
      const [prior] = await queryRows<{ payload: Record<string, unknown> }>(tx, sql`SELECT payload FROM "FinancialAuditLog" WHERE action='PREPARE_SHARED_CATALOGS' AND "entityId"=${key} LIMIT 1`);
      if (prior && prior.payload.configurationHash !== configurationHash) throw new Error("Preparação anterior divergente.");
      const people = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "Person" WHERE id=ANY(${sql.param([1, 2, 3].map(number => `p1-poc-person-${number}`))}::text[]) AND status='Ativo'`);
      if (people.length !== 3) throw new Error("Identidades fictícias documentadas indisponíveis.");
      for (const person of people) {
        const [patient] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "Patient" WHERE "personId"=${person.id}`);
        if (patient && patient.id !== `${key}:patient:${person.id}`) throw new Error("Pessoa já vinculada a outro paciente; preservar cadastro existente.");
      }
      for (const material of materials) {
        const [existing] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "Material" WHERE code=${material.code}`);
        const [catalog] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "CatalogItem" WHERE code=${material.code}`);
        if ((existing && existing.id !== `${key}:material:${material.code}`) || (catalog && catalog.id !== `${key}:catalog:${material.code}`)) throw new Error("Código de material preexistente; conciliar antes de preparar.");
      }
      if (apply && !prior) {
        for (const [index, category] of [...new Set(materials.map(material => material.category))].entries()) {
          await insertToolRows(tx, "MaterialCategory", { id: `${key}:category:${index}`, code: `AUR-CAT-${index + 1}`, name: category });
          for (const material of materials.filter(material => material.category === category)) {
            const catalogId = `${key}:catalog:${material.code}`;
            await insertToolRows(tx, "CatalogItem", { id: catalogId, ...material, description: material.name, specification: material.name, productKind: "MATERIAL" });
            await insertToolRows(tx, "Material", { id: `${key}:material:${material.code}`, code: material.code, name: material.name, description: material.name, unitOfMeasure: material.unit, categoryId: `${key}:category:${index}`, catalogItemId: catalogId, minStock: 0, maxStock: 0 });
          }
        }
        await insertToolRows(tx, "HealthUnit", { id: unitId, name: "Unidade Básica de Saúde Central — Aurora das Veredas", type: "UBS" });
        await insertToolRows(tx, "HealthSpecialty", { id: specialtyId, code: "AUR-ENFERMAGEM", name: "Enfermagem" });
        await insertToolRows(tx, "HealthTeam", { id: teamId, name: "Equipe de Atenção Primária Central", code: "AUR-APS-001", unitId });
        await insertToolRows(tx, "Employee", { id: employeeId, name: "Helena Duarte", secretariatId: unit.secretariatId, isActive: true });
        await insertToolRows(tx, "HealthProfessional", { id: professionalId, employeeId, unitId, teamId, specialty: "Enfermagem", consultationIntervalMinutes: 30 });
        await insertToolRows(tx, "HealthUnitSpecialty", { unitId, specialtyId });
        await insertToolRows(tx, "HealthProfessionalAssignment", { professionalId, unitId, specialtyId, weeklyHours: 40 });
        for (const person of people) await insertToolRows(tx, "Patient", { id: `${key}:patient:${person.id}`, personId: person.id, referenceUnitId: unitId, teamId });
        for (let weekday = 1; weekday <= 5; weekday++) await insertToolRows(tx, "HealthCareSchedule", { id: `${key}:schedule:${weekday}`, kind: "FIXO", unitId, specialtyId, professionalId, weekday, startTime: "08:00", endTime: "12:00", totalSlots: 8, createdByUsuarioId: actor.id });
        await insertToolRows(tx, "FinancialAuditLog", { action: "PREPARE_SHARED_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { decision, configurationHash, parameterOrigin: "OWNER_ESTIMATE", materials: materials.map(material => material.code), unitId, professionalId, patientPersonIds: people.map(person => person.id), medicalActsCreated: false, stockBalancesCreated: false } });
        await insertAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "MUNICIPAL_SHARED_CATALOGS", targetId: key });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash, materials: materials.map(material => material.code), unitId, professionalId, patientPersonIds: people.map(person => person.id), decision };
    }, { timeoutMs: 60000, lockTimeoutMs: 60000 }), null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação cadastral."); process.exitCode = 1; });
