CREATE TABLE "ConstructionExternalApplication" (
  "id" TEXT NOT NULL PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
  "identityId" TEXT NOT NULL REFERENCES "ConstructionPortalIdentity"("id") ON DELETE RESTRICT,
  "personId" TEXT REFERENCES "Person"("id") ON DELETE RESTRICT,
  "companyId" TEXT REFERENCES "Company"("id") ON DELETE RESTRICT,
  "propertyIds" TEXT[] NOT NULL, "subjectIds" TEXT[] NOT NULL,
  "authorizationReason" TEXT NOT NULL,
  "authorizedBy" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "revokedReason" TEXT,
  "caseId" TEXT UNIQUE REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionExternalApplication_interested_check" CHECK (("personId" IS NULL) <> ("companyId" IS NULL)),
  CONSTRAINT "ConstructionExternalApplication_scope_check" CHECK (cardinality("propertyIds") > 0 AND cardinality("subjectIds") > 0)
);
CREATE INDEX "ConstructionExternalApplication_identityId_expiresAt_idx" ON "ConstructionExternalApplication"("identityId", "expiresAt");
CREATE TABLE "ConstructionExternalDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "applicationId" TEXT NOT NULL REFERENCES "ConstructionExternalApplication"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL UNIQUE, "label" TEXT NOT NULL,
  "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"("id") ON DELETE RESTRICT,
  "documentVersionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
  "hashSha256" TEXT NOT NULL, "filename" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConstructionExternalDocument_applicationId_label_idx" ON "ConstructionExternalDocument"("applicationId", "label");
CREATE TABLE "ConstructionServiceRequest" (
  "id" TEXT NOT NULL PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
  "caseId" TEXT NOT NULL REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
  "identityId" TEXT NOT NULL REFERENCES "ConstructionPortalIdentity"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "revision" INTEGER NOT NULL,
  "notes" TEXT NOT NULL, "payload" JSONB NOT NULL, "evidenceSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3), "resolvedBy" TEXT REFERENCES "Usuario"("id") ON DELETE RESTRICT, "resolution" TEXT,
  CONSTRAINT "ConstructionServiceRequest_kind_check" CHECK ("kind" IN ('READJUSTMENT','CORRECTION','DOCUMENT_CORRECTION','RENEWAL','INSPECTION','START','COMPLETION')),
  CONSTRAINT "ConstructionServiceRequest_status_check" CHECK ("status" IN ('PENDING','RESUBMITTED','ACCEPTED','REJECTED'))
);
CREATE INDEX "ConstructionServiceRequest_caseId_status_createdAt_idx" ON "ConstructionServiceRequest"("caseId", "status", "createdAt");
CREATE INDEX "ConstructionServiceRequest_identityId_createdAt_idx" ON "ConstructionServiceRequest"("identityId", "createdAt");
