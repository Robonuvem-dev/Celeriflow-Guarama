import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { taxLicenses, taxRegistryEntries } from "../../schema/taxation-registry";
import type { TaxLicenseValidation } from "@/lib/contracts/taxation-documents";

export async function readTaxLicenseValidation(db: DatabaseExecutor, code: string): Promise<TaxLicenseValidation | null> {
  const [license] = await db.select().from(taxLicenses).where(eq(taxLicenses.qrCode, code)).limit(1);
  if (!license) return null;
  const [entry] = await db.select({ data: taxRegistryEntries.data }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "LICENSE"), eq(taxRegistryEntries.entityId, license.id), eq(taxRegistryEntries.category, "LICENSE_ISSUANCE"))).limit(1);
  if (!entry) return null;
  const data = entry.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data : {};
  if (data.authCode !== code) return null;
  const [signature] = await db.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "LICENSE"), eq(taxRegistryEntries.entityId, license.id), eq(taxRegistryEntries.category, "LICENSE_SIGNATURE"))).limit(1);
  return { license, data, signature: signature ?? null };
}
