CREATE TABLE "AccountingPostingComponent" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "debitAccountId" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "valueBasis" TEXT NOT NULL DEFAULT 'EVENT_VALUE',
  "creditFromOriginBank" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "AccountingPostingComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingPostingComponent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AccountingPostingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountingPostingComponent_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "AccountingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountingPostingComponent_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "AccountingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountingPostingComponent_valid" CHECK ("sequence" > 0 AND "debitAccountId" <> "creditAccountId" AND "valueBasis" IN ('EVENT_VALUE', 'PAYMENT_NET', 'PAYMENT_RETENTION'))
);
CREATE UNIQUE INDEX "AccountingPostingComponent_ruleId_sequence_key" ON "AccountingPostingComponent"("ruleId", "sequence");
