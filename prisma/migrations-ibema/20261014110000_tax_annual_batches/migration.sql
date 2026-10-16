CREATE TABLE "TaxAnnualBatch" (
  id TEXT PRIMARY KEY, "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"(id),
  "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id), "financialYearId" TEXT NOT NULL REFERENCES "FinancialYear"(id),
  "taxId" TEXT NOT NULL REFERENCES "Tax"(id), "parameterId" TEXT NOT NULL REFERENCES "TaxParameter"(id),
  year INTEGER NOT NULL, competence TIMESTAMP(3) NOT NULL, "targetType" TEXT NOT NULL,
  "actorUsuarioId" TEXT NOT NULL REFERENCES "Usuario"(id), "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL, "ruleSnapshot" JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'SIMULATED', reason TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3), "queuedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxAnnualBatch_status" CHECK (status IN ('SIMULATED','QUEUED','RUNNING','COMPLETED','CANCELLED')),
  CONSTRAINT "TaxAnnualBatch_target" CHECK ("targetType" IN ('TAXPAYER','REAL_ESTATE','ECONOMIC_REGISTRATION')),
  CONSTRAINT "TaxAnnualBatch_year" CHECK (year=EXTRACT(YEAR FROM competence) AND year BETWEEN 1900 AND 2200)
);
CREATE UNIQUE INDEX "TaxAnnualBatch_governmentEntityId_idempotencyKey_key" ON "TaxAnnualBatch" ("governmentEntityId","idempotencyKey");
CREATE INDEX "TaxAnnualBatch_actorUsuarioId_status_scheduledAt_idx" ON "TaxAnnualBatch" ("actorUsuarioId",status,"scheduledAt");
CREATE TABLE "TaxAnnualBatchItem" (
  id TEXT PRIMARY KEY, "batchId" TEXT NOT NULL REFERENCES "TaxAnnualBatch"(id) ON DELETE RESTRICT,
  "targetId" TEXT NOT NULL, "taxpayerId" TEXT NOT NULL REFERENCES "Taxpayer"(id),
  "taxableBase" DECIMAL(24,2) NOT NULL, "simulatedAmount" DECIMAL(24,2) NOT NULL, snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
  "assessmentId" TEXT REFERENCES "TaxAssessment"(id), error TEXT, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxAnnualBatchItem_amount" CHECK ("taxableBase">=0 AND "simulatedAmount">=0),
  CONSTRAINT "TaxAnnualBatchItem_status" CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  CONSTRAINT "TaxAnnualBatchItem_completed" CHECK ((status='COMPLETED')=("assessmentId" IS NOT NULL))
);
CREATE UNIQUE INDEX "TaxAnnualBatchItem_batchId_targetId_key" ON "TaxAnnualBatchItem" ("batchId","targetId");
CREATE INDEX "TaxAnnualBatchItem_batchId_status_id_idx" ON "TaxAnnualBatchItem" ("batchId",status,id);

