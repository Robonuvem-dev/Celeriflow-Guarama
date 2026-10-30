import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { centralRecords } from "@/db/schema/signature-central";
import { assertCentralBlobPath, centralBlobStore, type CentralBlobStore } from "./central-storage";

export function authorizeCentralCron(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
export async function runCentralRetention(connection: DatabaseConnection = databaseConnection, storage: CentralBlobStore = centralBlobStore, now = new Date()) {
  const abandoned = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const eligible = () => and(isNull(centralRecords.storageDeletedAt), or(
    and(eq(centralRecords.status, "SIGNED"), lte(centralRecords.expiresAt, now)),
    and(eq(centralRecords.status, "PENDING"), lte(centralRecords.createdAt, abandoned)),
  ));
  // Complete candidate list: failures are counted, never silently truncated.
  const candidates = await connection.db.select({ id: centralRecords.id }).from(centralRecords).where(eligible());
  let deleted = 0; const failures: Array<{ id: string; code: string }> = [];
  for (const candidate of candidates) {
    try {
      const removed = await withDatabaseTransaction(connection, async tx => {
        const [row] = await tx.select().from(centralRecords).where(and(eq(centralRecords.id, candidate.id), eligible())).for("update");
        if (!row) return false;
        assertCentralBlobPath(row.blobPath);
        await storage.delete(row.blobPath);
        await tx.update(centralRecords).set({ storageDeletedAt: now }).where(eq(centralRecords.id, row.id));
        return true;
      });
      if (removed) deleted++;
    } catch {
      failures.push({ id: candidate.id, code: "CENTRAL_RETENTION_DELETE_FAILED" });
      console.error("[signature-central-retention]", candidate.id, "CENTRAL_RETENTION_DELETE_FAILED");
    }
  }
  return { examined: candidates.length, deleted, failures };
}
