import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPostgresError, PersistenceError } from "../src/db/errors";
import { auditEvents } from "../src/db/schema/audit";
import { internalNotifications } from "../src/db/schema/notifications";
import { integrationConnections, integrationRuns } from "../src/db/schema/integrations";
import { people } from "../src/db/schema/people";
import { healthWaitlists } from "../src/db/schema/health-agenda";
import { medicalRecords } from "../src/db/schema/health-care";
import { healthChronicAssessments } from "../src/db/schema/health-care-lines";
import { healthRegulationRequests } from "../src/db/schema/health-regulation";
import { healthFollowupBindings, healthFollowupReceivers, healthFollowupBatches, healthFollowupBatchItems, healthFollowupReceipts, healthFollowupRecords, healthFollowupProcessedKeys, healthFollowupResults } from "../src/db/schema/health-followup";
import { insertInternalNotifications } from "../src/db/repositories/platform/notifications";
import { assertFollowupConnection, configureHealthFollowup, configureHealthFollowupInTransaction, followupBatchForActor, followupBindingForActor, generateHealthFollowupBatches, generateHealthFollowupBatchesInTransaction } from "../src/lib/saude/followup-exchange-service";
import { processHealthFollowupBatch, processHealthFollowupBatchInTransaction } from "../src/lib/saude/followup-receiver-service";
import { collectFollowupSources, type FollowupSourceRecord } from "../src/lib/saude/followup-source-service";
import { followupHash, followupRecordKey, followupRecordSchemas, followupRecordVersion, type FollowupContractName, type FollowupRecord } from "../src/lib/saude/followup-contract";
import { createFollowupDatabase } from "./helpers/followup-database";
import { storeFollowupEvidence } from "./helpers/followup-evidence";

const evidence = (record: FollowupSourceRecord | FollowupRecord) => ({ originType: record.originType, originId: record.originId, sourceVersion: record.sourceVersion, idempotencyKey: record.idempotencyKey, payload: record });
function rekey<T extends { originType: string; originId: string }>(contract: FollowupContractName, record: T) {
  const sourceVersion = followupRecordVersion(record);
  return { ...record, sourceVersion, idempotencyKey: followupRecordKey(contract, record.originType, record.originId, sourceVersion) };
}

function isImmutableEvidenceViolation(error: unknown) {
  if (getPostgresError(error)?.code !== "P0001") return false;
  const seen = new Set<unknown>();
  let cause = error;
  while (cause instanceof Error && !seen.has(cause)) {
    if (/imutável/.test(cause.message)) return true;
    seen.add(cause); cause = cause.cause;
  }
  return false;
}

