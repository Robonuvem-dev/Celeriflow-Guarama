import "./helpers/laboratory-test-environment";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as d from "../src/db/schema/health-diagnostics";
import { documents } from "../src/db/schema/registry";
import { documentSignatures, documentVersions } from "../src/db/schema/document-workflow";
import { collectLabSample, createLabReport, enterLabResult, recordDeviceMessage, releaseLabReport, requestLabRecollection, reviewLabReport, scheduleLabOrder } from "../src/lib/saude/laboratory-service";
import { createLaboratoryDrizzleFixture, isDiagnosticInjectedFailure, laboratoryTestContext } from "./helpers/laboratory-drizzle-fixture";
import { createLaboratoryBlobStore } from "./helpers/laboratory-blob-store";

test("Laboratory · real Neon/Drizzle workflow, custody, revisions, GED and atomic counters", async suite => {
  const f = await createLaboratoryDrizzleFixture(), { db, connection, context, restricted } = f;
  const blob = await createLaboratoryBlobStore();
  const newOrder = async (values: Partial<typeof d.diagnosticLabOrders.$inferInsert> = {}) => {
    const [order] = await db.insert(d.diagnosticLabOrders).values({ patientId: "dx-patient", requestUnitId: "dx-u1", examModelId: "dx-model", idempotencyKey: randomUUID(), createdByUsuarioId: context.user.id, ...values }).returning();
    return order;
  };
  const readOrder = async (id: string) => (await db.select().from(d.diagnosticLabOrders).where(eq(d.diagnosticLabOrders.id, id)))[0];
  const eventCount = async (id: string) => (await db.select({ total: count() }).from(d.diagnosticLabOrderEvents).where(eq(d.diagnosticLabOrderEvents.orderId, id)))[0].total;
  try {
    assert.equal(f.migrations, 156);
    await suite.test("unit scope, state, collector identity and barcode ownership are enforced", async () => {
      const order = await newOrder();
      await assert.rejects(scheduleLabOrder(restricted, { orderId: order.id, collectionUnitId: "dx-u2", scheduledAt: "2026-11-01T12:00:00Z" }, connection), /acesso/i);
      const foreign = await newOrder({ requestUnitId: "dx-u2", patientId: "dx-patient2" });
      await assert.rejects(scheduleLabOrder(restricted, { orderId: foreign.id, collectionUnitId: "dx-u1", scheduledAt: "2026-11-01T12:00:00Z" }, connection), /acesso/i);
      await assert.rejects(collectLabSample(context, { orderId: order.id, sampleBarcode: "EARLY" }, connection), /coleta/);
      const scheduled = await scheduleLabOrder(restricted, { orderId: order.id, collectionUnitId: "dx-u1", scheduledAt: "2026-11-01T12:00:00Z" }, connection);
      assert.deepEqual(scheduled, { id: order.id, status: "SCHEDULED", authorizationKey: null });
      assert.equal((await readOrder(order.id)).expectedResultAt?.toISOString(), "2026-11-03T12:00:00.000Z");
      await assert.rejects(collectLabSample(laboratoryTestContext({ employeeId: null }), { orderId: order.id, sampleBarcode: "NO-PROFESSIONAL" }, connection), /profissional/);
      await collectLabSample(restricted, { orderId: order.id, sampleBarcode: "DX-BARCODE", collectionByThirdParty: true }, connection);
      const collected = await readOrder(order.id);
      assert.equal(collected.collectorProfessionalId, "dx-professional");
      assert.equal(collected.collectionByThirdParty, true);
      assert.ok(collected.collectedAt instanceof Date);
      const other = await newOrder({ status: "SCHEDULED", collectionUnitId: "dx-u1" });
      await assert.rejects(collectLabSample(context, { orderId: other.id, sampleBarcode: "DX-BARCODE" }, connection), error => getPostgresError(error)?.code === "23505" && getPostgresError(error)?.constraint === "HealthLabOrder_sampleBarcode_key");
      assert.equal((await readOrder(other.id)).status, "SCHEDULED");
      assert.equal(await eventCount(other.id), 0);
    });

    await suite.test("provider quota and scheduling event roll back together; recollection does not debit twice", async () => {
      const order = await newOrder();
      const [quota] = await db.insert(d.diagnosticLabProviderQuotas).values({ providerSupplierId: "dx-provider", unitId: "dx-u1", examModelId: "dx-model", period: "2026-12", allowedQuantity: 1 }).returning();
      const input = { orderId: order.id, collectionUnitId: "dx-u1", providerSupplierId: "dx-provider", scheduledAt: "2026-12-01T12:00:00Z" };
      await f.database.exec(`CREATE TRIGGER dx_fail_lab_event BEFORE INSERT ON "HealthLabOrderEvent" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(scheduleLabOrder(context, input, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_lab_event ON "HealthLabOrderEvent";`); }
      assert.equal((await readOrder(order.id)).status, "REQUESTED");
      assert.equal((await db.select().from(d.diagnosticLabProviderQuotas).where(eq(d.diagnosticLabProviderQuotas.id, quota.id)))[0].consumedQuantity, 0);
      const scheduled = await scheduleLabOrder(context, input, connection);
      assert.ok(scheduled.authorizationKey);
      await collectLabSample(context, { orderId: order.id, sampleBarcode: "PROVIDER-FIRST" }, connection);
      await requestLabRecollection(context, order.id, "Amostra inadequada", connection);
      const recollect = await readOrder(order.id);
      assert.equal(recollect.sampleBarcode, null); assert.equal(recollect.collectedAt, null);
      await scheduleLabOrder(context, input, connection);
      assert.equal((await db.select().from(d.diagnosticLabProviderQuotas).where(eq(d.diagnosticLabProviderQuotas.id, quota.id)))[0].consumedQuantity, 1);
      const blocked = await newOrder();
      await assert.rejects(scheduleLabOrder(context, { ...input, orderId: blocked.id }, connection), /cota/);
      assert.equal((await readOrder(blocked.id)).status, "REQUESTED");
    });

    await suite.test("date schedule capacity is serialized and cancelled orders do not occupy slots", async () => {
      const at = new Date("2027-01-15T12:00:00Z");
      await db.insert(d.diagnosticLabSchedules).values({ examModelId: "dx-model", unitId: "dx-u1", date: at, capacity: 1 });
      const first = await newOrder(), second = await newOrder();
      await newOrder({ status: "CANCELLED", collectionUnitId: "dx-u1", scheduledAt: at });
      const race = await Promise.allSettled([first, second].map(order => scheduleLabOrder(context, { orderId: order.id, collectionUnitId: "dx-u1", scheduledAt: at }, connection)));
      assert.equal(race.filter(row => row.status === "fulfilled").length, 1);
      const rejected = race.find(row => row.status === "rejected");
      assert.ok(rejected?.status === "rejected" && /vaga/.test(String(rejected.reason)));
      assert.equal((await eventCount(first.id)) + (await eventCount(second.id)), 1);
    });

    await suite.test("duplicate-window lower bound is inclusive; cancellation and weekly schedule are preserved", async () => {
      await f.database.exec(`INSERT INTO "HealthLabExamModel" (id,code,name,"duplicateWindowDays","updatedAt") VALUES ('dx-window-model','DX-WINDOW','Exame com janela',7,CURRENT_TIMESTAMP),('dx-weekday-model','DX-WEEKDAY','Exame semanal',0,CURRENT_TIMESTAMP);`);
      const prior = await newOrder({ examModelId: "dx-window-model", status: "SCHEDULED", collectionUnitId: "dx-u1", scheduledAt: new Date("2027-02-01T12:00:00Z") });
      const candidate = await newOrder({ examModelId: "dx-window-model" });
      const input = { orderId: candidate.id, collectionUnitId: "dx-u1", scheduledAt: "2027-02-08T12:00:00Z" };
      await assert.rejects(scheduleLabOrder(context, input, connection), /janela de repetição/);
      await db.update(d.diagnosticLabOrders).set({ status: "CANCELLED" }).where(eq(d.diagnosticLabOrders.id, prior.id));
      assert.equal((await scheduleLabOrder(context, input, connection)).status, "SCHEDULED");
      const at = new Date("2027-03-17T12:00:00Z");
      await db.insert(d.diagnosticLabSchedules).values({ examModelId: "dx-weekday-model", unitId: "dx-u1", weekday: at.getDay(), capacity: 1 });
      const first = await newOrder({ examModelId: "dx-weekday-model" }), second = await newOrder({ examModelId: "dx-weekday-model" });
      await scheduleLabOrder(context, { orderId: first.id, collectionUnitId: "dx-u1", scheduledAt: at }, connection);
      await assert.rejects(scheduleLabOrder(context, { orderId: second.id, collectionUnitId: "dx-u1", scheduledAt: at }, connection), /vaga/);
    });

    await suite.test("result versions are immutable, concurrent versions are ordered and JSON is not recursively decoded", async () => {
      const order = await newOrder({ status: "COLLECTED", collectionUnitId: "dx-u1", sampleBarcode: "RESULTS" });
      const values = { numeric: 0.125, nil: null, text: '{"amount":"001.00"}', nested: [false, { text: "null" }] };
      await enterLabResult(restricted, { orderId: order.id, status: "PARTIAL", values, interpretation: null }, connection);
      const [first] = await db.select().from(d.diagnosticLabResults).where(eq(d.diagnosticLabResults.orderId, order.id));
      assert.deepEqual(first.values, values); assert.ok(first.enteredAt instanceof Date);
      await Promise.all(["A", "B"].map(deviceCorrelationId => enterLabResult(context, { orderId: order.id, status: "FINAL", values: { deviceCorrelationId }, source: "DEVICE", deviceCorrelationId }, connection)));
      const versions = await db.select().from(d.diagnosticLabResults).where(eq(d.diagnosticLabResults.orderId, order.id)).orderBy(asc(d.diagnosticLabResults.version));
      assert.deepEqual(versions.map(item => item.version), [1, 2, 3]);
      assert.deepEqual(versions[0], first);
      await f.database.exec(`CREATE TRIGGER dx_fail_lab_result_event BEFORE INSERT ON "HealthLabOrderEvent" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(enterLabResult(context, { orderId: order.id, status: "FINAL", values: {} }, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_lab_result_event ON "HealthLabOrderEvent";`); }
      assert.equal((await db.select().from(d.diagnosticLabResults).where(eq(d.diagnosticLabResults.orderId, order.id))).length, 3);
      await requestLabRecollection(context, order.id, "Repetir coleta", connection);
      assert.deepEqual((await db.select().from(d.diagnosticLabResults).where(eq(d.diagnosticLabResults.id, first.id)))[0], first);
    });

    await suite.test("GED report/version/audit and domain report share one transaction; release requires review and configured signature", async () => {
      const order = await newOrder({ status: "COLLECTED", collectionUnitId: "dx-u1" });
      const file = new File(["%PDF-1.4\nlaudo da fixture\n%%EOF"], "laudo.pdf", { type: "application/pdf" });
      await assert.rejects(createLabReport(context, { orderId: order.id, title: "Sem resultado", file }, connection), /resultado final/);
      await enterLabResult(context, { orderId: order.id, status: "FINAL", values: { result: "Normal" } }, connection);
      const before = (await db.select({ total: count() }).from(documents))[0].total;
      await f.database.exec(`CREATE TRIGGER dx_fail_report BEFORE INSERT ON "HealthLabReport" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(createLabReport(context, { orderId: order.id, title: "Laudo com rollback", file }, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_report ON "HealthLabReport";`); }
      assert.equal((await db.select({ total: count() }).from(documents))[0].total, before);
      const ged = await createLabReport(restricted, { orderId: order.id, title: "Laudo final", file }, connection);
      const [report] = await db.select().from(d.diagnosticLabReports).where(eq(d.diagnosticLabReports.documentId, ged.documentId));
      assert.ok(report); assert.equal(report.status, "DRAFT");
      const [version] = await db.select().from(documentVersions).where(eq(documentVersions.id, ged.version.id));
      assert.equal(version.hashSha256, createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex"));
      assert.ok([...blob.files.values()].some(bytes => createHash("sha256").update(bytes).digest("hex") === version.hashSha256));
      await assert.rejects(releaseLabReport(context, report.id, false, connection), /revisado/);
      await assert.rejects(reviewLabReport(laboratoryTestContext({ hasHealthAccessScope: true, allowedHealthUnitIds: ["dx-u2"] }), report.id, connection), /acesso/i);
      await reviewLabReport(restricted, report.id, connection);
      await assert.rejects(releaseLabReport(context, report.id, true, connection), /publicação/i);
      await f.database.exec(`INSERT INTO "HealthLaboratoryConfiguration" (id,"unitId","laboratoryName","collectionStartTime","collectionEndTime","resultReleaseDays","usesDigitalSignature","publishesPatientPortal","effectiveFrom","createdByUsuarioId") VALUES ('dx-config','dx-u1','Laboratório','07:00','11:00',2,true,true,'2026-01-01','dx-user');`);
      await assert.rejects(releaseLabReport(context, report.id, true, connection), /assinatura digital/);
      const signedAt = new Date();
      const signature = await withDatabaseTransaction(connection, async tx => {
        await tx.select({ id: documentVersions.id }).from(documentVersions).where(eq(documentVersions.id, version.id)).for("update");
        await tx.update(documentVersions).set({ status: "PENDING_SIGNATURE", lockedAt: signedAt }).where(eq(documentVersions.id, version.id));
        return (await tx.insert(documentSignatures).values({ documentId: ged.documentId, documentVersionId: version.id, signerUsuarioId: context.user.id, signerEmployeeId: context.user.employeeId, signerName: context.user.name, signerEmail: context.user.email, requestedByUsuarioId: context.user.id, isRequired: true, authenticationMethod: "FIXTURE", documentHash: version.hashSha256, verificationCode: randomUUID(), requestedAt: signedAt, signedAt, status: "SIGNED" }).returning())[0];
      });
      await assert.rejects(releaseLabReport(context, report.id, true, connection), /assinatura digital/);
      await withDatabaseTransaction(connection, async tx => {
        await tx.select({ id: documentVersions.id }).from(documentVersions).where(eq(documentVersions.id, version.id)).for("update");
        await tx.update(documentVersions).set({ status: "SIGNED" }).where(eq(documentVersions.id, version.id));
      });
      const [signedVersion] = await db.select().from(documentVersions).where(eq(documentVersions.id, version.id));
      assert.equal(signedVersion.status, "SIGNED"); assert.deepEqual(signedVersion.lockedAt, signedAt);
      assert.equal(signedVersion.hashSha256, version.hashSha256); assert.equal(signedVersion.fileUrl, version.fileUrl);
      assert.equal(signedVersion.publicValidationCode, version.publicValidationCode); assert.deepEqual(signedVersion.finalizedAt, version.finalizedAt);
      await f.database.exec(`CREATE TRIGGER dx_fail_release_event BEFORE INSERT ON "HealthLabOrderEvent" FOR EACH ROW EXECUTE FUNCTION dx_fail_write();`);
      try { await assert.rejects(releaseLabReport(context, report.id, true, connection), isDiagnosticInjectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER dx_fail_release_event ON "HealthLabOrderEvent";`); }
      assert.equal((await readOrder(order.id)).status, "REVIEWED");
      assert.equal((await db.select().from(d.diagnosticLabReports).where(eq(d.diagnosticLabReports.id, report.id)))[0].releasedAt, null);
      assert.deepEqual(await releaseLabReport(restricted, report.id, true, connection), { id: report.id, status: "RELEASED" });
      const [released] = await db.select().from(d.diagnosticLabReports).where(eq(d.diagnosticLabReports.id, report.id));
      assert.ok(released.releasedAt instanceof Date); assert.deepEqual(released.publishedAt, released.releasedAt);
      assert.equal((await db.select().from(documentSignatures).where(eq(documentSignatures.id, signature.id)))[0].status, "SIGNED");
      await assert.rejects(enterLabResult(context, { orderId: order.id, status: "FINAL", values: {} }, connection), /digitação/);
    });

    await suite.test("device operator, hash, concurrent replay and JSON null versus SQL NULL", async () => {
      const input = { deviceId: "dx-device", direction: "IN", correlationId: "DX-CORRELATION", idempotencyKey: randomUUID(), payload: "HL7|fixture", sanitizedData: null };
      await assert.rejects(recordDeviceMessage(laboratoryTestContext({ id: "unbound-user" }), input, connection), /Operador/);
      const race = await Promise.all([recordDeviceMessage(context, input, connection), recordDeviceMessage(context, input, connection)]);
      assert.deepEqual(race[0], race[1]);
      const [message] = await db.select().from(d.diagnosticDeviceMessages).where(eq(d.diagnosticDeviceMessages.id, race[0].id));
      assert.equal(message.payloadHash, createHash("sha256").update(input.payload).digest("hex"));
      assert.equal(message.status, "RECEIVED");
      const omitted = await recordDeviceMessage(context, { ...input, idempotencyKey: randomUUID(), sanitizedData: undefined }, connection);
      const nulls = await db.execute<{ id: string; sqlNull: boolean; jsonType: string | null }>(sql`select id, "sanitizedData" is null as "sqlNull", jsonb_typeof("sanitizedData") as "jsonType" from "HealthDeviceMessage" where id in (${message.id}, ${omitted.id})`);
      assert.deepEqual(nulls.rows.find(row => row.id === message.id), { id: message.id, sqlNull: false, jsonType: "null" });
      assert.deepEqual(nulls.rows.find(row => row.id === omitted.id), { id: omitted.id, sqlNull: true, jsonType: null });
      assert.equal((await db.select({ total: count() }).from(d.diagnosticDeviceMessages).where(and(eq(d.diagnosticDeviceMessages.idempotencyKey, input.idempotencyKey), eq(d.diagnosticDeviceMessages.correlationId, input.correlationId))))[0].total, 1);
    });
  } finally { try { await blob.close(); } finally { await f.close(); } }
});
