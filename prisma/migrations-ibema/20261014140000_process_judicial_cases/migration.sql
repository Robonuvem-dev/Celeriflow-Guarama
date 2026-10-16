CREATE TABLE "ProcessJudicialCase" (
  id TEXT PRIMARY KEY, "processId" TEXT NOT NULL UNIQUE REFERENCES "Process"(id) ON DELETE RESTRICT,
  "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"(id), "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id),
  "caseNumber" TEXT NOT NULL, court TEXT NOT NULL, "openedAt" TIMESTAMP(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SUSPENDED','CLOSED','RECLASSIFIED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ProcessJudicialCase_governmentEntityId_caseNumber_key" ON "ProcessJudicialCase" ("governmentEntityId","caseNumber");
CREATE INDEX "ProcessJudicialCase_governmentEntityId_budgetUnitId_status_openedAt_idx" ON "ProcessJudicialCase" ("governmentEntityId","budgetUnitId",status,"openedAt");
CREATE TABLE "ProcessJudicialCaseEvent" (
  id TEXT PRIMARY KEY, "caseId" TEXT NOT NULL REFERENCES "ProcessJudicialCase"(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('OPEN','SUSPENDED','CLOSED','RECLASSIFIED')),
  "effectiveAt" TIMESTAMP(3) NOT NULL, reason TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id), "documentHash" TEXT NOT NULL,
  snapshot JSONB NOT NULL, "actorUsuarioId" TEXT NOT NULL REFERENCES "Usuario"(id),
  "idempotencyKey" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProcessJudicialCaseEvent_caseId_version_key" ON "ProcessJudicialCaseEvent" ("caseId",version);
CREATE FUNCTION process_judicial_case_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Registro judicial preserva identificação e histórico'; END IF;
  IF TG_TABLE_NAME='ProcessJudicialCaseEvent' THEN
    IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Andamento judicial é aditivo e imutável'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "ProcessJudicialCase" c JOIN "DocumentVersion" v ON v.id=NEW."documentVersionId" JOIN "ProcessDocument" d ON d."processId"=c."processId" AND d."documentId"=v."documentId" WHERE c.id=NEW."caseId" AND c.version=NEW.version AND c.status=NEW.status AND v."hashSha256"=NEW."documentHash" AND v.status IN ('FINAL','SIGNED')) THEN RAISE EXCEPTION 'Andamento judicial exige versão atual e evidência GED anexada ao processo'; END IF;
  ELSE
    IF TG_OP='UPDATE' AND (to_jsonb(OLD)-ARRAY['status','version','updatedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','version','updatedAt']) THEN RAISE EXCEPTION 'Identificação judicial/ente/UG são imutáveis'; END IF;
    IF TG_OP='UPDATE' AND NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Andamento judicial exige versão sucessiva'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "PlanningEntityUnit" u WHERE u."budgetUnitId"=NEW."budgetUnitId" AND u."governmentEntityId"=NEW."governmentEntityId") THEN RAISE EXCEPTION 'Registro judicial exige UG do mesmo ente'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ProcessJudicialCase_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "ProcessJudicialCase" FOR EACH ROW EXECUTE FUNCTION process_judicial_case_integrity();
CREATE TRIGGER "ProcessJudicialCaseEvent_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "ProcessJudicialCaseEvent" FOR EACH ROW EXECUTE FUNCTION process_judicial_case_integrity();
CREATE FUNCTION process_judicial_case_event_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ProcessJudicialCaseEvent" e WHERE e."caseId"=NEW.id AND e.version=NEW.version AND e.status=NEW.status) THEN RAISE EXCEPTION 'Posição judicial exige andamento histórico na mesma transação'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "ProcessJudicialCase_event_required" AFTER INSERT OR UPDATE ON "ProcessJudicialCase" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION process_judicial_case_event_required();
