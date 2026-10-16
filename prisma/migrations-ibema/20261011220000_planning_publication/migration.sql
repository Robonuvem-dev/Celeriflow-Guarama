CREATE TABLE "PlanningReportPublication" (
 id TEXT PRIMARY KEY, "snapshotId" TEXT NOT NULL REFERENCES "PlanningReportSnapshot"(id) ON DELETE RESTRICT,
 format TEXT NOT NULL CHECK(format IN ('PDF','CSV')), "publicKey" TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ARCHIVING','FAILED','PUBLISHED','WITHDRAWN')),
 "fileUrl" TEXT, "fileHash" TEXT, filename TEXT NOT NULL, "contentType" TEXT NOT NULL, title TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'REVIEW_COPY' CHECK(kind='REVIEW_COPY'), "requestedById" TEXT NOT NULL, reason TEXT NOT NULL,
 "publishedAt" TIMESTAMP(3), "withdrawnAt" TIMESTAMP(3), "lastError" TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE("snapshotId",format),
 CHECK(status<>'PUBLISHED' OR ("fileUrl" IS NOT NULL AND "fileHash" ~ '^[0-9a-f]{64}$' AND "publishedAt" IS NOT NULL))
);
CREATE INDEX "PlanningReportPublication_status_publishedAt_idx" ON "PlanningReportPublication"(status,"publishedAt");
CREATE TABLE "PlanningPublicationEvent" (id TEXT PRIMARY KEY, "publicationId" TEXT NOT NULL REFERENCES "PlanningReportPublication"(id) ON DELETE RESTRICT, type TEXT NOT NULL, "actorId" TEXT NOT NULL, payload JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "PlanningPublicationEvent_publicationId_createdAt_idx" ON "PlanningPublicationEvent"("publicationId","createdAt");
CREATE TRIGGER planning_publication_event_immutable BEFORE UPDATE OR DELETE ON "PlanningPublicationEvent" FOR EACH ROW EXECUTE FUNCTION planning_movement_immutable();
CREATE FUNCTION planning_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Planning publication evidence is immutable'; END IF;
 IF (NEW."snapshotId",NEW.format,NEW."publicKey",NEW.filename,NEW."contentType",NEW.title,NEW.kind,NEW."requestedById",NEW.reason,NEW."createdAt") IS DISTINCT FROM (OLD."snapshotId",OLD.format,OLD."publicKey",OLD.filename,OLD."contentType",OLD.title,OLD.kind,OLD."requestedById",OLD.reason,OLD."createdAt") THEN RAISE EXCEPTION 'Planning publication identity is immutable'; END IF;
 IF OLD."fileHash" IS NOT NULL AND (NEW."fileHash",NEW."fileUrl") IS DISTINCT FROM (OLD."fileHash",OLD."fileUrl") THEN RAISE EXCEPTION 'Archived planning file is immutable'; END IF;
 IF OLD.status='WITHDRAWN' AND NEW.status<>'WITHDRAWN' THEN RAISE EXCEPTION 'Withdrawn planning publication cannot be silently republished'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER planning_publication_identity BEFORE UPDATE OR DELETE ON "PlanningReportPublication" FOR EACH ROW EXECUTE FUNCTION planning_publication_guard();
