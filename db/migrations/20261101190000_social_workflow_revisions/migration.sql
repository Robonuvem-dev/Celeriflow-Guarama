CREATE TABLE "SocialWorkflowRevision" (id TEXT PRIMARY KEY, area TEXT NOT NULL, "recordId" TEXT NOT NULL, "values" JSONB NOT NULL CHECK (jsonb_typeof("values")='object'), "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "SocialWorkflowRevision_record_idx" ON "SocialWorkflowRevision"(area,"recordId","createdAt");
