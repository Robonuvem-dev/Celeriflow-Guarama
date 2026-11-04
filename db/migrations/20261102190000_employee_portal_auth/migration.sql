CREATE TABLE "EmployeePortalLoginGuard" (
 "userId" text PRIMARY KEY REFERENCES "Usuario"("id") ON DELETE CASCADE,
 "failures" integer NOT NULL DEFAULT 0 CHECK ("failures" >= 0),
 "windowStartedAt" timestamptz NOT NULL DEFAULT now(),
 "lockedUntil" timestamptz
);
CREATE TABLE "EmployeePortalAccessLink" (
 "tokenHash" text PRIMARY KEY CHECK (length("tokenHash") = 64),
 "userId" text NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
 "purpose" text NOT NULL CHECK ("purpose" IN ('REGISTER','RESET')),
 "email" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "expiresAt" timestamptz NOT NULL,
 "consumedAt" timestamptz
);
CREATE INDEX "EmployeePortalAccessLink_user_expiry_idx" ON "EmployeePortalAccessLink" ("userId","expiresAt");
