CREATE TABLE "ProcessReferenceCatalog" (
  "id" text PRIMARY KEY,
  "kind" text NOT NULL CHECK ("kind" IN ('SUBJECT_CHILD','PHYSICAL_LOCATION','REQUIRED_DOCUMENT','JUSTIFICATION','REQUEST_METHOD')),
  "name" text NOT NULL CHECK (length(trim("name")) BETWEEN 1 AND 200),
  "description" text,
  "subjectId" text REFERENCES "Subject"("id"),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("kind" <> 'SUBJECT_CHILD' OR "subjectId" IS NOT NULL)
);
CREATE UNIQUE INDEX "ProcessReferenceCatalog_kind_parent_name_key" ON "ProcessReferenceCatalog" ("kind", COALESCE("subjectId", ''), lower(trim("name")));
