CREATE TABLE "TaxRegistryMerge" (
 "id" TEXT PRIMARY KEY,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('cep','bairro','cidade','contador')),
 "sourceId" TEXT NOT NULL,
 "targetId" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "actorId" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL,
 "moved" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("sourceId" <> "targetId")
);
