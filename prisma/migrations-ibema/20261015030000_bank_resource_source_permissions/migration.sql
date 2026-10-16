CREATE TABLE "BankAccountResourceSource" (
  "bankAccountId" TEXT NOT NULL,
  "resourceSourceId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankAccountResourceSource_pkey" PRIMARY KEY ("bankAccountId", "resourceSourceId"),
  CONSTRAINT "BankAccountResourceSource_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankAccountResourceSource_resourceSourceId_fkey" FOREIGN KEY ("resourceSourceId") REFERENCES "ResourceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "TreasuryMovement" ADD COLUMN IF NOT EXISTS "resourceSourceId" TEXT;
ALTER TABLE "TreasuryMovement" ADD CONSTRAINT "TreasuryMovement_resourceSourceId_fkey" FOREIGN KEY ("resourceSourceId") REFERENCES "ResourceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TreasuryMovement_bankAccountId_resourceSourceId_date_idx" ON "TreasuryMovement"("bankAccountId", "resourceSourceId", "date");

-- No historical allocation is inferred from the bank account's current default.
CREATE FUNCTION guard_multisource_treasury_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."resourceSourceId" IS NULL AND EXISTS (
    SELECT 1 FROM "BankAccountResourceSource" WHERE "bankAccountId" = NEW."bankAccountId"
  ) THEN
    RAISE EXCEPTION 'Movimento de conta multifonte exige fonte documental explícita';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TreasuryMovement_multisource_origin_guard" BEFORE INSERT ON "TreasuryMovement" FOR EACH ROW EXECUTE FUNCTION guard_multisource_treasury_origin();
