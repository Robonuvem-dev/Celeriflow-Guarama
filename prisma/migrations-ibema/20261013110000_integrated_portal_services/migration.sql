ALTER TABLE "TransparencyCitizenRequest" ADD COLUMN "processId" TEXT;
ALTER TABLE "TransparencyCitizenRequest" ADD COLUMN "requestKeyHash" TEXT;
ALTER TABLE "TransparencyCitizenRequest" ADD COLUMN "inputHash" TEXT;
CREATE UNIQUE INDEX "TransparencyCitizenRequest_requestKeyHash_key" ON "TransparencyCitizenRequest"("requestKeyHash");
ALTER TABLE "TransparencySatisfaction" ADD COLUMN "qualityRating" INTEGER CHECK ("qualityRating" BETWEEN 1 AND 5);
ALTER TABLE "TransparencySatisfaction" ADD COLUMN "deadlineRating" INTEGER CHECK ("deadlineRating" BETWEEN 1 AND 5);
ALTER TABLE "TransparencyCitizenRequest" ADD CONSTRAINT "TransparencyCitizenRequest_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PortalServiceConfiguration" (
 "id" TEXT PRIMARY KEY, "publicServiceId" TEXT NOT NULL UNIQUE REFERENCES "PublicService"("id"),
 "slug" TEXT NOT NULL UNIQUE, "group" TEXT NOT NULL, "provider" TEXT NOT NULL, "audience" TEXT NOT NULL DEFAULT 'CIDADAO',
 "requiresLogin" BOOLEAN NOT NULL DEFAULT true, "published" BOOLEAN NOT NULL DEFAULT false, "featured" BOOLEAN NOT NULL DEFAULT false,
 "sortOrder" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 1, "configuration" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "CitizenAccessApplication" (
 "id" TEXT PRIMARY KEY, "firebaseUid" TEXT NOT NULL UNIQUE, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
 "declaredDocument" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "processId" TEXT NOT NULL UNIQUE REFERENCES "Process"("id"),
 "status" TEXT NOT NULL DEFAULT 'PENDENTE', "reason" TEXT, "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CitizenAccessApplication_status_createdAt_idx" ON "CitizenAccessApplication"("status", "createdAt");
CREATE TABLE "CitizenRegistryIdentity" (
 "id" TEXT PRIMARY KEY, "usuarioId" TEXT NOT NULL UNIQUE REFERENCES "Usuario"("id"),
 "personId" TEXT REFERENCES "Person"("id"), "companyId" TEXT REFERENCES "Company"("id"),
 "grantedById" TEXT NOT NULL, "evidence" TEXT NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("personId" IS NOT NULL)::integer + ("companyId" IS NOT NULL)::integer = 1)
);
CREATE TABLE "PortalServiceVersion" (
 "id" TEXT PRIMARY KEY, "serviceId" TEXT NOT NULL REFERENCES "PortalServiceConfiguration"("id"), "version" INTEGER NOT NULL,
 "snapshot" JSONB NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("serviceId", "version")
);
CREATE TABLE "PortalServiceRequest" (
 "id" TEXT PRIMARY KEY, "serviceId" TEXT NOT NULL REFERENCES "PortalServiceConfiguration"("id"), "serviceVersion" INTEGER NOT NULL,
 "snapshot" JSONB NOT NULL, "actorId" TEXT NOT NULL REFERENCES "Usuario"("id"), "taxpayerId" TEXT,
 "processId" TEXT NOT NULL UNIQUE REFERENCES "Process"("id"), "worksServiceId" TEXT UNIQUE REFERENCES "ObrasServico"("id"), "executorType" TEXT NOT NULL DEFAULT 'SOLICITACAO', "executorId" TEXT,
 "requestKey" TEXT NOT NULL, "inputHash" TEXT NOT NULL, "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'RECEBIDO', "revision" INTEGER NOT NULL DEFAULT 1, "pendingDocumentCodes" JSONB NOT NULL DEFAULT '[]',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("actorId", "requestKey")
);
CREATE INDEX "PortalServiceRequest_actorId_status_createdAt_idx" ON "PortalServiceRequest"("actorId", "status", "createdAt");
CREATE TABLE "PortalServiceRequestEvent" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "PortalServiceRequest"("id"), "actorId" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "text" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "inputHash" TEXT NOT NULL DEFAULT '', "visible" BOOLEAN NOT NULL DEFAULT true,
 "documentVersionId" TEXT REFERENCES "DocumentVersion"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("requestId", "requestKey")
);
CREATE TABLE "PortalServiceUpload" (
 "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "serviceId" TEXT NOT NULL, "serviceVersion" INTEGER NOT NULL,
 "code" TEXT NOT NULL, "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"("id"), "documentVersionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"("id"),
 "filename" TEXT NOT NULL, "pathname" TEXT NOT NULL UNIQUE, "requestId" TEXT REFERENCES "PortalServiceRequest"("id"), "targetRequestId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PortalServiceUpload_ownerId_requestId_idx" ON "PortalServiceUpload"("ownerId", "requestId");
CREATE TABLE "PortalServiceFavorite" (
 "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "publicServiceId" TEXT NOT NULL REFERENCES "PublicService"("id") ON DELETE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("actorId", "publicServiceId")
);
CREATE TABLE "PortalServiceRating" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE REFERENCES "PortalServiceRequest"("id"),
 "serviceScore" INTEGER NOT NULL CHECK ("serviceScore" BETWEEN 1 AND 5), "qualityScore" INTEGER NOT NULL CHECK ("qualityScore" BETWEEN 1 AND 5),
 "deadlineScore" INTEGER NOT NULL CHECK ("deadlineScore" BETWEEN 1 AND 5), "comment" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "PortalServiceNotice" (
 "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "text" TEXT NOT NULL, "audience" TEXT NOT NULL DEFAULT 'PUBLICO',
 "popup" BOOLEAN NOT NULL DEFAULT false, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("endsAt" > "startsAt")
);
CREATE TABLE "PortalServiceSchedule" (
 "id" TEXT PRIMARY KEY, "resourceKey" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
 "type" TEXT NOT NULL, "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PROGRAMADO',
 "employeeId" TEXT REFERENCES "Employee"("id"), "teamId" TEXT REFERENCES "ObrasEquipe"("id"), "assetId" TEXT REFERENCES "Asset"("id"),
 "laborQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0, "laborUnitCost" DECIMAL(18,2) NOT NULL DEFAULT 0, "realizedQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("endsAt" > "startsAt"), CHECK ("laborQuantity" >= 0 AND "laborUnitCost" >= 0 AND "realizedQuantity" >= 0)
);
CREATE INDEX "PortalServiceSchedule_resourceKey_startsAt_endsAt_status_idx" ON "PortalServiceSchedule"("resourceKey", "startsAt", "endsAt", "status");
CREATE TABLE "PortalScheduleRequest" (
 "id" TEXT PRIMARY KEY, "scheduleId" TEXT NOT NULL REFERENCES "PortalServiceSchedule"("id"), "requestId" TEXT NOT NULL REFERENCES "PortalServiceRequest"("id"),
 UNIQUE ("scheduleId", "requestId")
);

CREATE FUNCTION "portal_service_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Registro versionado/histórico não pode ser alterado ou removido'; END $$;
CREATE TRIGGER "PortalServiceVersion_immutable" BEFORE UPDATE OR DELETE ON "PortalServiceVersion" FOR EACH ROW EXECUTE FUNCTION "portal_service_immutable"();
CREATE TRIGGER "PortalServiceRequestEvent_immutable" BEFORE UPDATE OR DELETE ON "PortalServiceRequestEvent" FOR EACH ROW EXECUTE FUNCTION "portal_service_immutable"();
CREATE FUNCTION "portal_request_binding_guard"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW) - ARRAY['status','revision','pendingDocumentCodes','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','revision','pendingDocumentCodes','updatedAt']) THEN RAISE EXCEPTION 'Preserve origem, titular, versão, payload e vínculos do pedido'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "PortalServiceRequest_binding_guard" BEFORE UPDATE ON "PortalServiceRequest" FOR EACH ROW EXECUTE FUNCTION "portal_request_binding_guard"();
