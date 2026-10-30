-- FUTURE migration; never applied by the implementation agent.
CREATE TABLE "SignatureCentralSigner" (
 "id" text PRIMARY KEY, "kind" text NOT NULL, "name" text NOT NULL, "role" text NOT NULL,
 "documentId" text NOT NULL, "phone" text NOT NULL, "mobile" text NOT NULL, "email" text NOT NULL,
 "validUntil" timestamptz(3) NOT NULL, "active" boolean NOT NULL, "passwordHash" text NOT NULL,
 "employeeId" text REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "personId" text REFERENCES "Person"("id") ON DELETE RESTRICT,
 "accountUserId" text REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
 CONSTRAINT "SignatureCentralSigner_origin_check" CHECK (("kind"='SERVIDOR' AND "employeeId" IS NOT NULL) OR ("kind"='CIDADAO' AND "employeeId" IS NULL))
);
CREATE UNIQUE INDEX "SignatureCentralSigner_document_key" ON "SignatureCentralSigner"("documentId");
CREATE INDEX "SignatureCentralSigner_account_idx" ON "SignatureCentralSigner"("accountUserId");
CREATE TABLE "SignatureCentralDocumentType" ("id" text PRIMARY KEY, "name" text NOT NULL, "description" text NOT NULL, "active" boolean NOT NULL);
CREATE UNIQUE INDEX "SignatureCentralDocumentType_name_key" ON "SignatureCentralDocumentType"("name");
CREATE TABLE "SignatureCentralRecord" (
 "id" text PRIMARY KEY, "requestId" text NOT NULL, "requestDigest" text NOT NULL,
 "actorId" text NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "signerId" text NOT NULL REFERENCES "SignatureCentralSigner"("id") ON DELETE RESTRICT,
 "accountUserId" text REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "documentTypeId" text NOT NULL REFERENCES "SignatureCentralDocumentType"("id") ON DELETE RESTRICT,
 "status" text NOT NULL DEFAULT 'PENDING', "code" text NOT NULL,
 "filename" text NOT NULL, "mimeType" text NOT NULL, "byteLength" integer NOT NULL, "hashSha256" text NOT NULL,
 "blobPath" text NOT NULL, "evidence" jsonb, "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 "signedAt" timestamptz(3), "expiresAt" timestamptz(3) NOT NULL, "storageDeletedAt" timestamptz(3),
 CONSTRAINT "SignatureCentralRecord_status_check" CHECK ("status" IN ('PENDING','SIGNED')),
 CONSTRAINT "SignatureCentralRecord_size_check" CHECK ("byteLength">0 AND "byteLength"<=3145728),
 CONSTRAINT "SignatureCentralRecord_proof_check" CHECK (("status"='PENDING' AND "evidence" IS NULL AND "signedAt" IS NULL) OR ("status"='SIGNED' AND "evidence" IS NOT NULL AND "signedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "SignatureCentralRecord_request_key" ON "SignatureCentralRecord"("actorId","requestId");
CREATE UNIQUE INDEX "SignatureCentralRecord_code_key" ON "SignatureCentralRecord"("code");
CREATE UNIQUE INDEX "SignatureCentralRecord_path_key" ON "SignatureCentralRecord"("blobPath");
CREATE INDEX "SignatureCentralRecord_hash_idx" ON "SignatureCentralRecord"("hashSha256");
CREATE INDEX "SignatureCentralRecord_retention_idx" ON "SignatureCentralRecord"("status","expiresAt","storageDeletedAt");
CREATE INDEX "SignatureCentralRecord_actor_idx" ON "SignatureCentralRecord"("actorId","createdAt");
CREATE INDEX "SignatureCentralRecord_account_idx" ON "SignatureCentralRecord"("accountUserId");
