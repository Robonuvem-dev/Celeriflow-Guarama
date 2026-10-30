CREATE TABLE "PlanningRegionalAction" (
 "id" text PRIMARY KEY, "actionId" text NOT NULL REFERENCES "ActionPPA"("id") ON DELETE RESTRICT,
 "region" text NOT NULL, "subactionCode" text NOT NULL DEFAULT '', "name" text NOT NULL,
 "active" boolean NOT NULL DEFAULT true, "createdByUsuarioId" text NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PlanningRegionalAction_region_check" CHECK (length(trim("region"))>=2),
 CONSTRAINT "PlanningRegionalAction_name_check" CHECK (length(trim("name"))>=2)
);
CREATE UNIQUE INDEX "PlanningRegionalAction_action_region_code_key" ON "PlanningRegionalAction"("actionId", "region", "subactionCode");
