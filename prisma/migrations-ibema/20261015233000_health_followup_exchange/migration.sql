ALTER TABLE "HealthPatientCondition" ADD COLUMN "chronicKind" TEXT;
CREATE TABLE "HealthFollowupReceiver" (
 "id" TEXT PRIMARY KEY, "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "contractName" TEXT NOT NULL, "schemaVersion" TEXT NOT NULL,
 "unitId" TEXT NOT NULL REFERENCES "HealthUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "nextSequence" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthFollowupBinding" (
 "id" TEXT PRIMARY KEY, "connectionId" TEXT NOT NULL UNIQUE REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "receiverId" TEXT NOT NULL UNIQUE REFERENCES "HealthFollowupReceiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "unitId" TEXT NOT NULL REFERENCES "HealthUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "contractName" TEXT NOT NULL, "schemaVersion" TEXT NOT NULL, "createdByUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("unitId", "contractName")
);
CREATE TABLE "HealthFollowupBatch" (
 "id" TEXT PRIMARY KEY, "bindingId" TEXT NOT NULL REFERENCES "HealthFollowupBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "idempotencyKey" TEXT NOT NULL, "fromDate" DATE NOT NULL, "toDate" DATE NOT NULL, "contractName" TEXT NOT NULL, "schemaVersion" TEXT NOT NULL,
 "reprocessOfId" TEXT REFERENCES "HealthFollowupBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "onlyRejected" BOOLEAN NOT NULL DEFAULT false,
 "hashSha256" TEXT NOT NULL, "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'GERADA',
 "createdByUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("bindingId", "idempotencyKey")
);
CREATE INDEX "HealthFollowupBatch_bindingId_createdAt_idx" ON "HealthFollowupBatch"("bindingId", "createdAt");
CREATE TABLE "HealthFollowupBatchItem" (
 "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "HealthFollowupBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ordinal" INTEGER NOT NULL, "originType" TEXT NOT NULL, "originId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "sourceVersion" TEXT NOT NULL, "payload" JSONB NOT NULL,
 UNIQUE ("batchId", "ordinal"), UNIQUE ("batchId", "originType", "originId")
);
CREATE TABLE "HealthFollowupReceipt" (
 "id" TEXT PRIMARY KEY, "receiverId" TEXT NOT NULL REFERENCES "HealthFollowupReceiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "batchId" TEXT NOT NULL UNIQUE REFERENCES "HealthFollowupBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "integrationRunId" TEXT NOT NULL UNIQUE REFERENCES "IntegrationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "protocol" TEXT NOT NULL UNIQUE, "receiverSnapshot" JSONB NOT NULL, "status" TEXT NOT NULL,
 "total" INTEGER NOT NULL, "accepted" INTEGER NOT NULL, "rejected" INTEGER NOT NULL, "unchanged" INTEGER NOT NULL,
 "processedByUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthFollowupRecord" (
 "id" TEXT PRIMARY KEY, "receiverId" TEXT NOT NULL REFERENCES "HealthFollowupReceiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "originType" TEXT NOT NULL, "originId" TEXT NOT NULL, "unitId" TEXT NOT NULL REFERENCES "HealthUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "professionalId" TEXT REFERENCES "HealthProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceVersion" TEXT NOT NULL, "sourceUpdatedAt" TIMESTAMP(3) NOT NULL, "snapshotAt" TIMESTAMP(3) NOT NULL, "payload" JSONB NOT NULL,
 "lastBatchId" TEXT NOT NULL REFERENCES "HealthFollowupBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "lastReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("receiverId", "originType", "originId")
);
CREATE INDEX "HealthFollowupRecord_unitId_patientId_idx" ON "HealthFollowupRecord"("unitId", "patientId");
CREATE TABLE "HealthFollowupProcessedKey" (
 "id" TEXT PRIMARY KEY, "receiverId" TEXT NOT NULL REFERENCES "HealthFollowupReceiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "key" TEXT NOT NULL, "recordId" TEXT NOT NULL REFERENCES "HealthFollowupRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceVersion" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("receiverId", "key")
);
CREATE TABLE "HealthFollowupResult" (
 "id" TEXT PRIMARY KEY, "receiptId" TEXT NOT NULL REFERENCES "HealthFollowupReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "batchItemId" TEXT NOT NULL UNIQUE REFERENCES "HealthFollowupBatchItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "recordId" TEXT REFERENCES "HealthFollowupRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL, "message" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthFollowupResult_receiptId_status_idx" ON "HealthFollowupResult"("receiptId", "status");
CREATE FUNCTION preserve_health_followup_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Evidência de intercâmbio imutável: gere nova remessa para reprocessar a origem.';
END;
$$;
CREATE TRIGGER "HealthFollowupBatchItem_immutable" BEFORE UPDATE OR DELETE ON "HealthFollowupBatchItem" FOR EACH ROW EXECUTE FUNCTION preserve_health_followup_evidence();
CREATE TRIGGER "HealthFollowupReceipt_immutable" BEFORE UPDATE OR DELETE ON "HealthFollowupReceipt" FOR EACH ROW EXECUTE FUNCTION preserve_health_followup_evidence();
CREATE TRIGGER "HealthFollowupResult_immutable" BEFORE UPDATE OR DELETE ON "HealthFollowupResult" FOR EACH ROW EXECUTE FUNCTION preserve_health_followup_evidence();
CREATE TRIGGER "HealthFollowupProcessedKey_immutable" BEFORE UPDATE OR DELETE ON "HealthFollowupProcessedKey" FOR EACH ROW EXECUTE FUNCTION preserve_health_followup_evidence();
CREATE FUNCTION preserve_health_followup_batch_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Remessa de intercâmbio preservada para auditoria.'; END IF;
 IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
  RAISE EXCEPTION 'Conteúdo de remessa imutável: gere nova remessa para corrigir a origem.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "HealthFollowupBatch_payload_immutable" BEFORE UPDATE OR DELETE ON "HealthFollowupBatch" FOR EACH ROW EXECUTE FUNCTION preserve_health_followup_batch_payload();
CREATE TABLE "HealthWaitlistEvent" (
 "id" TEXT PRIMARY KEY, "waitlistId" TEXT NOT NULL REFERENCES "HealthWaitlist"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "eventType" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT NOT NULL, "notes" TEXT,
 "appointmentId" TEXT REFERENCES "HealthAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthWaitlistEvent_waitlistId_createdAt_idx" ON "HealthWaitlistEvent"("waitlistId", "createdAt");
CREATE TRIGGER "HealthWaitlistEvent_immutable" BEFORE UPDATE OR DELETE ON "HealthWaitlistEvent" FOR EACH ROW EXECUTE FUNCTION preserve_health_followup_evidence();
