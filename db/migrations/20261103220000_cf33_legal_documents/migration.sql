-- CF33 links existing legal and GED versions; no copy of files or GED catalogs.
CREATE TABLE "LegalTextDocument" (
  id TEXT PRIMARY KEY,
  "legalTextVersionId" TEXT NOT NULL REFERENCES "LegalTextVersion"(id) ON DELETE RESTRICT,
  "documentVersionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('ORIGINAL','ATTACHMENT')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 250),
  "createdById" TEXT NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("legalTextVersionId","documentVersionId")
);
CREATE UNIQUE INDEX "LegalTextDocument_original_key" ON "LegalTextDocument"("legalTextVersionId") WHERE role='ORIGINAL';
CREATE INDEX "LegalTextDocument_version_idx" ON "LegalTextDocument"("legalTextVersionId","createdAt",id);
CREATE FUNCTION cf33_preserve_legal_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legal document links are immutable; register a new legal version'; END;
$$;
CREATE TRIGGER "LegalTextDocument_immutable" BEFORE UPDATE OR DELETE ON "LegalTextDocument"
FOR EACH ROW EXECUTE FUNCTION cf33_preserve_legal_document();
