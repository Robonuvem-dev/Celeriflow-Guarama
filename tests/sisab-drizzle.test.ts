import "./helpers/laboratory-test-environment";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { healthEsusForms } from "../src/db/schema/health-territory";
import { diagnosticEsusBatches, diagnosticEsusBatchItems } from "../src/db/schema/health-diagnostics";
import { createBatch, processBatch } from "../src/lib/saude/sisab-service";
import { createLaboratoryDrizzleFixture, isDiagnosticInjectedFailure } from "./helpers/laboratory-drizzle-fixture";

test("SISAB · original frozen batch/hash, full local return, reprocessing and atomic rollback", async suite => {
  const f = await createLaboratoryDrizzleFixture(), { db, connection, context, restricted } = f;
  const newForm = async (values: Partial<typeof healthEsusForms.$inferInsert> = {}) => (await db.insert(healthEsusForms).values({ kind: "INDIVIDUAL", period: "2026-10", status: "FINALIZADA", unitId: "dx-u1", professionalId: "dx-professional", patientId: "dx-patient", payload: { turno: "Manhã", desfecho: "Retorno" }, idempotencyKey: randomUUID(), createdByUsuarioId: context.user.id, ...values }).returning())[0];
  const readBatch = async (id: string) => (await db.select().from(diagnosticEsusBatches).where(eq(diagnosticEsusBatches.id, id)))[0];
  try {
    await suite.test("generation excludes drafts/other competences, checks all units and freezes exact file bytes/hash/membership", async () => {
      const first = await newForm({ period: "2026-01" }), second = await newForm({ period: "2026-01", kind: "OUTRO", patientId: null, personId: "dx-person", payload: {} });
      await newForm({ period: "2026-01", status: "RASCUNHO" });
      await newForm({ period: "2026-02" });
      const foreign = await newForm({ period: "2026-01", unitId: "dx-u2" });
      const before = (await db.select({ total: count() }).from(diagnosticEsusBatches))[0].total;
      await assert.rejects(createBatch(restricted, "2026-01", connection), /acesso/i);
      assert.equal((await db.select({ total: count() }).from(diagnosticEsusBatches))[0].total, before);
      await db.update(healthEsusForms).set({ status: "RASCUNHO" }).where(eq(healthEsusForms.id, foreign.id));
      const batch = await createBatch(restricted, "2026-01", connection), stored = await readBatch(batch.id);
      assert.equal(stored.total, 2); assert.equal(stored.status, "GERADO"); assert.equal(stored.accepted, 0); assert.equal(stored.rejected, 0);
      assert.equal(stored.hash, createHash("sha256").update(stored.fileContent).digest("hex"));
      // Legacy header retains AAAA-MM; only the ESUS records compact to AAAAMM.
      assert.match(stored.fileContent, /^#SISAB\|COMPETENCIA:2026-01\|FICHAS:2\|GERADO_EM:/);
      assert.ok(stored.fileContent.includes(`ESUS|202601|INDIVIDUAL|dx-u1|dx-professional|dx-patient|${first.id}`));
      assert.ok(stored.fileContent.includes(`ESUS|202601|OUTRO|dx-u1|dx-professional|dx-person|${second.id}`));
      assert.ok(stored.createdAt instanceof Date); assert.equal(stored.createdByUsuarioId, context.user.id);
      const items = await db.select().from(diagnosticEsusBatchItems).where(eq(diagnosticEsusBatchItems.batchId, batch.id));
      assert.deepEqual(items.map(item => item.formId).sort(), [first.id, second.id].sort()); assert.ok(items.every(item => item.status === "PENDENTE"));
      await newForm({ period: "2026-01" });
      assert.deepEqual(await processBatch(restricted, batch.id, connection), { id: batch.id, status: "ACEITO", accepted: 2, rejected: 0 });
      const processed = await readBatch(batch.id);
      assert.equal(processed.fileContent, stored.fileContent); assert.equal(processed.hash, stored.hash); assert.equal(processed.total, 2);
      assert.ok(processed.processedAt instanceof Date); assert.deepEqual(processed.errors, []);
    });

    await suite.test("failed item creation rolls back the batch and every pending item", async () => {
      await newForm({ period: "2026-03" });
      const before = (await db.select({ total: count() }).from(diagnosticEsusBatches))[0].total;
      await f.database.exec(`CREATE TRIGGER dx_fail_batch_item BEFORE INSERT ON "HealthEsusBatchItem" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(createBatch(context, "2026-03", connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_batch_item ON "HealthEsusBatchItem";`); }
      assert.equal((await db.select({ total: count() }).from(diagnosticEsusBatches))[0].total, before);
      assert.equal((await db.select().from(diagnosticEsusBatches).where(eq(diagnosticEsusBatches.competence, "2026-03"))).length, 0);
    });

    await suite.test("local acceptance/rejection contains original field errors and reprocessing accepts corrected source without rewriting the file", async () => {
      await newForm({ period: "2026-04" });
      const missingCitizen = await newForm({ period: "2026-04", patientId: null });
      const missingProfessional = await newForm({ period: "2026-04", professionalId: null });
      const unknown = await newForm({ period: "2026-04", kind: "UNKNOWN" });
      const missingField = await newForm({ period: "2026-04", payload: {} });
      const batch = await createBatch(context, "2026-04", connection), frozen = await readBatch(batch.id);
      assert.deepEqual(await processBatch(context, batch.id, connection), { id: batch.id, status: "PARCIAL", accepted: 1, rejected: 4 });
      const rejected = await readBatch(batch.id);
      assert.deepEqual(new Set((rejected.errors as { formId: string; reason: string }[]).map(row => row.reason)), new Set(["Ficha sem cidadão vinculado.", "Profissional ausente.", "Tipo de ficha desconhecido: UNKNOWN.", "Campo obrigatório da ficha: Turno."]));
      const errorItems = await db.select().from(diagnosticEsusBatchItems).where(and(eq(diagnosticEsusBatchItems.batchId, batch.id), eq(diagnosticEsusBatchItems.status, "REJEITADO")));
      assert.equal(errorItems.length, 4); assert.ok(errorItems.every(item => item.message));
      await db.update(healthEsusForms).set({ patientId: "dx-patient" }).where(eq(healthEsusForms.id, missingCitizen.id));
      await db.update(healthEsusForms).set({ professionalId: "dx-professional" }).where(eq(healthEsusForms.id, missingProfessional.id));
      await db.update(healthEsusForms).set({ kind: "OUTRO" }).where(eq(healthEsusForms.id, unknown.id));
      await db.update(healthEsusForms).set({ payload: { turno: "Tarde", desfecho: "Alta" } }).where(eq(healthEsusForms.id, missingField.id));
      assert.deepEqual(await processBatch(context, batch.id, connection), { id: batch.id, status: "ACEITO", accepted: 5, rejected: 0 });
      const accepted = await readBatch(batch.id);
      assert.equal(accepted.fileContent, frozen.fileContent); assert.equal(accepted.hash, frozen.hash); assert.deepEqual(accepted.errors, []);
      assert.ok((await db.select().from(diagnosticEsusBatchItems).where(eq(diagnosticEsusBatchItems.batchId, batch.id))).every(item => item.status === "ACEITO" && item.message === null));
    });

    await suite.test("all-rejected return, domiciliary/team requirements and numeric/options consistency remain intact", async () => {
      await newForm({ period: "2026-05", unitId: null });
      await newForm({ period: "2026-05", kind: "DOMICILIAR", patientId: null });
      await newForm({ period: "2026-05", kind: "ATIVIDADE_COLETIVA", teamId: null });
      await newForm({ period: "2026-05", payload: { turno: "Manhã", desfecho: "Alta", peso: "inválido" } });
      await newForm({ period: "2026-05", payload: { turno: "Inválido", desfecho: "Alta" } });
      const batch = await createBatch(context, "2026-05", connection);
      assert.deepEqual(await processBatch(context, batch.id, connection), { id: batch.id, status: "REJEITADO", accepted: 0, rejected: 5 });
      const stored = await readBatch(batch.id);
      assert.deepEqual(new Set((stored.errors as { reason: string }[]).map(item => item.reason)), new Set(["Unidade ausente.", "Ficha domiciliar sem domicílio/família.", "Atividade coletiva sem equipe.", "Campo numérico inválido: Peso (kg).", "Opção inválida em Turno."]));
    });

    await suite.test("processing validates unit access and item/final-return failures restore all prior states", async () => {
      const form = await newForm({ period: "2026-06" });
      const batch = await createBatch(context, "2026-06", connection), before = await readBatch(batch.id);
      await db.update(healthEsusForms).set({ unitId: "dx-u2" }).where(eq(healthEsusForms.id, form.id));
      await assert.rejects(processBatch(restricted, batch.id, connection), /acesso/i);
      assert.deepEqual(await readBatch(batch.id), before);
      await db.update(healthEsusForms).set({ unitId: "dx-u1" }).where(eq(healthEsusForms.id, form.id));
      const originalItems = await db.select().from(diagnosticEsusBatchItems).where(eq(diagnosticEsusBatchItems.batchId, batch.id));
      await f.database.exec(`CREATE TRIGGER dx_fail_processing_item BEFORE UPDATE ON "HealthEsusBatchItem" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(processBatch(context, batch.id, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_processing_item ON "HealthEsusBatchItem";`); }
      assert.deepEqual(await readBatch(batch.id), before);
      assert.deepEqual(await db.select().from(diagnosticEsusBatchItems).where(eq(diagnosticEsusBatchItems.batchId, batch.id)), originalItems);
      await f.database.exec(`CREATE TRIGGER dx_fail_processing_return BEFORE UPDATE ON "HealthEsusBatch" FOR EACH ROW WHEN (NEW.status <> 'PROCESSANDO') EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(processBatch(context, batch.id, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_processing_return ON "HealthEsusBatch";`); }
      assert.deepEqual(await readBatch(batch.id), before);
      assert.deepEqual(await db.select().from(diagnosticEsusBatchItems).where(eq(diagnosticEsusBatchItems.batchId, batch.id)), originalItems);
      const race = await Promise.all([processBatch(context, batch.id, connection), processBatch(context, batch.id, connection)]);
      assert.deepEqual(race[0], race[1]); assert.equal(race[0].accepted, 1); assert.equal(race[0].rejected, 0);
    });

    await suite.test("missing/empty competence and invalid format preserve public errors", async () => {
      await assert.rejects(createBatch(context, "2026/01", connection), /AAAA-MM/);
      await assert.rejects(createBatch(context, "1900-01", connection), /Não há fichas/);
      await assert.rejects(processBatch(context, "missing-batch", connection), /Lote não encontrado/);
    });
  } finally { await f.close(); }
});
