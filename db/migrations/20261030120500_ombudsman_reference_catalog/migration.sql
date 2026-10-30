CREATE TABLE "OmbudsmanReferenceCatalog" (
 "id" text PRIMARY KEY,
 "kind" text NOT NULL CHECK ("kind" IN ('SUBJECT','SUBSUBJECT','JUSTIFICATION')),
 "requestType" text NOT NULL CHECK ("requestType" IN ('Denúncia','Reclamação','Sugestão','Elogio')),
 "name" text NOT NULL CHECK (length(trim("name")) BETWEEN 1 AND 200),
 "subjectId" text REFERENCES "OmbudsmanReferenceCatalog"("id"),
 "subsubjectId" text REFERENCES "OmbudsmanReferenceCatalog"("id"),
 "isActive" boolean NOT NULL DEFAULT true,
 CHECK ("kind" = 'SUBJECT' OR "subjectId" IS NOT NULL),
 CHECK ("kind" <> 'JUSTIFICATION' OR "subsubjectId" IS NOT NULL)
);
CREATE UNIQUE INDEX "OmbudsmanReferenceCatalog_kind_parent_name_key" ON "OmbudsmanReferenceCatalog" ("kind", "requestType", COALESCE("subjectId", ''), COALESCE("subsubjectId", ''), lower(trim("name")));
