CREATE TABLE "TaxPasswordPreference" (
 "userId" TEXT PRIMARY KEY,
 "required" BOOLEAN NOT NULL DEFAULT false,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "TaxPasswordGrant" (
 "id" TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "authTime" INTEGER NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "consumedAt" TIMESTAMP(3),
 UNIQUE("userId","authTime")
);
CREATE INDEX "TaxPasswordGrant_user_expiry_idx" ON "TaxPasswordGrant"("userId","expiresAt");
