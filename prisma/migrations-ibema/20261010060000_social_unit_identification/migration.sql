ALTER TABLE "SocialUnit"
ADD COLUMN "identificationCode" TEXT,
ADD COLUMN "implementationDate" DATE,
ADD COLUMN "streetAddress" TEXT,
ADD COLUMN "municipality" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;
CREATE UNIQUE INDEX "SocialUnit_identificationCode_key" ON "SocialUnit"("identificationCode");
ALTER TABLE "SocialUnit" ADD CONSTRAINT "SocialUnit_coordinates_check"
CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR
("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));
