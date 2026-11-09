-- Matrícula do servidor: dia de cadastro em America/Sao_Paulo + sequência diária.
-- createdAt is stored as UTC in timestamp without time zone by this application.
-- Contract identifiers and immutable payroll/document snapshots are independent.
LOCK TABLE "Employee" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "EmployeeRegistrationCounter" (
  day date PRIMARY KEY,
  "lastNumber" integer NOT NULL CHECK ("lastNumber" BETWEEN 1 AND 99999)
);
-- No FK: issued numbers remain reserved even after an unused employee is deleted.
CREATE TABLE "EmployeeRegistrationAllocation" (
  "employeeId" text PRIMARY KEY,
  registration text NOT NULL UNIQUE,
  "previousRegistration" text,
  "registeredAt" timestamp(3) NOT NULL,
  day date NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 99999),
  "allocatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(day, sequence),
  CHECK (registration ~ '^[0-9]{13}$' AND registration=to_char(day,'YYYYMMDD')||lpad(sequence::text,5,'0'))
);

WITH numbered AS (
  SELECT id, registration, "createdAt",
    ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    row_number() OVER (PARTITION BY ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date ORDER BY "createdAt",id)::integer AS sequence
  FROM "Employee"
)
INSERT INTO "EmployeeRegistrationAllocation" ("employeeId",registration,"previousRegistration","registeredAt",day,sequence)
SELECT id,to_char(day,'YYYYMMDD')||lpad(sequence::text,5,'0'),registration,"createdAt",day,sequence FROM numbered;

INSERT INTO "EmployeeRegistrationCounter" (day,"lastNumber")
SELECT day,max(sequence) FROM "EmployeeRegistrationAllocation" GROUP BY day;

UPDATE "Employee" e SET registration=a.registration,"updatedAt"=CURRENT_TIMESTAMP
FROM "EmployeeRegistrationAllocation" a WHERE a."employeeId"=e.id;

ALTER TABLE "Employee" ALTER COLUMN registration SET NOT NULL;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_registration_format" CHECK (registration ~ '^[0-9]{13}$');
CREATE UNIQUE INDEX "Employee_registration_key" ON "Employee"(registration);

CREATE FUNCTION employee_assign_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE issued "EmployeeRegistrationAllocation"%ROWTYPE; registration_day date; daily_number integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'A data de cadastro que originou a matrícula é imutável.';
  END IF;
  IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'O identificador do servidor é imutável.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('EMPLOYEE_REGISTRATION:'||NEW.id));
  SELECT * INTO issued FROM "EmployeeRegistrationAllocation" WHERE "employeeId"=NEW.id;
  IF FOUND THEN
    NEW.registration=issued.registration;
    NEW."createdAt"=issued."registeredAt";
    RETURN NEW;
  END IF;
  registration_day=(NEW."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date;
  INSERT INTO "EmployeeRegistrationCounter"(day,"lastNumber") VALUES(registration_day,1)
    ON CONFLICT(day) DO UPDATE SET "lastNumber"="EmployeeRegistrationCounter"."lastNumber"+1
    RETURNING "lastNumber" INTO daily_number;
  INSERT INTO "EmployeeRegistrationAllocation"("employeeId",registration,"previousRegistration","registeredAt",day,sequence)
    VALUES(NEW.id,to_char(registration_day,'YYYYMMDD')||lpad(daily_number::text,5,'0'),nullif(NEW.registration,''),NEW."createdAt",registration_day,daily_number)
    RETURNING * INTO issued;
  NEW.registration=issued.registration;
  RETURN NEW;
END; $$;

CREATE TRIGGER "Employee_assign_registration" BEFORE INSERT OR UPDATE ON "Employee"
FOR EACH ROW EXECUTE FUNCTION employee_assign_registration();

CREATE FUNCTION employee_registration_allocation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'O histórico de numeração de matrículas é imutável.'; END; $$;
CREATE TRIGGER "EmployeeRegistrationAllocation_immutable" BEFORE UPDATE OR DELETE ON "EmployeeRegistrationAllocation"
FOR EACH ROW EXECUTE FUNCTION employee_registration_allocation_immutable();
