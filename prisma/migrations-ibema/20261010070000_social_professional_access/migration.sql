ALTER TABLE "SocialUnit" ADD COLUMN "isConfidential" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialAttendance" ADD COLUMN "involvedProfessionalIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SocialVisit" ADD COLUMN "unitId" TEXT;
ALTER TABLE "SocialVisit" ADD CONSTRAINT "SocialVisit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SocialProfessionalLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "unitId" TEXT NOT NULL REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "jobTitle" TEXT NOT NULL,
  "specialty" TEXT,
  "startsAt" DATE NOT NULL,
  "endsAt" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "individualScope" TEXT NOT NULL DEFAULT 'UNIT',
  "familyScope" TEXT NOT NULL DEFAULT 'UNIT',
  "workingDays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  "workStart" TEXT NOT NULL DEFAULT '08:00',
  "workEnd" TEXT NOT NULL DEFAULT '17:00',
  "includeInRma" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialProfessionalLink_period_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt"),
  CONSTRAINT "SocialProfessionalLink_scope_check" CHECK ("individualScope" IN ('OWN','UNIT','MUNICIPAL') AND "familyScope" IN ('OWN','UNIT','MUNICIPAL'))
);
CREATE UNIQUE INDEX "SocialProfessionalLink_employeeId_unitId_key" ON "SocialProfessionalLink"("employeeId", "unitId");
CREATE INDEX "SocialProfessionalLink_unitId_isActive_idx" ON "SocialProfessionalLink"("unitId", "isActive");
