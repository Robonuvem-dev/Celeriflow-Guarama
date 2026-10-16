CREATE TABLE "ProcessCitizenAccess" (
  "id" TEXT NOT NULL,
  "processId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "grantedByUsuarioId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ProcessCitizenAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcessCitizenAccess_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcessCitizenAccess_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcessCitizenAccess_grantedByUsuarioId_fkey" FOREIGN KEY ("grantedByUsuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProcessCitizenAccess_processId_usuarioId_key" ON "ProcessCitizenAccess"("processId", "usuarioId");
CREATE INDEX "ProcessCitizenAccess_usuarioId_revokedAt_expiresAt_idx" ON "ProcessCitizenAccess"("usuarioId", "revokedAt", "expiresAt");
