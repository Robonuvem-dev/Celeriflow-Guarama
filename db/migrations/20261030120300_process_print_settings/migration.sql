CREATE TABLE "ProcessPrintSetting" (
 "processTypeId" text PRIMARY KEY REFERENCES "ProcessType"("id"),
 "includeOpening" boolean NOT NULL DEFAULT true,
 "includeMovements" boolean NOT NULL DEFAULT true,
 CHECK ("includeOpening" OR "includeMovements")
);
