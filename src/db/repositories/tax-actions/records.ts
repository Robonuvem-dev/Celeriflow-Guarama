import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { actionActiveDebts, actionTaxCertificates } from "@/db/schema/tax-actions";
import { economicRegistrations, taxAssessments } from "@/db/schema/taxation-core";
import { taxLicenses } from "@/db/schema/taxation-registry";
import { pageActivities } from "@/db/schema/taxation-pages";

export async function insertActionDebt(database: DatabaseExecutor, input: typeof actionActiveDebts.$inferInsert) {
  return (await database.insert(actionActiveDebts).values(input).returning())[0];
}
export async function updateActionDebt(database: DatabaseExecutor, id: string, input: Partial<Omit<typeof actionActiveDebts.$inferInsert, "id">>) {
  const [row] = await database.update(actionActiveDebts).set(input).where(eq(actionActiveDebts.id, id)).returning();
  if (!row) throw new Error("Dívida não encontrada.");
  return row;
}
export async function insertActionCertificate(database: DatabaseExecutor, input: typeof actionTaxCertificates.$inferInsert) {
  return (await database.insert(actionTaxCertificates).values(input).returning())[0];
}
export async function revokeActionCertificate(database: DatabaseExecutor, id: string) {
  const [row] = await database.update(actionTaxCertificates).set({ status: "Revogada" }).where(eq(actionTaxCertificates.id, id)).returning();
  if (!row) throw new Error("Certidão não encontrada.");
  return row;
}
export async function actionLicense(database: DatabaseExecutor, id: string) {
  const [row] = await database.select().from(taxLicenses).where(eq(taxLicenses.id, id)).limit(1);
  if (!row) throw new Error("Alvará não encontrado.");
  return row;
}
export async function updateActionLicense(database: DatabaseExecutor, id: string, input: { licenseType?: string; validUntil?: Date; status?: string }) {
  const [row] = await database.update(taxLicenses).set(input).where(eq(taxLicenses.id, id)).returning();
  if (!row) throw new Error("Alvará não encontrado.");
  return row;
}
export async function actionActiveRegistrations(database: DatabaseExecutor, taxpayerId: string) {
  return database.select().from(economicRegistrations).where(and(eq(economicRegistrations.taxpayerId, taxpayerId), eq(economicRegistrations.status, "Ativo")));
}
export async function actionAssessmentTaxpayer(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ taxpayerId: taxAssessments.taxpayerId }).from(taxAssessments).where(eq(taxAssessments.id, id)).limit(1);
  if (!row) throw new Error("Lançamento não encontrado.");
  return row;
}
export async function actionServiceActivity(database: DatabaseExecutor, taxId: string, code: string) {
  return (await database.select({ id: pageActivities.id }).from(pageActivities).where(and(eq(pageActivities.taxId, taxId), eq(pageActivities.code, code))).limit(1))[0] ?? null;
}
