import "./helpers/laboratory-test-environment";
import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, inArray } from "drizzle-orm";
import * as d from "../src/db/schema/health-diagnostics";
import { auditEvents } from "../src/db/schema/audit";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { healthProfessionals } from "../src/db/schema/health-workforce";
import { materialMovements, materialStocks } from "../src/db/schema/assets-stock";
import { addSpecializedPlanEntry, createSpecializedPlan, distributeSpecializedMaterial, saveSpecializedCatalogItem, saveSpecializedQuota, saveSpecializedSchedule } from "../src/lib/saude/specialized-care-service";
import { createLaboratoryDrizzleFixture, isDiagnosticInjectedFailure, laboratoryTestContext } from "./helpers/laboratory-drizzle-fixture";

test("Specialized care · real team/clinical eligibility, Float contracts and same-tx stock/audit", async suite => {
  const f = await createLaboratoryDrizzleFixture(), { db, connection, context, restricted } = f;
  const planInput = { patientId: "dx-patient", unitId: "dx-u1", teamId: "dx-team", initialMedicalRecordId: "dx-record", goals: "Metas terapêuticas", carePlan: "Plano multidisciplinar", plannedConsultations: 4 };
  const distribution = { warehouseId: "dx-warehouse", materialId: "dx-material", batchNumber: "DX-BATCH", quantity: 0.125 };
  const month = new Date().toISOString().slice(0, 7);
  const readStock = async () => (await db.select().from(materialStocks).where(eq(materialStocks.id, "dx-stock")))[0];
  const readQuota = async (id: string) => (await db.select().from(d.diagnosticSpecializedQuotas).where(eq(d.diagnosticSpecializedQuotas.id, id)))[0];
  try {
    assert.equal(f.migrations, 156);
    await suite.test("catalog and schedules upsert stable IDs without turning Float reference values into Decimal", async () => {
      const input = { category: " órtese ", code: " dx-01 ", name: "Material assistencial", referenceValue: 0.125, materialId: "dx-material" };
      const item = await saveSpecializedCatalogItem(context, input, connection);
      await db.update(d.diagnosticSpecializedCatalog).set({ isActive: false }).where(eq(d.diagnosticSpecializedCatalog.id, item.id));
      const again = await saveSpecializedCatalogItem(context, { ...input, name: "Material atualizado", referenceValue: undefined }, connection);
      assert.deepEqual(again, item);
      const [saved] = await db.select().from(d.diagnosticSpecializedCatalog).where(eq(d.diagnosticSpecializedCatalog.id, item.id));
      assert.equal(saved.category, "ÓRTESE"); assert.equal(saved.code, "DX-01"); assert.equal(saved.referenceValue, 0.125); assert.equal(saved.isActive, true);
      const schedule = { teamId: "dx-team", unitId: "dx-u1", month, patientCapacity: 99 };
      const first = await saveSpecializedSchedule(restricted, schedule, connection);
      assert.deepEqual(await saveSpecializedSchedule(context, { ...schedule, patientCapacity: 100 }, connection), first);
      await assert.rejects(saveSpecializedSchedule(restricted, { ...schedule, unitId: "dx-u2" }, connection), /acesso/i);
      await assert.rejects(saveSpecializedSchedule(context, { ...schedule, teamId: "dx-other-team" }, connection), /Equipe ativa/);
    });

    await suite.test("plan requires active patient, same unit/team, own professional and matching clinical record", async () => {
      await assert.rejects(createSpecializedPlan(laboratoryTestContext({ employeeId: null }), planInput, connection), /profissional/);
      await assert.rejects(createSpecializedPlan(laboratoryTestContext({ employeeId: "dx-other-employee" }), planInput, connection), /equipe/);
      await assert.rejects(createSpecializedPlan(restricted, { ...planInput, unitId: "dx-u2" }, connection), /acesso/i);
      await assert.rejects(createSpecializedPlan(context, { ...planInput, initialMedicalRecordId: "dx-wrong-record" }, connection), /prontuário/);
      await f.database.exec(`UPDATE "Patient" SET status='Inativo' WHERE id='dx-patient';`);
      try { await assert.rejects(createSpecializedPlan(context, planInput, connection), /Paciente/); }
      finally { await f.database.exec(`UPDATE "Patient" SET status='Ativo' WHERE id='dx-patient';`); }
      const plan = await createSpecializedPlan(restricted, planInput, connection);
      assert.equal(plan.status, "ACTIVE");
      const [stored] = await db.select().from(d.diagnosticSpecializedPlans).where(eq(d.diagnosticSpecializedPlans.id, plan.id));
      assert.equal(stored.createdByUsuarioId, context.user.id); assert.ok(stored.startedAt instanceof Date);
    });

    await suite.test("monthly capacity excludes cancellation and concurrent admissions cannot overbook", async () => {
      await db.update(d.diagnosticSpecializedPlans).set({ status: "CANCELLED" });
      await saveSpecializedSchedule(context, { teamId: "dx-team", unitId: "dx-u1", month, patientCapacity: 1 }, connection);
      const race = await Promise.allSettled([createSpecializedPlan(context, planInput, connection), createSpecializedPlan(context, planInput, connection)]);
      assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
      const failed = race.find(row => row.status === "rejected");
      assert.ok(failed?.status === "rejected" && /capacidade/.test(String(failed.reason)));
      await saveSpecializedSchedule(context, { teamId: "dx-team", unitId: "dx-u1", month, patientCapacity: 100 }, connection);
    });

    await suite.test("entry keeps author, specialty/service and patient record; evolution counter rolls back with failed insert", async () => {
      const plan = await createSpecializedPlan(context, planInput, connection);
      const input = { planId: plan.id, kind: "EVOLUTION", content: "Evolução multiprofissional", medicalRecordId: "dx-record", weight: 70.125, height: 1.75 };
      await assert.rejects(addSpecializedPlanEntry(context, { ...input, medicalRecordId: "dx-wrong-record" }, connection), /prontuário/);
      await assert.rejects(addSpecializedPlanEntry(context, { ...input, specialtyId: "missing-specialty" }, connection), /Especialidade/);
      await assert.rejects(addSpecializedPlanEntry(context, { ...input, healthServiceId: "missing-service" }, connection), /serviço/);
      await db.update(healthProfessionals).set({ isActive: false }).where(eq(healthProfessionals.id, "dx-professional"));
      try { await assert.rejects(addSpecializedPlanEntry(context, input, connection), /equipe/); }
      finally { await db.update(healthProfessionals).set({ isActive: true }).where(eq(healthProfessionals.id, "dx-professional")); }
      await f.database.exec(`CREATE TRIGGER dx_fail_plan_counter BEFORE UPDATE ON "SpecializedTherapeuticPlan" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(addSpecializedPlanEntry(context, input, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_plan_counter ON "SpecializedTherapeuticPlan";`); }
      assert.equal((await db.select().from(d.diagnosticSpecializedEntries).where(eq(d.diagnosticSpecializedEntries.planId, plan.id))).length, 0);
      await Promise.all([addSpecializedPlanEntry(restricted, input, connection), addSpecializedPlanEntry(context, { ...input, kind: "OPINION" }, connection)]);
      const entries = await db.select().from(d.diagnosticSpecializedEntries).where(eq(d.diagnosticSpecializedEntries.planId, plan.id));
      assert.equal(entries.length, 2); assert.ok(entries.every(row => row.professionalId === "dx-professional"));
      const evolution = entries.find(row => row.kind === "EVOLUTION");
      assert.equal(evolution?.bmi, Number((70.125 / 1.75 ** 2).toFixed(2))); assert.equal(evolution?.weight, 70.125);
      assert.equal((await db.select().from(d.diagnosticSpecializedPlans).where(eq(d.diagnosticSpecializedPlans.id, plan.id)))[0].completedConsultations, 1);
      await db.update(d.diagnosticSpecializedPlans).set({ status: "CANCELLED" }).where(eq(d.diagnosticSpecializedPlans.id, plan.id));
      await assert.rejects(addSpecializedPlanEntry(context, input, connection), /ativo/);
    });

    await suite.test("quota uses patient unit and Float values; failed distribution rolls back stock, counter, movement and audit", async () => {
      await assert.rejects(saveSpecializedQuota(restricted, { patientId: "dx-patient2", materialId: "dx-material", period: month, allowedQuantity: 2 }, connection), /acesso/i);
      const quotaInput = { patientId: "dx-patient", materialId: "dx-material", period: month, allowedQuantity: 5.125 };
      const quota = await saveSpecializedQuota(restricted, quotaInput, connection);
      assert.deepEqual(await saveSpecializedQuota(context, quotaInput, connection), quota);
      const plan = await createSpecializedPlan(context, planInput, connection);
      const input = { ...distribution, planId: plan.id, quotaId: quota.id };
      const stockBefore = await readStock(), movementBefore = (await db.select({ total: count() }).from(materialMovements))[0].total, auditBefore = (await db.select({ total: count() }).from(auditEvents))[0].total;
      await f.database.exec(`CREATE TRIGGER dx_fail_distribution BEFORE INSERT ON "SpecializedDistribution" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(distributeSpecializedMaterial(context, input, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_distribution ON "SpecializedDistribution";`); }
      assert.deepEqual(await readStock(), stockBefore);
      assert.equal((await readQuota(quota.id)).consumedQuantity, 0);
      assert.equal((await db.select({ total: count() }).from(materialMovements))[0].total, movementBefore);
      assert.equal((await db.select({ total: count() }).from(auditEvents))[0].total, auditBefore);
      const result = await distributeSpecializedMaterial(restricted, input, connection);
      const [delivered] = await db.select().from(d.diagnosticSpecializedDistributions).where(eq(d.diagnosticSpecializedDistributions.id, result.id));
      const [movement] = await db.select().from(materialMovements).where(eq(materialMovements.id, delivered.movementId));
      assert.equal(delivered.stockId, "dx-stock"); assert.equal(delivered.quantity, 0.125); assert.equal(delivered.referenceValue, 2.125);
      assert.equal(delivered.patientId, "dx-patient"); assert.equal(delivered.deliveredByUsuarioId, context.user.id); assert.ok(delivered.deliveredAt instanceof Date);
      assert.equal(movement.reason, `DISTRIBUICAO_PLANO:${plan.id}`); assert.equal(movement.actorUsuarioId, context.user.id);
      assert.equal(movement.quantityDecimal?.toFixed(6), "0.125000"); assert.equal((await readStock()).quantity, stockBefore.quantity - 0.125);
      assert.equal((await readQuota(quota.id)).consumedQuantity, 0.125);
      assert.equal((await db.select({ total: count() }).from(auditEvents).where(eq(auditEvents.targetId, movement.id)))[0].total, 1);
      const [stockAudit] = await db.select().from(auditEvents).where(eq(auditEvents.targetId, movement.id));
      assert.equal(stockAudit.eventType, auditEventTypes.administrativeMutation); assert.equal(stockAudit.targetType, "MATERIAL_MOVEMENT"); assert.equal(stockAudit.actorUsuarioId, context.user.id);
      const entryCount = (await db.select({ total: count() }).from(materialMovements))[0].total;
      const stockBeforeAuditFailure = await readStock(), distributionsBeforeAuditFailure = await db.select().from(d.diagnosticSpecializedDistributions).where(eq(d.diagnosticSpecializedDistributions.planId, plan.id)), auditBeforeFailure = (await db.select({ total: count() }).from(auditEvents))[0].total;
      await f.database.exec(`CREATE TRIGGER dx_fail_stock_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(distributeSpecializedMaterial(context, input, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_stock_audit ON "AuditEvent";`); }
      assert.equal((await readQuota(quota.id)).consumedQuantity, 0.125);
      assert.equal((await db.select({ total: count() }).from(materialMovements))[0].total, entryCount);
      assert.deepEqual(await readStock(), stockBeforeAuditFailure);
      assert.deepEqual(await db.select().from(d.diagnosticSpecializedDistributions).where(eq(d.diagnosticSpecializedDistributions.planId, plan.id)), distributionsBeforeAuditFailure);
      assert.equal((await db.select({ total: count() }).from(auditEvents))[0].total, auditBeforeFailure);
    });

    await suite.test("blocked, expired or foreign-unit stock and insufficient stock leave the quota untouched", async () => {
      const plan = await createSpecializedPlan(context, planInput, connection);
      const quota = await saveSpecializedQuota(context, { patientId: "dx-patient", materialId: "dx-material", period: "2099-12", allowedQuantity: 100 }, connection);
      const input = { ...distribution, planId: plan.id, quotaId: quota.id };
      await assert.rejects(distributeSpecializedMaterial(context, { ...input, warehouseId: "dx-other-warehouse" }, connection), /Lote indisponível/);
      await db.update(materialStocks).set({ blockedAt: new Date() }).where(eq(materialStocks.id, "dx-stock"));
      try { await assert.rejects(distributeSpecializedMaterial(context, input, connection), /Lote indisponível/); }
      finally { await db.update(materialStocks).set({ blockedAt: null }).where(eq(materialStocks.id, "dx-stock")); }
      await db.update(materialStocks).set({ expirationDate: new Date("2000-01-01") }).where(eq(materialStocks.id, "dx-stock"));
      try { await assert.rejects(distributeSpecializedMaterial(context, input, connection), /Lote indisponível/); }
      finally { await db.update(materialStocks).set({ expirationDate: new Date("2099-12-31") }).where(eq(materialStocks.id, "dx-stock")); }
      await assert.rejects(distributeSpecializedMaterial(context, { ...input, quantity: 99 }, connection), /Estoque insuficiente/);
      assert.equal((await readQuota(quota.id)).consumedQuantity, 0);
      const otherQuota = await saveSpecializedQuota(context, { patientId: "dx-patient2", materialId: "dx-material", period: month, allowedQuantity: 100 }, connection);
      await assert.rejects(distributeSpecializedMaterial(context, { ...input, quotaId: otherQuota.id }, connection), /cota/);
    });

    await suite.test("two plans competing for one patient quota cannot overconsume or duplicate stock issuance", async () => {
      const plans = await Promise.all([createSpecializedPlan(context, planInput, connection), createSpecializedPlan(context, planInput, connection)]);
      const quota = await saveSpecializedQuota(context, { patientId: "dx-patient", materialId: "dx-material", period: "2099-11", allowedQuantity: 1 }, connection);
      const before = await readStock();
      const race = await Promise.allSettled(plans.map(plan => distributeSpecializedMaterial(context, { ...distribution, quantity: 0.75, planId: plan.id, quotaId: quota.id }, connection)));
      assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
      assert.equal((await readQuota(quota.id)).consumedQuantity, 0.75);
      assert.equal((await readStock()).quantity, before.quantity - 0.75);
      const deliveries = await db.select().from(d.diagnosticSpecializedDistributions).where(and(eq(d.diagnosticSpecializedDistributions.quotaId, quota.id), inArray(d.diagnosticSpecializedDistributions.planId, plans.map(plan => plan.id))));
      assert.equal(deliveries.length, 1);
    });
  } finally { await f.close(); }
});
