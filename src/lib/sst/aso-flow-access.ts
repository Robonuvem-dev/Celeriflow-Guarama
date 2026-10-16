import type { PrismaClient } from "@prisma/client";

// Resolve ownership before any generic Document/Process alias or storage read.
// A URL shared across UGs requires authorization for every occupational owner.
export async function asoDocumentOwners(db: Pick<PrismaClient, "$queryRaw">, url: string) {
  return db.$queryRaw<{ budgetUnitId: string }[]>`SELECT DISTINCT a."budgetUnitId" FROM "SstAsoDocument" l JOIN "SstAso" a ON a.id=l."asoId" JOIN "Document" d ON d.id=l."documentId" LEFT JOIN "DocumentVersion" v ON v."documentId"=d.id WHERE d."fileUrl"=${url} OR v."fileUrl"=${url}`;
}
