CREATE TABLE "TransparencyCitizenRequest" (
 "id" TEXT NOT NULL PRIMARY KEY, "protocol" TEXT NOT NULL, "accessHash" TEXT NOT NULL,
 "type" TEXT NOT NULL CHECK ("type" IN ('ESIC','DENUNCIA','RECLAMACAO','SUGESTAO','ELOGIO')),
 "name" TEXT, "email" TEXT, "subject" TEXT NOT NULL, "message" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RECEBIDO' CHECK ("status" IN ('RECEBIDO','EM_ANALISE','RESPONDIDO')),
 "response" TEXT, "respondedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TransparencyCitizenRequest_protocol_key" ON "TransparencyCitizenRequest"("protocol");
CREATE UNIQUE INDEX "TransparencyCitizenRequest_accessHash_key" ON "TransparencyCitizenRequest"("accessHash");
CREATE INDEX "TransparencyCitizenRequest_status_createdAt_idx" ON "TransparencyCitizenRequest"("status","createdAt");
CREATE TABLE "TransparencyAccess" (
 "id" TEXT NOT NULL PRIMARY KEY, "collectionSlug" TEXT NOT NULL, "entity" TEXT NOT NULL, "source" TEXT NOT NULL,
 "year" INTEGER NOT NULL, "ip" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TransparencyAccess_createdAt_idx" ON "TransparencyAccess"("createdAt");
