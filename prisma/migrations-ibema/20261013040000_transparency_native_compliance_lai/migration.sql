CREATE TABLE "TransparencyNativeBinding" (
 "id" TEXT PRIMARY KEY, "publicKey" TEXT NOT NULL, "collectionSlug" TEXT NOT NULL,
 "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
 "governmentEntityId" TEXT NOT NULL REFERENCES "GovernmentEntity"("id") ON DELETE RESTRICT,
 "enabled" BOOLEAN NOT NULL DEFAULT true, "sourceReference" TEXT NOT NULL, "details" JSONB NOT NULL,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TransparencyNativeBinding_publicKey_key" ON "TransparencyNativeBinding"("publicKey");
CREATE UNIQUE INDEX "TransparencyNativeBinding_collectionSlug_sourceType_sourceId_key" ON "TransparencyNativeBinding"("collectionSlug","sourceType","sourceId");
CREATE INDEX "TransparencyNativeBinding_governmentEntityId_collectionSlug_enabled_idx" ON "TransparencyNativeBinding"("governmentEntityId","collectionSlug","enabled");
CREATE TABLE "TransparencyCriterion" (
 "id" TEXT PRIMARY KEY,"cycle" INTEGER NOT NULL,"matrix" TEXT NOT NULL,"dimension" TEXT NOT NULL,"code" TEXT NOT NULL,
 "title" TEXT NOT NULL,"importance" TEXT NOT NULL,"facets" JSONB NOT NULL,"applicableEntities" JSONB NOT NULL,
 "sourceUrl" TEXT NOT NULL,"sourceHash" TEXT NOT NULL CHECK ("sourceHash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "TransparencyCriterion_cycle_dimension_code_idx" ON "TransparencyCriterion"("cycle","dimension","code");
CREATE TABLE "TransparencyCriterionEvidence" (
 "id" TEXT PRIMARY KEY,"criterionId" TEXT NOT NULL REFERENCES "TransparencyCriterion"("id") ON DELETE RESTRICT,
 "entity" TEXT NOT NULL CHECK ("entity" IN ('prefeitura','camara')),"year" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK ("status" IN ('UNVERIFIED','PARTIAL','SATISFIED','NOT_APPLICABLE')),
 "urls" JSONB NOT NULL,"notes" TEXT NOT NULL,"reviewedById" TEXT NOT NULL,"reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TransparencyCriterionEvidence_criterionId_entity_year_key" ON "TransparencyCriterionEvidence"("criterionId","entity","year");
ALTER TABLE "TransparencyCitizenRequest" ADD COLUMN "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "outcome" TEXT, ADD COLUMN "extendedAt" TIMESTAMP(3), ADD COLUMN "extensionReason" TEXT;
UPDATE "TransparencyCitizenRequest" SET "dueAt"="createdAt"+INTERVAL '20 days';
CREATE TABLE "TransparencyCitizenAppeal" (
 "id" TEXT PRIMARY KEY,"requestId" TEXT NOT NULL REFERENCES "TransparencyCitizenRequest"("id") ON DELETE RESTRICT,
 "level" INTEGER NOT NULL CHECK ("level" BETWEEN 1 AND 3),"message" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RECEBIDO',"response" TEXT,"dueAt" TIMESTAMP(3) NOT NULL,
 "respondedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TransparencyCitizenAppeal_requestId_level_key" ON "TransparencyCitizenAppeal"("requestId","level");
ALTER TABLE "TransparencyPublication" DROP CONSTRAINT "TransparencyPublication_publication_integrity";
ALTER TABLE "TransparencyPublication" ADD CONSTRAINT "TransparencyPublication_publication_integrity" CHECK (
 "status" <> 'PUBLISHED' OR ("publishedAt" IS NOT NULL AND
 ("fileUrl" IS NULL OR ("sha256" IS NOT NULL AND "sha256" ~ '^[a-f0-9]{64}$' AND "filePathname" IS NOT NULL)))
);
