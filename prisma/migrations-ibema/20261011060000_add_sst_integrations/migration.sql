CREATE TABLE "SstEsocialConfiguration" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "environment" TEXT NOT NULL CHECK ("environment" IN ('RESTRICTED','PRODUCTION')),
 "version" INTEGER NOT NULL CHECK ("version">0), "employerRegistration" TEXT NOT NULL,
 "credentialReference" TEXT NOT NULL CHECK ("credentialReference" ~ '^[A-Z][A-Z0-9_]{2,80}$'),
 "providerReference" TEXT NOT NULL CHECK ("providerReference" ~ '^[A-Z][A-Z0-9_]{2,80}$'),
 "layout" TEXT NOT NULL, "submissionKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("budgetUnitId","environment","version"), UNIQUE ("budgetUnitId","submissionKey")
);
CREATE TABLE "SstEsocialEvent" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "employeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('S2220','S2210','S2240')),
 "environment" TEXT NOT NULL CHECK ("environment" IN ('RESTRICTED','PRODUCTION')),
 "sourceId" TEXT NOT NULL, "sourceVersion" TEXT NOT NULL, "sourceHash" TEXT NOT NULL,
 "sourceSnapshot" JSONB NOT NULL, "missingFields" JSONB NOT NULL CHECK (jsonb_typeof("missingFields")='array'),
 "configurationId" TEXT REFERENCES "SstEsocialConfiguration"("id") ON DELETE RESTRICT,
 "configurationKey" TEXT NOT NULL CHECK ("configurationKey"=COALESCE("configurationId",'UNCONFIGURED')),
 "layout" TEXT NOT NULL, "submissionKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("budgetUnitId","submissionKey"), CONSTRAINT "SstEsocialEvent_source_config_key" UNIQUE ("budgetUnitId","kind","environment","sourceId","sourceHash","configurationKey")
);
CREATE INDEX "SstEsocialEvent_budgetUnitId_createdAt_id_idx" ON "SstEsocialEvent" ("budgetUnitId","createdAt","id");
CREATE TABLE "SstEsocialAttempt" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL UNIQUE REFERENCES "SstEsocialEvent"("id") ON DELETE RESTRICT,
 "signedXml" TEXT NOT NULL, "xmlHash" TEXT NOT NULL CHECK ("xmlHash" ~ '^[a-f0-9]{64}$'),
 "eventXmlId" TEXT NOT NULL, "certificateFingerprint" TEXT NOT NULL,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "SstEsocialEvidence" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL REFERENCES "SstEsocialEvent"("id") ON DELETE RESTRICT,
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0),
 "environment" TEXT NOT NULL CHECK ("environment" IN ('RESTRICTED','PRODUCTION')),
 "status" TEXT NOT NULL CHECK ("status" IN ('PROCESSING','ACCEPTED','REJECTED')),
 "signedXml" TEXT NOT NULL, "xmlHash" TEXT NOT NULL CHECK ("xmlHash" ~ '^[a-f0-9]{64}$'),
 "eventXmlId" TEXT NOT NULL, "certificateFingerprint" TEXT NOT NULL,
 "responseXml" TEXT NOT NULL, "responseHash" TEXT NOT NULL CHECK ("responseHash" ~ '^[a-f0-9]{64}$'),
 "endpoint" TEXT NOT NULL CHECK ("endpoint" LIKE 'https://%'), "correlationId" TEXT NOT NULL,
 "protocol" TEXT NOT NULL CHECK (length("protocol")>0), "receipt" TEXT,
 "rejectionCodes" JSONB NOT NULL CHECK (jsonb_typeof("rejectionCodes")='array'),
 "processedAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("eventId","responseHash"), UNIQUE ("eventId","revision"), CHECK ("processedAt" <= "receivedAt"),
 CHECK (("status"='ACCEPTED' AND "receipt" IS NOT NULL AND length("receipt")>0 AND jsonb_array_length("rejectionCodes")=0) OR ("status"<>'ACCEPTED' AND "receipt" IS NULL)),
 CHECK ("status"<>'REJECTED' OR jsonb_array_length("rejectionCodes")>0)
);
CREATE INDEX "SstEsocialEvidence_eventId_receivedAt_id_idx" ON "SstEsocialEvidence" ("eventId","receivedAt","id");
CREATE FUNCTION sst_esocial_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SST eSocial provenance/evidence is immutable'; END $$;
CREATE TRIGGER "sst_esocial_config_immutable" BEFORE UPDATE OR DELETE ON "SstEsocialConfiguration" FOR EACH ROW EXECUTE FUNCTION sst_esocial_immutable();
CREATE TRIGGER "sst_esocial_event_immutable" BEFORE UPDATE OR DELETE ON "SstEsocialEvent" FOR EACH ROW EXECUTE FUNCTION sst_esocial_immutable();
CREATE TRIGGER "sst_esocial_evidence_immutable" BEFORE UPDATE OR DELETE ON "SstEsocialEvidence" FOR EACH ROW EXECUTE FUNCTION sst_esocial_immutable();
CREATE TRIGGER "sst_esocial_attempt_immutable" BEFORE UPDATE OR DELETE ON "SstEsocialAttempt" FOR EACH ROW EXECUTE FUNCTION sst_esocial_immutable();
CREATE FUNCTION sst_esocial_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "SstEsocialEvent"; previous "SstEsocialEvidence";
BEGIN
 SELECT * INTO parent FROM "SstEsocialEvent" WHERE id=NEW."eventId" FOR UPDATE;
 IF parent."environment"<>NEW."environment" OR jsonb_array_length(parent."missingFields")>0 OR parent."configurationId" IS NULL THEN RAISE EXCEPTION 'Incomplete source or environment mismatch'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "SstEsocialAttempt" a WHERE a."eventId"=NEW."eventId" AND a."xmlHash"=NEW."xmlHash" AND a."signedXml"=NEW."signedXml" AND a."eventXmlId"=NEW."eventXmlId" AND a."certificateFingerprint"=NEW."certificateFingerprint") THEN RAISE EXCEPTION 'Evidence without matching signed transmission attempt'; END IF;
 SELECT * INTO previous FROM "SstEsocialEvidence" WHERE "eventId"=NEW."eventId" ORDER BY revision DESC LIMIT 1;
 NEW.revision := COALESCE(previous.revision,0)+1;
 IF previous.id IS NOT NULL AND (previous.status<>'PROCESSING' OR previous.protocol<>NEW.protocol OR previous."xmlHash"<>NEW."xmlHash" OR previous."eventXmlId"<>NEW."eventXmlId" OR previous."receivedAt">NEW."receivedAt") THEN RAISE EXCEPTION 'Invalid eSocial evidence transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "sst_esocial_binding" BEFORE INSERT ON "SstEsocialEvidence" FOR EACH ROW EXECUTE FUNCTION sst_esocial_binding();
CREATE FUNCTION sst_esocial_config_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."configurationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "SstEsocialConfiguration" c WHERE c.id=NEW."configurationId" AND c."budgetUnitId"=NEW."budgetUnitId" AND c.environment=NEW.environment AND c.layout=NEW.layout) THEN RAISE EXCEPTION 'Configuration scope/environment mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "sst_esocial_config_binding" BEFORE INSERT ON "SstEsocialEvent" FOR EACH ROW EXECUTE FUNCTION sst_esocial_config_binding();
CREATE TABLE "SstClosureEmission" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('PPP','FUNCTIONAL')),
 "startsAt" DATE NOT NULL, "endsAt" DATE NOT NULL CHECK ("endsAt">"startsAt"),
 "snapshot" JSONB NOT NULL, "contentHash" TEXT NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SstClosureEmission_budgetUnitId_employeeId_createdAt_id_idx" ON "SstClosureEmission" ("budgetUnitId","employeeId","createdAt","id");
CREATE TRIGGER "sst_closure_emission_immutable" BEFORE UPDATE OR DELETE ON "SstClosureEmission" FOR EACH ROW EXECUTE FUNCTION sst_esocial_immutable();
