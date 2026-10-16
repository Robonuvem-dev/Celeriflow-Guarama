CREATE TABLE "ConstructionDocumentTemplateVersion" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "title" TEXT NOT NULL, "body" TEXT NOT NULL, "stamp" TEXT NOT NULL,
 "signaturePolicy" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ConstructionDocumentTemplateVersion_kind_version_key" UNIQUE ("kind", "version"),
 CHECK ("kind" IN ('VIABILITY','PERMIT','OCCUPANCY')),
 CHECK ("signaturePolicy" IN ('INTERNAL_ALLOWED','ICP_REQUIRED')),
 CHECK ("version" > 0)
);
CREATE TABLE "ConstructionIssuedDocument" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
 "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "processId" TEXT NOT NULL REFERENCES "Process"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL, "year" INTEGER NOT NULL, "sequence" INTEGER NOT NULL,
 "number" TEXT NOT NULL UNIQUE,
 "templateVersionId" TEXT NOT NULL REFERENCES "ConstructionDocumentTemplateVersion"("id") ON DELETE RESTRICT,
 "templateSnapshot" JSONB NOT NULL,
 "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"("id") ON DELETE RESTRICT,
 "documentVersionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
 "fileUrl" TEXT NOT NULL, "hashSha256" TEXT NOT NULL, "backupPath" TEXT NOT NULL,
 "validationCode" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL DEFAULT 'ISSUED',
 "sourceIssuedDocumentId" TEXT REFERENCES "ConstructionIssuedDocument"("id") ON DELETE RESTRICT,
 "requestType" TEXT NOT NULL DEFAULT 'INITIAL', "completionId" TEXT, "validUntil" TIMESTAMP(3),
 "publishedAt" TIMESTAMP(3), "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ConstructionIssuedDocument_kind_year_sequence_key" UNIQUE("kind","year","sequence"),
 CHECK ("kind" IN ('VIABILITY','PERMIT','OCCUPANCY')),
 CHECK ("status" IN ('ISSUED','PUBLISHED','SUPERSEDED')),
 CHECK ("sequence" > 0), CHECK ("requestType" IN ('INITIAL','CORRECTION','RENEWAL'))
);
CREATE INDEX "ConstructionIssuedDocument_caseId_kind_status_idx" ON "ConstructionIssuedDocument"("caseId","kind","status");
CREATE TABLE "ConstructionDocumentRequest" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
 "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "sourceIssuedDocumentId" TEXT NOT NULL REFERENCES "ConstructionIssuedDocument"("id") ON DELETE RESTRICT,
 "type" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "identityId" TEXT REFERENCES "ConstructionPortalIdentity"("id") ON DELETE RESTRICT,
 "createdBy" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "issuedDocumentId" TEXT UNIQUE REFERENCES "ConstructionIssuedDocument"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("type" IN ('CORRECTION','RENEWAL')), CHECK ("status" IN ('PENDING','FULFILLED'))
);
CREATE INDEX "ConstructionDocumentRequest_caseId_status_idx" ON "ConstructionDocumentRequest"("caseId","status");
CREATE TABLE "ConstructionPdfAnnotation" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
 "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
 "documentId" TEXT NOT NULL REFERENCES "Document"("id") ON DELETE RESTRICT,
 "sourceVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
 "revisionVersionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
 "originalHash" TEXT NOT NULL, "revisionHash" TEXT NOT NULL,
 "annotations" JSONB NOT NULL, "backupPath" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConstructionPdfAnnotation_caseId_documentId_idx" ON "ConstructionPdfAnnotation"("caseId","documentId");
