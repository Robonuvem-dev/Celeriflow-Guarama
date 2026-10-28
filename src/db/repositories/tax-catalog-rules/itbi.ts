import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { itbiDeclarations, itbiEvents, itbiParties, itbiTransactionTypes } from "@/db/schema/tax-itbi";
import { catalogServiceRequests } from "@/db/schema/tax-catalog-rules";
import { taxes } from "@/db/schema/taxation-core";
import { processes } from "@/db/schema/processes";
import { catalogRequired } from "./records";

export async function readItbiTaxes(db: DatabaseExecutor, taxId?: string) {
  return db.select().from(taxes).where(taxId !== undefined ? eq(taxes.id, taxId) : and(sql`lower(${taxes.name})='itbi'`, eq(taxes.isActive, true)));
}
export async function readItbiTransactionType(db: DatabaseExecutor, id: string) {
  return (await db.select().from(itbiTransactionTypes).where(and(eq(itbiTransactionTypes.id, id), eq(itbiTransactionTypes.isActive, true))).limit(1))[0] ?? null;
}
export async function readItbiProcess(db: DatabaseExecutor, id: string) {
  return (await db.select().from(processes).where(eq(processes.id, id)).limit(1))[0] ?? null;
}
export async function readItbiDeclaration(db: DatabaseExecutor, id: string) {
  return (await db.select().from(itbiDeclarations).where(eq(itbiDeclarations.id, id)).limit(1))[0] ?? null;
}
export async function readItbiDeclarationDetail(db: DatabaseExecutor, id: string) {
  const declaration = (await db.select({ ...getTableColumns(itbiDeclarations), transactionType: getTableColumns(itbiTransactionTypes) }).from(itbiDeclarations).innerJoin(itbiTransactionTypes, eq(itbiTransactionTypes.id, itbiDeclarations.transactionTypeId)).where(eq(itbiDeclarations.id, id)).limit(1))[0];
  if (!declaration) return null;
  return { ...declaration, parties: await db.select().from(itbiParties).where(eq(itbiParties.declarationId, id)) };
}
export async function insertItbiDeclaration(tx: DatabaseTransaction, input: typeof itbiDeclarations.$inferInsert, parties: Omit<typeof itbiParties.$inferInsert, "declarationId">[], events: Omit<typeof itbiEvents.$inferInsert, "declarationId">[]) {
  const declaration = catalogRequired((await tx.insert(itbiDeclarations).values(input).returning())[0]);
  const inserted = parties.length ? await tx.insert(itbiParties).values(parties.map(party => ({ ...party, declarationId: declaration.id }))).returning() : [];
  if (events.length) await tx.insert(itbiEvents).values(events.map(event => ({ ...event, declarationId: declaration.id })));
  return { ...declaration, parties: inserted };
}
export async function updateItbiDeclaration(tx: DatabaseTransaction, id: string, input: Partial<typeof itbiDeclarations.$inferInsert>, event?: Omit<typeof itbiEvents.$inferInsert, "declarationId">) {
  const declaration = catalogRequired((await tx.update(itbiDeclarations).set(input).where(eq(itbiDeclarations.id, id)).returning())[0]);
  if (event) await tx.insert(itbiEvents).values({ ...event, declarationId: id });
  return declaration;
}
export async function insertItbiServiceRequest(tx: DatabaseTransaction, input: typeof catalogServiceRequests.$inferInsert) {
  await tx.insert(catalogServiceRequests).values(input);
}
export async function ensureItbiDefaults(tx: DatabaseTransaction) {
  await tx.insert(itbiTransactionTypes).values([
    { code: "COMPRA_VENDA", name: "Compra e venda", rate: sql`2`, damStage: "APROVACAO", cadastralUpdateMode: "CONFIGURAVEL", legalBasis: "Parâmetro demonstrativo: alíquota persistida de 2%." },
    { code: "CESSAO_DIREITOS", name: "Cessão de direitos", rate: sql`2`, damStage: "APROVACAO", cadastralUpdateMode: "MANUAL", legalBasis: "Regra demonstrativa sujeita à legislação municipal." },
  ]).onConflictDoNothing({ target: itbiTransactionTypes.code });
}
