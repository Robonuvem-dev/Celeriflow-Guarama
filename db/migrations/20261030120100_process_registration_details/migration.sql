CREATE TABLE "ProcessRegistrationDetail" (
  "processId" text PRIMARY KEY REFERENCES "Process"("id") ON DELETE CASCADE,
  "representativePersonId" text REFERENCES "Person"("id"),
  "declaredValue" numeric(18,2) CHECK ("declaredValue" >= 0),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
