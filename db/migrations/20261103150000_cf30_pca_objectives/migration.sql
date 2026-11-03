ALTER TABLE "PurchasePlanning"
  ADD COLUMN "objectiveId" TEXT REFERENCES "ObjectivePPA" ("id") ON DELETE SET NULL;

CREATE INDEX "PurchasePlanning_objectiveId_idx" ON "PurchasePlanning" ("objectiveId");
