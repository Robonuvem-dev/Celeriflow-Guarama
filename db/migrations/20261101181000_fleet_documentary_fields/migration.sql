ALTER TABLE "FleetUnit" ADD COLUMN rntrc TEXT, ADD COLUMN "manufactureYear" INTEGER, ADD COLUMN "modelYear" INTEGER;
ALTER TABLE "FleetUnit" ADD CONSTRAINT "FleetUnit_years_check" CHECK (("manufactureYear" IS NULL OR "manufactureYear" BETWEEN 1900 AND 2100) AND ("modelYear" IS NULL OR "modelYear" BETWEEN 1900 AND 2100) AND ("modelYear" IS NULL OR "manufactureYear" IS NULL OR "modelYear">="manufactureYear"));
ALTER TABLE "FleetDriver" ADD COLUMN "firstLicenseAt" DATE;
ALTER TABLE "FleetDriver" ADD CONSTRAINT "FleetDriver_license_dates_check" CHECK ("firstLicenseAt" IS NULL OR "firstLicenseAt"<="cnhExpiresAt");
