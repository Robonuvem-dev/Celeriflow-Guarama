CREATE TABLE "TransparencyPublication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicKey" TEXT NOT NULL,
  "collectionSlug" TEXT NOT NULL,
  "entity" TEXT NOT NULL CHECK ("entity" IN ('prefeitura', 'camara')),
  "year" INTEGER NOT NULL CHECK ("year" BETWEEN 1900 AND 2200),
  "title" TEXT NOT NULL,
  "group" TEXT NOT NULL,
  "referencePeriod" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'DOCUMENTOS' CHECK ("source" IN ('DOCUMENTOS', 'NATIVO')),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  "values" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "order" INTEGER NOT NULL DEFAULT 0,
  "fileUrl" TEXT, "filePathname" TEXT, "filename" TEXT, "contentType" TEXT, "sha256" TEXT, "linkUrl" TEXT,
  "publishedAt" TIMESTAMP(3), "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TransparencyPublication_publication_integrity" CHECK (
    "status" <> 'PUBLISHED' OR ("publishedAt" IS NOT NULL AND
    ("fileUrl" IS NULL OR ("sha256" ~ '^[a-f0-9]{64}$' AND "filePathname" IS NOT NULL)))
  )
);
CREATE UNIQUE INDEX "TransparencyPublication_publicKey_key" ON "TransparencyPublication"("publicKey");
CREATE INDEX "TransparencyPublication_collectionSlug_entity_year_status_idx" ON "TransparencyPublication"("collectionSlug", "entity", "year", "status");
