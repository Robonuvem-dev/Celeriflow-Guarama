CREATE TABLE "HrRoleLegalHistory" (
  id TEXT PRIMARY KEY, "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"(id),
  "roleId" TEXT NOT NULL REFERENCES "Role"(id), "effectiveFrom" TIMESTAMP(3) NOT NULL,
  version INTEGER NOT NULL CHECK (version>0), state TEXT NOT NULL CHECK (state IN ('EXISTING','EXTINGUISHED')),
  designation TEXT NOT NULL, "authorizedSeats" INTEGER NOT NULL CHECK ("authorizedSeats">=0),
  "legalReference" TEXT NOT NULL, "legalTextVersionId" TEXT NOT NULL REFERENCES "LegalTextVersion"(id),
  "documentId" TEXT NOT NULL REFERENCES "Document"(id), "documentVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id),
  "documentHash" TEXT NOT NULL CHECK ("documentHash" ~ '^[a-fA-F0-9]{64}$'), "documentFileUrl" TEXT NOT NULL,
  reason TEXT NOT NULL, rectification BOOLEAN NOT NULL DEFAULT FALSE,
  "previousEventId" TEXT REFERENCES "HrRoleLegalHistory"(id), "actorUsuarioId" TEXT NOT NULL REFERENCES "Usuario"(id),
  "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (state<>'EXTINGUISHED' OR "authorizedSeats"=0)
);
CREATE UNIQUE INDEX "HrRoleLegalHistory_previousEventId_key" ON "HrRoleLegalHistory" ("previousEventId");
CREATE UNIQUE INDEX "HrRoleLegalHistory_governmentEntityId_roleId_version_key" ON "HrRoleLegalHistory" ("governmentEntityId","roleId",version);
CREATE UNIQUE INDEX "HrRoleLegalHistory_governmentEntityId_idempotencyKey_key" ON "HrRoleLegalHistory" ("governmentEntityId","idempotencyKey");
CREATE INDEX "HrRoleLegalHistory_governmentEntityId_roleId_effectiveFrom_version_idx" ON "HrRoleLegalHistory" ("governmentEntityId","roleId","effectiveFrom",version);
CREATE FUNCTION hr_role_legal_history_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior "HrRoleLegalHistory"%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Histórico legal de cargos é aditivo e imutável'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('HR_ROLE_LEGAL:' || NEW."governmentEntityId" || ':' || NEW."roleId",0));
  SELECT * INTO prior FROM "HrRoleLegalHistory" WHERE "governmentEntityId"=NEW."governmentEntityId" AND "roleId"=NEW."roleId" ORDER BY version DESC LIMIT 1;
  IF prior.id IS NULL THEN
    IF NEW.version<>1 OR NEW."previousEventId" IS NOT NULL OR NEW.rectification THEN RAISE EXCEPTION 'Posição legal inicial inválida'; END IF;
  ELSE
    IF NEW.version<>prior.version+1 OR NEW."previousEventId" IS DISTINCT FROM prior.id OR (NEW.rectification AND NEW."effectiveFrom"<>prior."effectiveFrom") OR (NOT NEW.rectification AND NEW."effectiveFrom"<=prior."effectiveFrom") THEN RAISE EXCEPTION 'Edição legal deve suceder a última posição sem reescrever vigências'; END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Document" d JOIN "DocumentVersion" v ON v."documentId"=d.id
    JOIN "LegalTextVersion" l ON l."documentId"=d.id JOIN "LegalText" t ON t.id=l."legalTextId"
    WHERE d.id=NEW."documentId" AND d.status='Válido' AND v.id=NEW."documentVersionId"
      AND v.status IN ('FINAL','SIGNED') AND v."hashSha256"=NEW."documentHash" AND v."fileUrl"=NEW."documentFileUrl"
      AND l.id=NEW."legalTextVersionId" AND t."governmentEntityId"=NEW."governmentEntityId"
  ) THEN RAISE EXCEPTION 'Ato legal exige versão GED final/hash vinculada à legislação do mesmo ente'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "HrRoleLegalHistory_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "HrRoleLegalHistory" FOR EACH ROW EXECUTE FUNCTION hr_role_legal_history_integrity();
