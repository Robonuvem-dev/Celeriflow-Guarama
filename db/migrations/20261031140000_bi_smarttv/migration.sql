CREATE TABLE "BiDisplayChannel" (
  "id" TEXT PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "draft" JSONB NOT NULL,
  "publishedVersionId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT NOT NULL
);
CREATE TABLE "BiDisplayChannelVersion" (
  "id" TEXT PRIMARY KEY,
  "channelId" TEXT NOT NULL REFERENCES "BiDisplayChannel"("id"),
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL
);
CREATE UNIQUE INDEX "BiDisplayChannelVersion_number_key" ON "BiDisplayChannelVersion"("channelId", "number");
CREATE UNIQUE INDEX "BiDisplayChannelVersion_channel_id_key" ON "BiDisplayChannelVersion"("channelId", "id");
ALTER TABLE "BiDisplayChannel" ADD CONSTRAINT "BiDisplayChannel_published_fkey"
  FOREIGN KEY ("id", "publishedVersionId") REFERENCES "BiDisplayChannelVersion"("channelId", "id");
CREATE TABLE "BiMediaAsset" (
  "id" TEXT PRIMARY KEY, "url" TEXT NOT NULL, "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBy" TEXT NOT NULL
);
CREATE TABLE "BiDisplaySnapshot" (
  "versionId" TEXT PRIMARY KEY REFERENCES "BiDisplayChannelVersion"("id"),
  "datasets" JSONB NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
