CREATE TABLE "FinanceCheckbook" (
 "id" text PRIMARY KEY, "bankAccountId" text NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,
 "label" text NOT NULL, "firstNumber" integer NOT NULL, "lastNumber" integer NOT NULL,
 "createdByUsuarioId" text NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FinanceCheckbook_range_check" CHECK ("firstNumber">0 AND "lastNumber">="firstNumber" AND "lastNumber"-"firstNumber"<10000)
);
CREATE INDEX "FinanceCheckbook_bank_idx" ON "FinanceCheckbook"("bankAccountId");
CREATE TABLE "FinanceCheque" (
 "id" text PRIMARY KEY, "checkbookId" text NOT NULL REFERENCES "FinanceCheckbook"("id") ON DELETE RESTRICT,
 "bankAccountId" text NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,
 "number" integer NOT NULL, "payee" text NOT NULL, "amount" numeric(18,2) NOT NULL,
 "issuedAt" timestamp(3) NOT NULL, "status" text NOT NULL DEFAULT 'EMITIDO',
 "clearedAt" timestamp(3), "cancellationReason" text,
 "createdByUsuarioId" text NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FinanceCheque_amount_check" CHECK ("amount">0),
 CONSTRAINT "FinanceCheque_state_check" CHECK (("status"='EMITIDO' AND "clearedAt" IS NULL AND "cancellationReason" IS NULL) OR ("status"='COMPENSADO' AND "clearedAt">="issuedAt" AND "cancellationReason" IS NULL) OR ("status"='CANCELADO' AND "clearedAt" IS NULL AND length(trim("cancellationReason"))>=5))
);
CREATE UNIQUE INDEX "FinanceCheque_account_number_key" ON "FinanceCheque"("bankAccountId","number");
CREATE INDEX "FinanceCheque_status_date_idx" ON "FinanceCheque"("status","issuedAt");
