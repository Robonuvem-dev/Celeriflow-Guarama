CREATE TABLE "ProcessUnitMetadata" (
 "unitId" text PRIMARY KEY REFERENCES "AdministrativeUnit"("id"),
 "acronym" text NOT NULL CHECK (length(trim("acronym")) BETWEEN 1 AND 30)
);
CREATE TABLE "ProcessDepartmentMetadata" (
 "departmentId" text PRIMARY KEY REFERENCES "Department"("id"),
 "unitId" text NOT NULL REFERENCES "AdministrativeUnit"("id"),
 "acronym" text NOT NULL CHECK (length(trim("acronym")) BETWEEN 1 AND 30),
 "responsibleEmployeeId" text REFERENCES "Employee"("id")
);