CREATE FUNCTION tax_annual_batch_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lotes anuais conservam simulação, resultados e histórico'; END IF;
  IF TG_OP='INSERT' THEN
    IF TG_TABLE_NAME='TaxAnnualBatch' THEN
      IF NEW.status<>'SIMULATED' OR NOT EXISTS (
        SELECT 1 FROM "PlanningEntityUnit" u JOIN "FinancialYear" y ON y.id=NEW."financialYearId"
        WHERE u."budgetUnitId"=NEW."budgetUnitId" AND u."governmentEntityId"=NEW."governmentEntityId"
          AND y."governmentEntityId"=NEW."governmentEntityId" AND y.year=NEW.year
      ) THEN RAISE EXCEPTION 'Simulação anual exige exercício e UG do mesmo ente'; END IF;
      IF NOT EXISTS (SELECT 1 FROM "TaxParameter" p WHERE p.id=NEW."parameterId" AND p."taxId"=NEW."taxId") THEN RAISE EXCEPTION 'Regra anual deve pertencer ao tributo'; END IF;
    ELSE
      IF NEW.status<>'PENDING' OR NOT EXISTS (SELECT 1 FROM "TaxAnnualBatch" b WHERE b.id=NEW."batchId" AND b.status='SIMULATED') THEN RAISE EXCEPTION 'Itens somente podem integrar simulação não efetivada'; END IF;
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF TG_TABLE_NAME='TaxAnnualBatch' THEN
      IF (to_jsonb(OLD)-ARRAY['status','scheduledAt','queuedAt','completedAt','updatedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','scheduledAt','queuedAt','completedAt','updatedAt']) THEN RAISE EXCEPTION 'Memória do lote anual é imutável'; END IF;
      IF OLD.status IN ('COMPLETED','CANCELLED') AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN RAISE EXCEPTION 'Lote anual encerrado é imutável'; END IF;
      IF NEW.status<>OLD.status AND NOT (
        (OLD.status='SIMULATED' AND NEW.status IN ('QUEUED','CANCELLED')) OR
        (OLD.status='QUEUED' AND NEW.status IN ('RUNNING','COMPLETED','CANCELLED')) OR
        (OLD.status='RUNNING' AND NEW.status IN ('QUEUED','COMPLETED','CANCELLED'))
      ) THEN RAISE EXCEPTION 'Transição inválida de lote anual'; END IF;
      IF NEW.status='COMPLETED' AND (NOT EXISTS (SELECT 1 FROM "TaxAnnualBatchItem" i WHERE i."batchId"=NEW.id) OR EXISTS (SELECT 1 FROM "TaxAnnualBatchItem" i WHERE i."batchId"=NEW.id AND i.status<>'COMPLETED')) THEN RAISE EXCEPTION 'Conclusão anual exige todos os itens conciliados'; END IF;
      IF NEW.status='CANCELLED' AND EXISTS (SELECT 1 FROM "TaxAnnualBatchItem" i WHERE i."batchId"=NEW.id AND i.status='COMPLETED') THEN RAISE EXCEPTION 'Cancelamento anual não apaga efetivações individuais'; END IF;
    ELSE
      IF (to_jsonb(OLD)-ARRAY['status','attempts','assessmentId','error','completedAt','updatedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','attempts','assessmentId','error','completedAt','updatedAt']) THEN RAISE EXCEPTION 'Memória individual da simulação é imutável'; END IF;
      IF OLD.status='COMPLETED' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN RAISE EXCEPTION 'Item anual efetivado é imutável'; END IF;
      IF NEW.status='COMPLETED' AND NOT EXISTS (
        SELECT 1 FROM "TaxAssessment" a JOIN "TaxAnnualBatch" b ON b.id=NEW."batchId"
        WHERE a.id=NEW."assessmentId" AND a."taxpayerId"=NEW."taxpayerId" AND a."taxId"=b."taxId"
          AND a.year=b.year AND a."originalValueDecimal"=NEW."simulatedAmount"
          AND b.status IN ('QUEUED','RUNNING')
          AND a."calculationSnapshot"->>'budgetUnitId'=b."budgetUnitId"
          AND a."calculationSnapshot"->>'governmentEntityId'=b."governmentEntityId"
          AND a."calculationSnapshot"->>'financialYearId'=b."financialYearId"
          AND (b."targetType"<>'REAL_ESTATE' OR a."realEstateId"=NEW."targetId")
          AND (b."targetType"<>'ECONOMIC_REGISTRATION' OR a."economicRegistrationId"=NEW."targetId")
      ) THEN RAISE EXCEPTION 'Item anual exige lançamento nativo conciliado ao lote'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TaxAnnualBatch_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "TaxAnnualBatch" FOR EACH ROW EXECUTE FUNCTION tax_annual_batch_integrity();
CREATE TRIGGER "TaxAnnualBatchItem_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "TaxAnnualBatchItem" FOR EACH ROW EXECUTE FUNCTION tax_annual_batch_integrity();
