CREATE TABLE "SocialNetworkOrganization" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "taxId" TEXT, "organizationType" TEXT NOT NULL,
 "address" TEXT, "phone" TEXT, "email" TEXT, "usesCounterReference" BOOLEAN NOT NULL DEFAULT true, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "SocialReferral" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "unitId" TEXT NOT NULL REFERENCES "SocialUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "personId" TEXT REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "familyId" TEXT REFERENCES "SocialFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "destinationOrganizationId" TEXT NOT NULL REFERENCES "SocialNetworkOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "reasonId" TEXT NOT NULL REFERENCES "SocialCatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "priorityTypeId" TEXT REFERENCES "SocialCatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "referenceProfessional" TEXT, "objective" TEXT NOT NULL, "observations" TEXT, "referredAt" DATE NOT NULL, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN', "counterReferenceAt" DATE, "counterReferenceProfessional" TEXT, "counterReferenceDescription" TEXT, "counterReferenceBy" TEXT,
 CONSTRAINT "SocialReferral_subject_check" CHECK (("personId" IS NULL) <> ("familyId" IS NULL)),
 CONSTRAINT "SocialReferral_status_check" CHECK ("status" IN ('OPEN','RETURNED')),
 CONSTRAINT "SocialReferral_counter_date_check" CHECK ("counterReferenceAt" IS NULL OR "counterReferenceAt" >= "referredAt")
);
CREATE INDEX "SocialReferral_unitId_referredAt_idx" ON "SocialReferral"("unitId","referredAt");
CREATE INDEX "SocialReferral_personId_familyId_idx" ON "SocialReferral"("personId","familyId");
