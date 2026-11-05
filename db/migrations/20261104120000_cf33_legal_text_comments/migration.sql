CREATE TABLE "LegalTextComment" (
  "id" TEXT PRIMARY KEY,
  "legalTextId" TEXT NOT NULL REFERENCES "LegalText"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "body" TEXT NOT NULL CHECK (length(btrim("body")) BETWEEN 1 AND 2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LegalTextComment_legalTextId_createdAt_id_idx"
  ON "LegalTextComment" ("legalTextId", "createdAt", "id");
