ALTER TABLE "Secretariat" ADD COLUMN "managerId" TEXT;
CREATE INDEX "Secretariat_managerId_idx" ON "Secretariat"("managerId");
ALTER TABLE "Secretariat" ADD CONSTRAINT "Secretariat_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recover only unambiguous existing names within the same secretariat.
-- Other legacy names remain visible until a registered employee is selected.
UPDATE "Secretariat" s SET "managerId" = e.id, "managerName" = e.name
FROM "Employee" e
WHERE e."secretariatId" = s.id AND e."isActive" = true
  AND lower(trim(e.name)) = lower(trim(s."managerName"))
  AND (SELECT count(*) FROM "Employee" candidate
       WHERE candidate."secretariatId" = s.id AND candidate."isActive" = true
         AND lower(trim(candidate.name)) = lower(trim(s."managerName"))) = 1;
