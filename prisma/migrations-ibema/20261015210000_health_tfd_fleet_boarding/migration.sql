ALTER TABLE "HealthTfdTrip"
  ADD COLUMN "fleetBookingId" TEXT UNIQUE REFERENCES "FleetBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "assistantEmployeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "responsibleEmployeeId" TEXT REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "advanceRequestId" TEXT REFERENCES "HrPortalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "advanceAuthorizedAmount" DECIMAL(14,2),
  ADD COLUMN "purpose" TEXT, ADD COLUMN "confirmedAt" TIMESTAMP(3), ADD COLUMN "confirmedByUsuarioId" TEXT;
ALTER TABLE "HealthTfdPassenger" ADD COLUMN "boardingLocation" TEXT,
  ADD COLUMN "presenceStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "presenceAt" TIMESTAMP(3), ADD COLUMN "presenceByUsuarioId" TEXT;
CREATE TABLE "HealthTfdTripEvent" (
  "id" TEXT PRIMARY KEY, "tripId" TEXT NOT NULL REFERENCES "HealthTfdTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "passengerId" TEXT, "eventType" TEXT NOT NULL, "reason" TEXT NOT NULL, "metadata" JSONB,
  "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTfdTripEvent_tripId_createdAt_idx" ON "HealthTfdTripEvent"("tripId", "createdAt");
