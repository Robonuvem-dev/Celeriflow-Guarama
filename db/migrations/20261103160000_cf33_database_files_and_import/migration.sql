-- CF33 33.11 (direct Word/LibreOffice storage in database with isolated blob table for query performance)
-- and 33.15 (automatic integration from existing database records without retyping).
CREATE TABLE "LegalTextDatabaseDocument" (
  id TEXT PRIMARY KEY,
  "legalTextVersionId" TEXT NOT NULL REFERENCES "LegalTextVersion"(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('ORIGINAL','ATTACHMENT')),
  filename TEXT NOT NULL CHECK (length(filename) BETWEEN 1 AND 250),
  "mimeType" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL CHECK ("byteLength" > 0 AND "byteLength" <= 20971520),
  "hashSha256" TEXT NOT NULL CHECK (length("hashSha256") = 64),
  "createdById" TEXT NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("legalTextVersionId","hashSha256")
);
CREATE UNIQUE INDEX "LegalTextDatabaseDocument_original_key" ON "LegalTextDatabaseDocument"("legalTextVersionId") WHERE role='ORIGINAL';
CREATE INDEX "LegalTextDatabaseDocument_version_idx" ON "LegalTextDatabaseDocument"("legalTextVersionId","createdAt",id);

CREATE TABLE "LegalTextDatabaseDocumentBlob" (
  "documentId" TEXT PRIMARY KEY REFERENCES "LegalTextDatabaseDocument"(id) ON DELETE RESTRICT,
  "contentBase64" TEXT NOT NULL CHECK (length("contentBase64") > 0)
);

CREATE FUNCTION cf33_preserve_legal_database_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legal database documents are immutable; register a new legal version'; END;
$$;
CREATE TRIGGER "LegalTextDatabaseDocument_immutable" BEFORE UPDATE OR DELETE ON "LegalTextDatabaseDocument"
FOR EACH ROW EXECUTE FUNCTION cf33_preserve_legal_database_document();
CREATE TRIGGER "LegalTextDatabaseDocumentBlob_immutable" BEFORE UPDATE OR DELETE ON "LegalTextDatabaseDocumentBlob"
FOR EACH ROW EXECUTE FUNCTION cf33_preserve_legal_database_document();

CREATE TABLE "LegacyLegalTextSource" (
  id TEXT PRIMARY KEY,
  "sourceApplication" TEXT NOT NULL CHECK (length("sourceApplication") BETWEEN 1 AND 120),
  "externalId" TEXT NOT NULL CHECK (length("externalId") BETWEEN 1 AND 120),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 120),
  number TEXT NOT NULL CHECK (length(number) BETWEEN 1 AND 100),
  summary TEXT NOT NULL CHECK (length(summary) > 0),
  content TEXT NOT NULL CHECK (length(content) > 0),
  "governmentLevel" TEXT NOT NULL DEFAULT 'MUNICIPAL',
  "issuingBody" TEXT NOT NULL CHECK (length("issuingBody") BETWEEN 1 AND 200),
  "publicationDate" TIMESTAMP(3),
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  "importedLegalTextId" TEXT REFERENCES "LegalText"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("sourceApplication","externalId")
);
CREATE INDEX "LegacyLegalTextSource_pending_idx" ON "LegacyLegalTextSource"("importedLegalTextId","createdAt",id);