test("Followup Drizzle: origens reais, evidência, receptor, replay e transação compartilhada", { timeout: 600_000 }, async t => {
  const fixture = await createFollowupDatabase();
  const { connection, context, denied } = fixture, db = connection.db;
  const range = { unitId: "followup-unit", fromDate: "2026-10-19", toDate: "2026-10-19" };
  const generation = (bindingId: string) => ({ bindingId, requestKey: randomUUID(), fromDate: range.fromDate, toDate: range.toDate });
  const source = (contract: FollowupContractName) => collectFollowupSources(context, { ...range, contract });
  let prenatalBinding = { id: "", receiverId: "", connectionId: "" }, chronicBinding = { ...prenatalBinding }, riraBinding = { ...prenatalBinding };
  let partialBatch = "";
  try {
    await t.test("configuração preserva código reservado, ACL, locks concorrentes e conexão/receptor", async () => {
      const configuration = { unitId: "followup-unit", contract: "CELERIFLOW_SISPRENATAL", code: "FOLLOWUP_PRENATAL", name: "Acompanhamento gestacional" };
      await assert.rejects(configureHealthFollowup(denied, configuration, connection), /acesso|unidade/i);
      await assert.rejects(configureHealthFollowup(context, { ...configuration, code: "MS_RENAME" }, connection), /reservado/);
      const race = await Promise.all([configureHealthFollowup(context, configuration, connection), configureHealthFollowup(context, configuration, connection)]);
      assert.equal(race[0].id, race[1].id); prenatalBinding = race[0];
      assert.deepEqual(await configureHealthFollowup(context, { ...configuration, name: "Nome atualizado" }, connection), prenatalBinding);
      const binding = await followupBindingForActor(db, context, prenatalBinding.id);
      assert.equal(binding.receiver.name, "Nome atualizado"); assert.equal(binding.unit.name, "UBS de origem"); assert.equal(assertFollowupConnection(binding), "CELERIFLOW_SISPRENATAL"); assert.equal(binding.connection.configuration && typeof binding.connection.configuration, "object");
      await assert.rejects(configureHealthFollowup(context, { ...configuration, code: "OTHER_CODE" }, connection), /código da conexão já vinculada/);
      await assert.rejects(configureHealthFollowup(context, { ...configuration, unitId: "followup-boundary-unit" }, connection), /Código de conexão já utilizado/);
      await assert.rejects(followupBindingForActor(db, denied, prenatalBinding.id), /acesso|unidade/i);
      await assert.rejects(followupBindingForActor(db, context, "missing"), error => error instanceof PersistenceError && error.kind === "not-found");
      chronicBinding = await configureHealthFollowup(context, { ...configuration, contract: "CELERIFLOW_HIPERDIA", code: "FOLLOWUP_CHRONIC" }, connection);
      riraBinding = await configureHealthFollowup(context, { ...configuration, contract: "CELERIFLOW_RIRA", code: "FOLLOWUP_RIRA" }, connection);
    });

    await t.test("origens mantêm Float, arrays, nulls, vínculos, ISO UTC e visibilidade futura histórica", async () => {
      const prenatal = followupRecordSchemas.CELERIFLOW_SISPRENATAL.parse((await source("CELERIFLOW_SISPRENATAL"))[0]);
      assert.equal(prenatal.data.baselineWeight, 60.125); assert.equal(prenatal.data.height, 1.625); assert.equal(prenatal.data.visits[0].occurredAt, "2026-10-19T12:34:56.789Z");
      assert.equal(prenatal.data.exams[0].reviews[0].performedAt, null); assert.equal(prenatal.data.postpartumVisits[0].deliveryDate, null); assert.equal(prenatal.sourceUpdatedAt, "2026-10-19T12:34:56.789Z");
      assert.equal(prenatal.patient.phone, "41999990000"); assert.match(prenatal.patient.address || "", /Rua atual.*Centro.*PR/);
      const chronic = (await source("CELERIFLOW_HIPERDIA")).map(value => followupRecordSchemas.CELERIFLOW_HIPERDIA.parse(value));
      assert.deepEqual(chronic.map(record => record.patientId), ["followup-patient"]);
      assert.equal(chronic[0].data.assessments[0].systolic, 120.125); assert.deepEqual(chronic[0].data.assessments[0].riskFactors, ["Tabagismo"]); assert.deepEqual(chronic[0].data.assessments[0].complications, []);
      assert.equal(chronic[0].data.conditions.find(condition => condition.id === "followup-background-condition")?.medicalRecordId, null);
      const explicitFuture = await collectFollowupSources(context, { ...range, contract: "CELERIFLOW_HIPERDIA", originKeys: [{ originType: "CHRONIC_PATIENT", originId: "followup-future-patient" }] });
      assert.equal(explicitFuture.length, 1); assert.equal(explicitFuture[0].occurredAt, "2030-01-01T12:00:00.000Z");
      await db.insert(healthChronicAssessments).values({ id: "followup-later-assessment", patientId: "followup-patient", medicalRecordId: "followup-chronic-record", conditionKind: "DIABETES", assessedAt: new Date("2030-01-01T12:00:00Z"), riskFactors: [], complications: [], notes: "Avaliação futura do paciente já elegível", actorUsuarioId: context.user.id, createdAt: new Date("2026-10-19T12:34:56.789Z") });
      const allHistory = followupRecordSchemas.CELERIFLOW_HIPERDIA.parse((await source("CELERIFLOW_HIPERDIA"))[0]);
      assert.equal(allHistory.data.assessments.length, 2); assert.equal(allHistory.occurredAt, "2030-01-01T12:00:00.000Z");
      const rira = await source("CELERIFLOW_RIRA"); assert.equal(rira.length, 4); assert.ok(!rira.some(record => record.originId === "followup-other-request"));
      const request = followupRecordSchemas.CELERIFLOW_RIRA.parse(rira.find(record => record.originId === "followup-request"));
      assert.ok(request.data.events.some(event => event.eventType === "WAITLIST_LINKED")); assert.equal(request.data.authorizedAt, "2026-10-19T12:34:56.789Z");
      const waiting = followupRecordSchemas.CELERIFLOW_RIRA.parse(rira.find(record => record.originId === "followup-wait"));
      assert.equal(waiting.data.events.length, 2); assert.equal(waiting.data.executedAt, "2026-10-19T12:34:56.789Z");
      assert.equal(rira.find(record => record.originId === "followup-administrative-wait")?.professionalId, null);
      await assert.rejects(collectFollowupSources(denied, { ...range, contract: "CELERIFLOW_RIRA" }), /acesso|unidade/i);
    });

    await t.test("geração e recebimento concorrentes preservam hash, data civil, protocolo e replay", async () => {
      const input = generation(prenatalBinding.id);
      const race = await Promise.all([generateHealthFollowupBatches(context, input, connection), generateHealthFollowupBatches(context, input, connection)]);
      assert.deepEqual(race[0], race[1]); assert.equal(race[0].total, 1); const firstPrenatalBatch = race[0].batchIds[0];
      const batch = await followupBatchForActor(db, context, firstPrenatalBatch);
      assert.equal(batch.fromDate.toISOString(), "2026-10-19T00:00:00.000Z"); assert.equal(batch.toDate.toISOString(), "2026-10-19T00:00:00.000Z"); assert.equal(batch.hashSha256, followupHash(batch.payload)); assert.equal(batch.items[0].ordinal, 1);
      await assert.rejects(generateHealthFollowupBatches(context, { ...input, fromDate: "2026-10-18" }, connection), /outras datas/);
      await assert.rejects(processHealthFollowupBatch(denied, batch.id, undefined, connection), /acesso|unidade/i);
      await assert.rejects(processHealthFollowupBatch(context, batch.id, "CELERIFLOW_RIRA", connection), /contrato desse receptor/);
      const receipts = await Promise.all([processHealthFollowupBatch(context, batch.id, undefined, connection), processHealthFollowupBatch(context, batch.id, undefined, connection)]);
      assert.deepEqual(receipts[0], receipts[1]); const firstReceipt = receipts[0].id; assert.equal(receipts[0].rejected, 0); assert.equal(receipts[0].accepted, 1); assert.match(receipts[0].protocol, /^CF-RECEPTOR_FOLLOWUP_PRENATAL-\d{4}-00000001$/); assert.ok(Number.isFinite(Date.parse(receipts[0].createdAt)));
      assert.equal((await db.select({ total: count() }).from(healthFollowupReceipts).where(eq(healthFollowupReceipts.batchId, batch.id)))[0].total, 1);
      assert.equal((await db.select({ total: count() }).from(integrationRuns).where(eq(integrationRuns.connectionId, prenatalBinding.connectionId)))[0].total, 1);
      const repeated = await generateHealthFollowupBatches(context, generation(prenatalBinding.id), connection);
      const unchanged = await processHealthFollowupBatch(context, repeated.batchIds[0], undefined, connection);
      assert.equal(unchanged.unchanged, unchanged.total); assert.equal((await db.select({ total: count() }).from(healthFollowupRecords).where(eq(healthFollowupRecords.receiverId, prenatalBinding.receiverId)))[0].total, 1);
      const current = (await db.select().from(healthFollowupRecords).where(eq(healthFollowupRecords.receiverId, prenatalBinding.receiverId)))[0];
      assert.equal(current.lastBatchId, repeated.batchIds[0]); assert.equal(current.sourceUpdatedAt.toISOString(), "2026-10-19T12:34:56.789Z");
      await db.update(integrationConnections).set({ status: "INATIVA" }).where(eq(integrationConnections.id, prenatalBinding.connectionId));
      assert.equal((await processHealthFollowupBatch(context, batch.id, undefined, connection)).id, firstReceipt);
      await assert.rejects(generateHealthFollowupBatches(context, generation(prenatalBinding.id), connection), /inativa ou incompatível/);
      await db.update(integrationConnections).set({ status: "ATIVA" }).where(eq(integrationConnections.id, prenatalBinding.connectionId));
    });

    await t.test("Hiperdia e RIRA mantêm retorno parcial, correção, reprocessamento e versão anterior", async () => {
      const chronic = await generateHealthFollowupBatches(context, generation(chronicBinding.id), connection);
      assert.equal((await processHealthFollowupBatch(context, chronic.batchIds[0], undefined, connection)).rejected, 0);
      const input = generation(riraBinding.id), generated = await generateHealthFollowupBatches(context, input, connection); partialBatch = generated.batchIds[0];
      const partial = await processHealthFollowupBatch(context, partialBatch, undefined, connection);
      assert.equal(partial.status, "PARCIAL"); assert.equal(partial.accepted, 3); assert.equal(partial.rejected, 1);
      const evidence = await followupBatchForActor(db, context, partialBatch);
      assert.deepEqual(evidence.receipt?.results.map(result => result.batchItem.ordinal), [1, 2, 3, 4]); assert.ok(evidence.receipt?.results.some(result => result.status === "REJEITADO" && result.message.includes("patient.name")));
      const nullProfessional = (await db.select().from(healthFollowupRecords).where(and(eq(healthFollowupRecords.receiverId, riraBinding.receiverId), eq(healthFollowupRecords.originId, "followup-administrative-wait"))))[0];
      assert.equal(nullProfessional.professionalId, null);
      await db.update(people).set({ fullName: "Identidade completada", updatedAt: new Date("2026-10-20T12:00:00Z") }).where(eq(people.id, "followup-incomplete-person"));
      const corrected = await generateHealthFollowupBatches(context, { ...input, requestKey: randomUUID(), reprocessOfId: partialBatch, onlyRejected: true }, connection);
      assert.equal(corrected.total, 1); assert.equal((await processHealthFollowupBatch(context, corrected.batchIds[0], undefined, connection)).rejected, 0);
      assert.equal((await db.select().from(healthFollowupReceipts).where(eq(healthFollowupReceipts.id, partial.id)))[0].rejected, 1);
      await assert.rejects(generateHealthFollowupBatches(context, { ...generation(prenatalBinding.id), reprocessOfId: partialBatch }, connection), /conexão e unidade da remessa anterior/);
      await db.update(healthRegulationRequests).set({ status: "EM_ANALISE", updatedAt: new Date("2026-10-21T12:00:00Z") }).where(eq(healthRegulationRequests.id, "followup-request"));
      const older = await generateHealthFollowupBatches(context, generation(riraBinding.id), connection);
      await db.update(healthRegulationRequests).set({ status: "DEVOLVIDA", updatedAt: new Date("2026-10-22T12:00:00Z") }).where(eq(healthRegulationRequests.id, "followup-request"));
      const newer = await generateHealthFollowupBatches(context, generation(riraBinding.id), connection);
      await processHealthFollowupBatch(context, newer.batchIds[0], undefined, connection);
      const oldReceipt = await processHealthFollowupBatch(context, older.batchIds[0], undefined, connection); assert.equal(oldReceipt.rejected, 1);
      const oldEvidence = await followupBatchForActor(db, context, older.batchIds[0]); assert.ok(oldEvidence.receipt?.results.some(result => result.status === "VERSAO_ANTERIOR"));
      const latest = (await db.select().from(healthFollowupRecords).where(and(eq(healthFollowupRecords.receiverId, riraBinding.receiverId), eq(healthFollowupRecords.originId, "followup-request"))))[0];
      assert.equal(followupRecordSchemas.CELERIFLOW_RIRA.parse(latest.payload).data.status, "DEVOLVIDA");
    });

    await t.test("ownership rejeita identidade/profissional/origem/atendimento/unidade/chave e JSON null", async () => {
      const prenatal = followupRecordSchemas.CELERIFLOW_SISPRENATAL.parse((await source("CELERIFLOW_SISPRENATAL"))[0]);
      const chronic = followupRecordSchemas.CELERIFLOW_HIPERDIA.parse((await source("CELERIFLOW_HIPERDIA"))[0]);
      const rira = followupRecordSchemas.CELERIFLOW_RIRA.parse((await source("CELERIFLOW_RIRA")).find(record => record.originId === "followup-request"));
      await db.insert(medicalRecords).values({ id: "followup-cross-unit-record", patientId: "followup-patient", unitId: "followup-other-unit", professionalId: "followup-professional" });
      const cases: { bindingId: string; record: FollowupRecord; message: RegExp }[] = [
        { bindingId: prenatalBinding.id, record: rekey("CELERIFLOW_SISPRENATAL", { ...prenatal, patient: { ...prenatal.patient, personId: "followup-other-person" } }), message: /Paciente\/identidade/ },
        { bindingId: prenatalBinding.id, record: rekey("CELERIFLOW_SISPRENATAL", { ...prenatal, professional: { ...prenatal.professional, employeeId: "unknown" } }), message: /Profissional de origem/ },
        { bindingId: prenatalBinding.id, record: rekey("CELERIFLOW_SISPRENATAL", { ...prenatal, originId: "unknown" }), message: /Gestação não pertence/ },
        { bindingId: prenatalBinding.id, record: rekey("CELERIFLOW_SISPRENATAL", { ...prenatal, data: { ...prenatal.data, openedMedicalRecordId: "followup-future-record" } }), message: /atendimento gestacional/ },
        { bindingId: prenatalBinding.id, record: rekey("CELERIFLOW_SISPRENATAL", { ...prenatal, unitId: "followup-other-unit", unit: { ...prenatal.unit, id: "followup-other-unit" } }), message: /Unidade de origem diferente/ },
        { bindingId: chronicBinding.id, record: rekey("CELERIFLOW_HIPERDIA", { ...chronic, originId: "followup-other-patient" }), message: /deve identificar o paciente/ },
        { bindingId: chronicBinding.id, record: rekey("CELERIFLOW_HIPERDIA", { ...chronic, data: { ...chronic.data, originMedicalRecordId: "followup-future-record" } }), message: /condição\/avaliação clínica/ },
        { bindingId: chronicBinding.id, record: rekey("CELERIFLOW_HIPERDIA", { ...chronic, data: { ...chronic.data, assessments: chronic.data.assessments.map(assessment => ({ ...assessment, medicalRecordId: "followup-cross-unit-record" })) } }), message: /fora da unidade/ },
        { bindingId: riraBinding.id, record: rekey("CELERIFLOW_RIRA", { ...rira, originId: "followup-other-request" }), message: /Pedido\/espera não pertence/ },
        { bindingId: riraBinding.id, record: rekey("CELERIFLOW_RIRA", { ...rira, data: { ...rira.data, waitlist: { id: "unknown", status: "Aguardando", enteredAt: rira.occurredAt, updatedAt: rira.sourceUpdatedAt, specialtyId: null, serviceId: null, scheduledAppointmentId: null } } }), message: /espera informada não pertence/ },
        { bindingId: riraBinding.id, record: rekey("CELERIFLOW_RIRA", { ...rira, data: { ...rira.data, appointment: { id: "followup-appointment", date: rira.occurredAt, status: "Atendido", unitId: "followup-other-unit", professionalId: null } } }), message: /Agendamento informado não pertence/ },
        { bindingId: prenatalBinding.id, record: { ...prenatal, sourceVersion: "0".repeat(64) }, message: /Versão ou chave/ },
        { bindingId: prenatalBinding.id, record: { ...prenatal, idempotencyKey: "0".repeat(64) }, message: /Versão ou chave/ },
      ];
      for (const item of cases) {
        const batchId = await storeFollowupEvidence(connection, item.bindingId, [evidence(item.record)]);
        const receipt = await processHealthFollowupBatch(context, batchId, undefined, connection); assert.equal(receipt.status, "REJEITADA");
        const batch = await followupBatchForActor(db, context, batchId); assert.match(batch.receipt!.results[0].message, item.message);
      }
      const nullBatch = await storeFollowupEvidence(connection, prenatalBinding.id, [{ ...evidence(prenatal), payload: null }]);
      assert.equal((await db.select().from(healthFollowupBatchItems).where(eq(healthFollowupBatchItems.batchId, nullBatch)))[0].payload, null);
      assert.equal((await processHealthFollowupBatch(context, nullBatch, undefined, connection)).rejected, 1);
    });

    await t.test("integridade falha sem protocolo e DDL protege evidência imutável", async () => {
      const record = (await source("CELERIFLOW_SISPRENATAL"))[0];
      const badHash = await storeFollowupEvidence(connection, prenatalBinding.id, [evidence(record)], { hashSha256: "0".repeat(64) });
      await assert.rejects(processHealthFollowupBatch(context, badHash, undefined, connection), /integridade ou destino/);
      const badOrdinal = await storeFollowupEvidence(connection, prenatalBinding.id, [evidence(record)], { ordinalOffset: 1 });
      await assert.rejects(processHealthFollowupBatch(context, badOrdinal, undefined, connection), /integridade ou destino/);
      assert.equal((await db.select({ total: count() }).from(healthFollowupReceipts).where(inArray(healthFollowupReceipts.batchId, [badHash, badOrdinal])))[0].total, 0);
      const failedRuns = await db.select().from(integrationRuns).where(and(eq(integrationRuns.connectionId, prenatalBinding.connectionId), eq(integrationRuns.status, "ERRO")));
      assert.equal(failedRuns.length, 2); assert.ok(failedRuns.every(run => run.externalId === null));
      // Own evidence: a failure in the concurrency scenario must not turn these
      // mutations into no-ops against an empty ID.
      const intactId = await storeFollowupEvidence(connection, prenatalBinding.id, [evidence(record)]);
      const receipt = await processHealthFollowupBatch(context, intactId, undefined, connection);
      const intact = await followupBatchForActor(db, context, intactId);
      assert.ok(intact.receipt); assert.equal(intact.receipt.id, receipt.id); assert.equal(intact.items.length, 1);
      const changedHash = `${intact.hashSha256[0] === "0" ? "1" : "0"}${intact.hashSha256.slice(1)}`;
      assert.notEqual(changedHash, intact.hashSha256);
      await assert.rejects(db.update(healthFollowupBatches).set({ hashSha256: changedHash }).where(eq(healthFollowupBatches.id, intact.id)), isImmutableEvidenceViolation);
      await assert.rejects(db.update(healthFollowupBatchItems).set({ payload: { overwritten: true } }).where(eq(healthFollowupBatchItems.id, intact.items[0].id)), isImmutableEvidenceViolation);
      await assert.rejects(db.update(healthFollowupReceipts).set({ rejected: receipt.rejected + 1 }).where(eq(healthFollowupReceipts.id, receipt.id)), isImmutableEvidenceViolation);
      const [key] = await db.select().from(healthFollowupProcessedKeys).where(eq(healthFollowupProcessedKeys.receiverId, prenatalBinding.receiverId));
      assert.ok(key);
      await assert.rejects(db.delete(healthFollowupProcessedKeys).where(eq(healthFollowupProcessedKeys.id, key.id)), isImmutableEvidenceViolation);
      const [result] = await db.select().from(healthFollowupResults).where(eq(healthFollowupResults.receiptId, receipt.id));
      assert.ok(result); assert.notEqual(result.message, "Sobrescrita");
      await assert.rejects(db.update(healthFollowupResults).set({ message: "Sobrescrita" }).where(eq(healthFollowupResults.id, result.id)), isImmutableEvidenceViolation);
      assert.deepEqual(await followupBatchForActor(db, context, intactId), intact);
      assert.equal((await processHealthFollowupBatch(context, intactId, undefined, connection)).id, receipt.id);
    });

    await t.test("origem, três motores, auditoria e writer real de notificações compartilham commit/rollback", async () => {
      const totals = async () => ({ connections: (await db.select({ n: count() }).from(integrationConnections))[0].n, receivers: await db.select({ id: healthFollowupReceivers.id, nextSequence: healthFollowupReceivers.nextSequence }).from(healthFollowupReceivers).orderBy(healthFollowupReceivers.id), bindings: (await db.select({ n: count() }).from(healthFollowupBindings))[0].n, batches: (await db.select({ n: count() }).from(healthFollowupBatches))[0].n, items: (await db.select({ n: count() }).from(healthFollowupBatchItems))[0].n, receipts: (await db.select({ n: count() }).from(healthFollowupReceipts))[0].n, records: (await db.select({ n: count() }).from(healthFollowupRecords))[0].n, processedKeys: (await db.select({ n: count() }).from(healthFollowupProcessedKeys))[0].n, results: (await db.select({ n: count() }).from(healthFollowupResults))[0].n, runs: (await db.select({ n: count() }).from(integrationRuns))[0].n, audits: (await db.select({ n: count() }).from(auditEvents))[0].n, notifications: (await db.select({ n: count() }).from(internalNotifications))[0].n });
      const before = await totals();
      const compose = async (fail: boolean) => withDatabaseTransaction(connection, async tx => {
        await tx.update(people).set({ fullName: "Origem na mesma transação" }).where(eq(people.id, "followup-person"));
        const binding = await configureHealthFollowupInTransaction(tx, context, { unitId: "followup-boundary-unit", contract: "CELERIFLOW_RIRA", code: "FOLLOWUP_ATOMIC", name: "Receptor da operação de origem" });
        await tx.insert(healthWaitlists).values({ id: "followup-atomic-source", patientId: "followup-patient", unitId: "followup-boundary-unit", createdByUsuarioId: context.user.id, createdAt: new Date("2026-10-19T12:34:56.789Z"), updatedAt: new Date("2026-10-19T12:34:56.789Z") });
        const generated = await generateHealthFollowupBatchesInTransaction(tx, context, generation(binding.id));
        const receipt = await processHealthFollowupBatchInTransaction(tx, context, generated.batchIds[0]);
        assert.equal(receipt.accepted, 1); assert.equal(receipt.rejected, 0);
        const notification = { actorUsuarioId: context.user.id, recipientUserIds: ["followup-recipient"], sourceModule: "SAUDE", entityType: "HEALTH_FOLLOWUP_RECEIPT", entityId: receipt.id, type: "FOLLOWUP_RECEIVED", title: "Acompanhamento recebido", message: "Operação compartilhada com a origem", dedupeDiscriminator: "SOURCE_OPERATION" };
        assert.equal((await insertInternalNotifications(tx, notification)).created, 1); assert.equal((await insertInternalNotifications(tx, notification)).created, 0);
        assert.equal((await processHealthFollowupBatchInTransaction(tx, context, receipt.batchId)).id, receipt.id);
        if (fail) throw new Error("rollback único da origem e notificação");
        return receipt;
      }, { timeoutMs: 120_000 });
      await assert.rejects(compose(true), /rollback único/); assert.deepEqual(await totals(), before);
      assert.equal((await db.select().from(healthWaitlists).where(eq(healthWaitlists.id, "followup-atomic-source"))).length, 0);
      assert.equal((await db.select().from(people).where(eq(people.id, "followup-person")))[0].fullName, "Paciente do acompanhamento");
      const receipt = await compose(false); assert.equal(receipt.accepted, 1);
      assert.equal((await processHealthFollowupBatch(context, receipt.batchId, undefined, connection)).protocol, receipt.protocol);
      assert.equal((await db.select({ n: count() }).from(internalNotifications).where(eq(internalNotifications.entityId, receipt.id)))[0].n, 1);
    });

    await t.test("datas de seleção mantêm limites brasileiros sem depender do TZ do processo", async () => {
      // The composition scenario commits this in compose(false), after proving
      // compose(true) rolled it back. Its presence here is an explicit golden.
      const instants = ["2026-10-19T02:59:59.999Z", "2026-10-19T03:00:00.000Z", "2026-10-20T02:59:59.999Z", "2026-10-20T03:00:00.000Z"];
      await db.insert(healthWaitlists).values(instants.map((date, index) => ({ id: `followup-boundary-${index}`, patientId: "followup-patient", unitId: "followup-boundary-unit", createdByUsuarioId: context.user.id, createdAt: new Date(date), updatedAt: new Date(date) })));
      const records = await collectFollowupSources(context, { ...range, unitId: "followup-boundary-unit", contract: "CELERIFLOW_RIRA" });
      assert.deepEqual(records.map(record => record.originId), ["followup-atomic-source", "followup-boundary-1", "followup-boundary-2"]);
    });

    await t.test("501 origens desmembram em 500+1; 5001 origens são recusadas integralmente", async () => {
      await db.insert(healthWaitlists).values(Array.from({ length: 501 }, (_, index) => ({ id: `followup-bulk-${String(index).padStart(4, "0")}`, patientId: "followup-patient", unitId: "followup-bulk-unit", createdByUsuarioId: context.user.id, createdAt: new Date("2026-10-19T12:00:00Z"), updatedAt: new Date("2026-10-19T12:00:00Z") })));
      const binding = await configureHealthFollowup(context, { unitId: "followup-bulk-unit", contract: "CELERIFLOW_RIRA", code: "FOLLOWUP_BULK", name: "Receptor das remessas completas" }, connection);
      const input = generation(binding.id), generated = await generateHealthFollowupBatches(context, input, connection);
      assert.equal(generated.total, 501); assert.equal(generated.batchIds.length, 2);
      assert.equal((await followupBatchForActor(db, context, generated.batchIds[0])).items.length, 500); assert.equal((await followupBatchForActor(db, context, generated.batchIds[1])).items.length, 1);
      assert.deepEqual(await generateHealthFollowupBatches(context, input, connection), generated);
      for (const batchId of generated.batchIds) assert.equal((await processHealthFollowupBatch(context, batchId, undefined, connection)).rejected, 0);
      assert.equal((await db.select({ n: count() }).from(healthFollowupRecords).where(eq(healthFollowupRecords.receiverId, binding.receiverId)))[0].n, 501);
      await db.insert(healthWaitlists).values(Array.from({ length: 4500 }, (_, index) => ({ id: `followup-overflow-${index}`, patientId: "followup-patient", unitId: "followup-bulk-unit", createdByUsuarioId: context.user.id, createdAt: new Date("2026-10-19T12:00:00Z"), updatedAt: new Date("2026-10-19T12:00:00Z") })));
      await assert.rejects(generateHealthFollowupBatches(context, generation(binding.id), connection), /5\.000 origens/);
      assert.equal((await db.select({ n: count() }).from(healthFollowupBatches).where(eq(healthFollowupBatches.bindingId, binding.id)))[0].n, 2);
      assert.equal((await db.select({ notNull: sql<boolean>`${healthFollowupBatches.payload} IS NOT NULL` }).from(healthFollowupBatches).where(eq(healthFollowupBatches.id, partialBatch)))[0].notNull, true);
    });
  } finally { await fixture.close(); }
});
