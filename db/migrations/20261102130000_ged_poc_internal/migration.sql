-- GED POC phases 1–9. Additive; original bytes and signature evidence are retained.
-- Scheduled after the integrated Social and CF10 migrations through 20261102120000.
CREATE TABLE "GedTypeDefinition" (
  id TEXT PRIMARY KEY, "classId" TEXT NOT NULL REFERENCES "DocumentClass"(id), version INTEGER NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]', policy JSONB NOT NULL DEFAULT '{}', "createdById" TEXT NOT NULL REFERENCES "Usuario"(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE("classId",version)
);
CREATE TABLE "GedMetadata" (
  "documentId" TEXT PRIMARY KEY REFERENCES "GedEntry"("documentId"), "definitionId" TEXT REFERENCES "GedTypeDefinition"(id),
  "values" JSONB NOT NULL DEFAULT '{}', tags JSONB NOT NULL DEFAULT '[]', "validUntil" TIMESTAMPTZ,
  "responsibleId" TEXT REFERENCES "Usuario"(id), "alertDays" INTEGER NOT NULL DEFAULT 30 CHECK("alertDays">=0),
  "deletedAt" TIMESTAMPTZ, "purgedAt" TIMESTAMPTZ, "inheritAccess" BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE "GedMetadata" ADD COLUMN "lastAlertedUntil" TIMESTAMPTZ;
CREATE TABLE "GedGroup" (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE "GedGroupMember" ("groupId" TEXT NOT NULL REFERENCES "GedGroup"(id) ON DELETE CASCADE, "userId" TEXT NOT NULL REFERENCES "Usuario"(id), PRIMARY KEY("groupId","userId"));
CREATE TABLE "GedAcl" (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('document','folder')), "objectId" TEXT NOT NULL,
  principal TEXT NOT NULL CHECK(principal IN ('user','group','profile')), "principalId" TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('read','import','edit','review','delete','share')),
  effect TEXT NOT NULL CHECK(effect IN ('allow','deny')), UNIQUE(kind,"objectId",principal,"principalId",operation)
);
CREATE INDEX "GedAcl_object_idx" ON "GedAcl"(kind,"objectId",operation);
ALTER TABLE "GedFolderAccess" ADD COLUMN "inheritAccess" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "GedActivity" (id TEXT PRIMARY KEY, "documentId" TEXT REFERENCES "GedEntry"("documentId"), "actorId" TEXT NOT NULL REFERENCES "Usuario"(id), kind TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX "GedActivity_document_idx" ON "GedActivity"("documentId","createdAt");
CREATE TABLE "GedFavorite" ("documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), "userId" TEXT NOT NULL REFERENCES "Usuario"(id), PRIMARY KEY("documentId","userId"));
CREATE TABLE "GedComment" (id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), "userId" TEXT NOT NULL REFERENCES "Usuario"(id), text TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE "GedPreference" ("userId" TEXT PRIMARY KEY REFERENCES "Usuario"(id), settings JSONB NOT NULL DEFAULT '{}');
CREATE TABLE "GedArtifact" (id TEXT PRIMARY KEY, "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id), kind TEXT NOT NULL, url TEXT NOT NULL, pathname TEXT NOT NULL, hash TEXT NOT NULL, "mimeType" TEXT NOT NULL, report JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE("versionId",kind));
CREATE TABLE "GedEmbedding" ("versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id), page INTEGER NOT NULL, model TEXT NOT NULL, vector JSONB NOT NULL, PRIMARY KEY("versionId",page));
CREATE TABLE "GedFlowDefinition" (id TEXT PRIMARY KEY, key TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, graph JSONB NOT NULL, published BOOLEAN NOT NULL DEFAULT false, "adoptOnAccess" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT NOT NULL REFERENCES "Usuario"(id), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(key,version));
CREATE TABLE "GedFlowRun" (id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id), "definitionId" TEXT NOT NULL REFERENCES "GedFlowDefinition"(id), "nodeId" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', "dueAt" TIMESTAMPTZ NOT NULL, "createdById" TEXT NOT NULL REFERENCES "Usuario"(id), "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX "GedFlowRun_active_key" ON "GedFlowRun"("documentId") WHERE status='ACTIVE';
CREATE TABLE "GedFlowDecision" (id TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "GedFlowRun"(id), "nodeId" TEXT NOT NULL, "userId" TEXT NOT NULL REFERENCES "Usuario"(id), decision TEXT NOT NULL, comment TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE("runId","nodeId","userId"));
CREATE TABLE "GedRule" (id TEXT PRIMARY KEY, name TEXT NOT NULL, event TEXT NOT NULL, conditions JSONB NOT NULL, actions JSONB NOT NULL, active BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL REFERENCES "Usuario"(id));
CREATE TABLE "GedRuleExecution" ("ruleId" TEXT NOT NULL REFERENCES "GedRule"(id), "eventId" TEXT NOT NULL, definition JSONB NOT NULL, status TEXT NOT NULL, error TEXT, "leaseUntil" TIMESTAMPTZ NOT NULL DEFAULT now()+interval '5 minutes', PRIMARY KEY("ruleId","eventId"));
CREATE TABLE "GedRuleVersion" (id TEXT PRIMARY KEY, "ruleId" TEXT NOT NULL REFERENCES "GedRule"(id), version INTEGER NOT NULL, definition JSONB NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE("ruleId",version));
CREATE TABLE "GedRuleActionResult" ("ruleId" TEXT NOT NULL REFERENCES "GedRule"(id), "eventId" TEXT NOT NULL, position INTEGER NOT NULL, status TEXT NOT NULL, error TEXT, PRIMARY KEY("ruleId","eventId",position));
CREATE TABLE "GedEventQueue" (id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), event TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, "leaseUntil" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE "GedTask" (id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), "userId" TEXT NOT NULL REFERENCES "Usuario"(id), title TEXT NOT NULL, "dueAt" TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', "dedupeKey" TEXT UNIQUE);
CREATE TABLE "GedCalendarEvent" (id TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "Usuario"(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', "startsAt" TIMESTAMPTZ NOT NULL, "endsAt" TIMESTAMPTZ NOT NULL, timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo', "documentId" TEXT REFERENCES "GedEntry"("documentId"), CHECK("endsAt">"startsAt"));
ALTER TABLE "GedCalendarEvent" ADD COLUMN participants JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "GedMailIntent" (id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), "recipientId" TEXT NOT NULL REFERENCES "Usuario"(id), subject TEXT NOT NULL, body TEXT NOT NULL, "dedupeKey" TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE "GedPublicationLink" ("publicationId" TEXT PRIMARY KEY REFERENCES "TransparencyPublication"(id), "documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id));
CREATE TABLE "GedIntegrationLink" ("documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), module TEXT NOT NULL, "sourceId" TEXT NOT NULL, PRIMARY KEY("documentId",module,"sourceId"));
CREATE TABLE "GedSourceImport" (module TEXT NOT NULL, "sourceId" TEXT NOT NULL, "sourceVersionId" TEXT NOT NULL, "uploadId" TEXT NOT NULL UNIQUE, "ownerId" TEXT NOT NULL REFERENCES "Usuario"(id), fingerprint TEXT NOT NULL, "documentId" TEXT REFERENCES "GedEntry"("documentId"), PRIMARY KEY(module,"sourceId","sourceVersionId"));
CREATE TABLE "GedSetting" (key TEXT PRIMARY KEY, value JSONB NOT NULL);
CREATE TABLE "GedDisposal" (id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES "GedEntry"("documentId"), url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', error TEXT);
ALTER TABLE "GedProcessingJob" ADD COLUMN "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "GedProcessingJob" ADD COLUMN steps JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "GedUpload" ADD COLUMN "indexValues" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "GedUpload" ADD COLUMN "definitionId" TEXT REFERENCES "GedTypeDefinition"(id);
ALTER TABLE "GedTextPage" ADD COLUMN words JSONB NOT NULL DEFAULT '[]';

CREATE FUNCTION ged_normalize(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT translate(lower(coalesce(value,'')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
$$;
-- Trigram Dice similarity implemented without requiring an extension in managed databases.
CREATE FUNCTION ged_similarity(a TEXT,b TEXT) RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 WITH x AS (SELECT DISTINCT substr('  '||ged_normalize(a)||' ',i,3) t FROM generate_series(1,length(a)+1) i),
 y AS (SELECT DISTINCT substr('  '||ged_normalize(b)||' ',i,3) t FROM generate_series(1,length(b)+1) i)
 SELECT coalesce(2.0*(SELECT count(*) FROM x JOIN y USING(t))/nullif((SELECT count(*) FROM x)+(SELECT count(*) FROM y),0),0)::double precision
$$;
CREATE FUNCTION ged_cosine(a JSONB,b JSONB) RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN jsonb_array_length(a)<>jsonb_array_length(b) THEN 0 ELSE coalesce(sum(x.v::float8*y.v::float8)/nullif(sqrt(sum(power(x.v::float8,2))*sum(power(y.v::float8,2))),0),0) END
 FROM jsonb_array_elements_text(a) WITH ORDINALITY x(v,i) JOIN jsonb_array_elements_text(b) WITH ORDINALITY y(v,i) USING(i)
$$;

-- Explicit deny wins. Breaking inheritance stops ancestors; a document override
-- also suppresses the legacy department fallback. Owner retains no implicit bypass.
CREATE FUNCTION ged_access(k TEXT,obj TEXT,uid TEXT,dept TEXT,profiles JSONB,op TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 WITH RECURSIVE base AS (
 SELECT d."folderId" folder, e."ownerId" owner,e."departmentId" department,coalesce(m."inheritAccess",true) inherit
 FROM "Document" d JOIN "GedEntry" e ON e."documentId"=d.id LEFT JOIN "GedMetadata" m ON m."documentId"=d.id WHERE k='document' AND d.id=obj
 UNION ALL SELECT f.id,a."ownerId",a."departmentId",a."inheritAccess" FROM "Folder" f JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE k='folder' AND f.id=obj
 ), ancestors AS (
 SELECT f.id,f."parentId",a."inheritAccess" inherit FROM base b JOIN "Folder" f ON f.id=b.folder JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE b.inherit
 UNION ALL SELECT f.id,f."parentId",a."inheritAccess" FROM ancestors p JOIN "Folder" f ON f.id=p."parentId" JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE p.inherit
 ), matched AS (
 SELECT acl.effect FROM "GedAcl" acl WHERE acl.operation=op AND
 ((acl.kind=k AND acl."objectId"=obj) OR (acl.kind='folder' AND acl."objectId" IN (SELECT id FROM ancestors))) AND
 ((acl.principal='user' AND acl."principalId"=uid) OR (acl.principal='profile' AND profiles ? acl."principalId") OR
 (acl.principal='group' AND EXISTS(SELECT 1 FROM "GedGroupMember" gm JOIN "GedGroup" g ON g.id=gm."groupId" AND g.active WHERE gm."groupId"=acl."principalId" AND gm."userId"=uid)))
 ) SELECT EXISTS(SELECT 1 FROM base) AND NOT EXISTS(SELECT 1 FROM matched WHERE effect='deny') AND (
 EXISTS(SELECT 1 FROM matched WHERE effect='allow') OR EXISTS(SELECT 1 FROM base WHERE owner=uid OR (inherit AND department IS NOT NULL AND department=dept)) OR
 (k='document' AND op IN ('read','review') AND EXISTS(SELECT 1 FROM "GedReview" r WHERE r."documentId"=obj AND r.status='ACTIVE' AND r.assignments @> jsonb_build_object((ARRAY['ELABORACAO','CONSENSO','APROVACAO','HOMOLOGACAO'])[r.stage+1],jsonb_build_array(uid)))) OR
 (k='document' AND op IN ('read','review') AND EXISTS(SELECT 1 FROM "GedFlowRun" r JOIN "GedFlowDefinition" f ON f.id=r."definitionId",jsonb_array_elements(f.graph->'nodes') n WHERE r."documentId"=obj AND r.status='ACTIVE' AND n->>'id'=r."nodeId" AND (n->'users') ? uid))
 )
$$;
