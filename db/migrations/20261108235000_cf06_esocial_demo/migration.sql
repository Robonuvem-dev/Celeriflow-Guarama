CREATE TABLE IF NOT EXISTS "HrEsocialDemoEnvironment" (
  "tenantId" text NOT NULL, "employerId" text NOT NULL REFERENCES "BudgetUnit"(id),
  mode text NOT NULL DEFAULT 'DEMO' CHECK (mode='DEMO'), enabled boolean NOT NULL DEFAULT false,
  "createdById" text NOT NULL REFERENCES "Usuario"(id), "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenantId","employerId")
);
CREATE TABLE IF NOT EXISTS "HrEsocialDemoGrant" (
  "tenantId" text NOT NULL, "employerId" text NOT NULL, "userId" text NOT NULL REFERENCES "Usuario"(id),
  permission text NOT NULL CHECK(permission IN ('ESOCIAL_VIEW','ESOCIAL_PREPARE','ESOCIAL_VALIDATE','ESOCIAL_SEND','ESOCIAL_ADMIN','ESOCIAL_AUDIT')),
  "grantedById" text NOT NULL REFERENCES "Usuario"(id), "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenantId","employerId","userId",permission),
  FOREIGN KEY ("tenantId","employerId") REFERENCES "HrEsocialDemoEnvironment"("tenantId","employerId")
);
CREATE TABLE IF NOT EXISTS "HrEsocialDemoRun" (
  id text PRIMARY KEY, "tenantId" text NOT NULL, "employerId" text NOT NULL, period text NOT NULL CHECK (period IN ('2026-10','2026')),
  generation integer NOT NULL CHECK(generation>0), state jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId","employerId",period,generation),
  FOREIGN KEY ("tenantId","employerId") REFERENCES "HrEsocialDemoEnvironment"("tenantId","employerId"),
  CHECK(state->>'mode'='DEMO' AND state->>'source'='SIMULATED' AND state->>'tenantId'="tenantId" AND state->>'employerId'="employerId" AND state->>'period'=period AND (state->>'generation')::integer=generation)
);
CREATE TABLE IF NOT EXISTS "HrEsocialDemoCommand" (
  id text PRIMARY KEY, "tenantId" text NOT NULL, "employerId" text NOT NULL, period text NOT NULL,
  "idempotencyKey" text NOT NULL, "requestHash" text NOT NULL, "actorId" text NOT NULL REFERENCES "Usuario"(id),
  action text NOT NULL, "runId" text NOT NULL REFERENCES "HrEsocialDemoRun"(id),
  "beforeHash" text NOT NULL, "afterHash" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("tenantId","employerId","idempotencyKey")
);
CREATE TABLE IF NOT EXISTS "HrEsocialDemoArtifact" (
  "runId" text NOT NULL REFERENCES "HrEsocialDemoRun"(id), id text NOT NULL,
  kind text NOT NULL, hash text NOT NULL, "objectUrl" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY("runId",id)
);
CREATE INDEX IF NOT EXISTS "HrEsocialDemoRun_scope" ON "HrEsocialDemoRun"("tenantId","employerId",period,generation DESC);
CREATE OR REPLACE FUNCTION cf06_demo_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'eSocial demonstration evidence is append-only'; END $$;
CREATE TRIGGER "HrEsocialDemoCommand_immutable" BEFORE UPDATE OR DELETE ON "HrEsocialDemoCommand" FOR EACH ROW EXECUTE FUNCTION cf06_demo_evidence_immutable();
CREATE TRIGGER "HrEsocialDemoArtifact_immutable" BEFORE UPDATE OR DELETE ON "HrEsocialDemoArtifact" FOR EACH ROW EXECUTE FUNCTION cf06_demo_evidence_immutable();
