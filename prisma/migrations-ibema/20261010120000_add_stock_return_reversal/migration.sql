ALTER TABLE "MaterialMovement"
ADD COLUMN "operation" TEXT NOT NULL DEFAULT 'REGULAR',
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "returnedMovementId" TEXT,
ADD COLUMN "reversedMovementId" TEXT;

CREATE UNIQUE INDEX "MaterialMovement_idempotencyKey_key"
ON "MaterialMovement"("idempotencyKey");

CREATE UNIQUE INDEX "MaterialMovement_reversedMovementId_key"
ON "MaterialMovement"("reversedMovementId");

CREATE INDEX "MaterialMovement_returnedMovementId_idx"
ON "MaterialMovement"("returnedMovementId");

ALTER TABLE "MaterialMovement"
ADD CONSTRAINT "MaterialMovement_returnedMovementId_fkey"
FOREIGN KEY ("returnedMovementId") REFERENCES "MaterialMovement"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaterialMovement"
ADD CONSTRAINT "MaterialMovement_reversedMovementId_fkey"
FOREIGN KEY ("reversedMovementId") REFERENCES "MaterialMovement"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
