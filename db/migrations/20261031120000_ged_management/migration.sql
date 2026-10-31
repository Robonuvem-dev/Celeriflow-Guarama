-- Additive GED workspace. Existing document/signature IDs and evidence stay intact.
CREATE TABLE "GedEntry" (
  "documentId" TEXT PRIMARY KEY REFERENCES "Document"(id) ON DELETE RESTRICT,
  "ownerId" TEXT REFERENCES "Usuario"(id), "departmentId" TEXT,
  origin TEXT NOT NULL DEFAULT 'GED', "legacyReference" TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL, "mimeType" TEXT NOT NULL, "byteLength" INTEGER NOT NULL DEFAULT 0 CHECK ("byteLength" >= 0),
  "editorialStatus" TEXT NOT NULL DEFAULT 'RASCUNHO', archived BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "GedEntry_scope_idx" ON "GedEntry"("ownerId", "departmentId");
CREATE TABLE "GedFolderAccess" (
  "folderId" TEXT PRIMARY KEY REFERENCES "Folder"(id) ON DELETE RESTRICT,
  "ownerId" TEXT REFERENCES "Usuario"(id), "departmentId" TEXT
);
CREATE TABLE "GedUpload" (
  id TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "Usuario"(id), "batchId" TEXT NOT NULL,
  filename TEXT NOT NULL, title TEXT NOT NULL, "classCode" TEXT NOT NULL, "folderId" TEXT,
  "legacyReference" TEXT NOT NULL DEFAULT '', pathname TEXT NOT NULL UNIQUE, url TEXT,
  "documentId" TEXT REFERENCES "Document"(id), "checkinDocumentId" TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','UPLOADED','DONE','FAILED')),
  error TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "GedUpload_batch_idx" ON "GedUpload"("ownerId", "batchId");
CREATE TABLE "GedCheckout" (
  id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "Document"(id),
  "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id), "ownerId" TEXT NOT NULL REFERENCES "Usuario"(id),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "closedAt" TIMESTAMPTZ(3), comment TEXT
);
CREATE UNIQUE INDEX "GedCheckout_active_key" ON "GedCheckout"("documentId") WHERE "closedAt" IS NULL;
CREATE TABLE "GedVersionFile" (
  "versionId" TEXT PRIMARY KEY REFERENCES "DocumentVersion"(id) ON DELETE RESTRICT,
  filename TEXT NOT NULL, "mimeType" TEXT NOT NULL, "byteLength" INTEGER NOT NULL CHECK("byteLength">0),
  "authorId" TEXT NOT NULL REFERENCES "Usuario"(id), comment TEXT NOT NULL DEFAULT ''
);
CREATE TABLE "GedTextPage" (
  id TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id),
  page INTEGER NOT NULL CHECK(page > 0), text TEXT NOT NULL, normalized TEXT NOT NULL, method TEXT NOT NULL,
  zones JSONB NOT NULL DEFAULT '[]',
  search TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, normalized)) STORED,
  CONSTRAINT "GedTextPage_version_page_key" UNIQUE("versionId", page)
);
CREATE INDEX "GedTextPage_search_idx" ON "GedTextPage" USING gin(search);
CREATE TABLE "GedProcessingJob" (
  id TEXT PRIMARY KEY, "versionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0, "leaseUntil" TIMESTAMPTZ(3), "leaseToken" TEXT,
  error TEXT, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE TABLE "GedSmartFolder" (
  id TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "Usuario"(id), name TEXT NOT NULL, query JSONB NOT NULL,
  shared BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE TABLE "GedThesaurus" (id TEXT PRIMARY KEY, term TEXT NOT NULL UNIQUE, equivalents JSONB NOT NULL);
CREATE TABLE "GedReview" (
  id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "Document"(id),
  "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id), assignments JSONB NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 3), status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETURNED','COMPLETED')),
  "dueAt" TIMESTAMPTZ(3) NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"(id), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "GedReview_active_key" ON "GedReview"("documentId") WHERE status='ACTIVE';
CREATE TABLE "GedReviewDecision" (
  id TEXT PRIMARY KEY, "reviewId" TEXT NOT NULL REFERENCES "GedReview"(id), stage INTEGER NOT NULL CHECK(stage BETWEEN 0 AND 3),
  "userId" TEXT NOT NULL REFERENCES "Usuario"(id), decision TEXT NOT NULL CHECK(decision IN ('APPROVE','RETURN')),
  comment TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "GedReviewDecision_once_key" UNIQUE("reviewId", stage, "userId")
);
CREATE TABLE "GedTemplateVersion" (
  id TEXT PRIMARY KEY, "templateKey" TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), name TEXT NOT NULL,
  content TEXT NOT NULL, "sourceUrl" TEXT, "ownerId" TEXT NOT NULL REFERENCES "Usuario"(id), "departmentId" TEXT,
  markers JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "GedTemplateVersion_number_key" UNIQUE("templateKey", version)
);
CREATE TABLE "GedGeneratedDocument" (
  "documentId" TEXT PRIMARY KEY REFERENCES "Document"(id), "templateVersionId" TEXT NOT NULL REFERENCES "GedTemplateVersion"(id), values JSONB NOT NULL
);
-- Existing domain documents remain in their original authorized workflows. No
-- broad backfill grants generic GED access to clinical/process/sector documents.
UPDATE "ConfiguracaoModulo" SET nome='GED e Assinatura Digital', "updatedAt"=CURRENT_TIMESTAMP WHERE codigo='ASSINATURA_DIGITAL';
