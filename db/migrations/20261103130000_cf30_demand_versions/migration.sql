CREATE TABLE "PurchaseDemandVersion" (
  "id" TEXT PRIMARY KEY,
  "purchaseRequestId" TEXT NOT NULL REFERENCES "PurchaseRequest" ("id"),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "actorId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PurchaseDemandVersion_request_version_key"
  ON "PurchaseDemandVersion" ("purchaseRequestId", "version");
