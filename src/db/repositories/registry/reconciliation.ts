import { createHash } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import type { CanonicalReconciliationInput } from "@/lib/contracts/master-data";
import { validateCnpj, validateCpf } from "@/lib/identifiers/brazilian-identifiers";
import type { DatabaseTransaction } from "../../transaction";
import { PersistenceError } from "../../errors";
import { people } from "../../schema/people";
import { companies, suppliers, taxpayers } from "../../schema/registry";
import { creditors, financialAuditLogs } from "../../schema/finance-identity";

function requireRecord<T>(records: T[]): T {
  if (!records[0]) throw new PersistenceError("not-found", "Registro não encontrado.");
  return records[0];
}

/** Caller authorizes both CADASTROS/update and FINANCEIRO/update for creditors. */
export async function reconcileCanonicalIdentityInTransaction(tx: DatabaseTransaction, actorId: string, input: CanonicalReconciliationInput): Promise<string> {
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const commandId = `identity-link:${createHash("sha256").update(input.idempotencyKey).digest("hex")}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${commandId}, 0))::text`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`CANONICAL_IDENTITY:${input.identityType}:${input.identityId}`}, 0))::text`);
  const [prior] = await tx.select({ payload: financialAuditLogs.payload }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "CANONICAL_IDENTITY_RECONCILIATION"), eq(financialAuditLogs.entityId, commandId))).limit(1);
  if (prior) {
    if ((prior.payload as { fingerprint?: string } | null)?.fingerprint !== fingerprint) throw new Error("Chave de reconciliação utilizada com outros dados.");
    return commandId;
  }
  const person = input.identityType === "PF" ? requireRecord(await tx.select({ id: people.id, cpf: people.cpf }).from(people).where(eq(people.id, input.identityId)).for("update").limit(1)) : null;
  const company = input.identityType === "PJ" ? requireRecord(await tx.select({ id: companies.id, cnpj: companies.cnpj }).from(companies).where(eq(companies.id, input.identityId)).for("update").limit(1)) : null;
  const document = person ? validateCpf(person.cpf) : validateCnpj(company!.cnpj);
  if (!document.valid) throw new Error("Identidade canônica com CPF/CNPJ inválido; concilie o documento antes de vincular.");
  const taxpayer = input.taxpayerId ? requireRecord(await tx.select().from(taxpayers).where(eq(taxpayers.id, input.taxpayerId)).for("update").limit(1)) : null;
  const supplier = input.supplierId ? requireRecord(await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).for("update").limit(1)) : null;
  const creditor = input.creditorId ? requireRecord(await tx.select().from(creditors).where(eq(creditors.id, input.creditorId)).for("update").limit(1)) : null;
  const identity = { personId: person?.id ?? null, companyId: company?.id ?? null };
  for (const record of [taxpayer, supplier, creditor]) {
    if (!record) continue;
    if (record.personId && record.personId !== identity.personId || record.companyId && record.companyId !== identity.companyId) throw new Error("O cadastro já pertence a outra identidade. Vínculo e histórico foram preservados.");
  }
  if (taxpayer && taxpayer.taxpayerType !== input.identityType) throw new Error("Tipo PF/PJ do contribuinte diverge da identidade.");
  const [otherTaxpayer, otherSupplier, otherCreditor] = await Promise.all([
    taxpayer ? tx.select({ id: taxpayers.id }).from(taxpayers).where(and(person ? eq(taxpayers.personId, person.id) : eq(taxpayers.companyId, company!.id), ne(taxpayers.id, taxpayer.id))).limit(1) : [],
    supplier ? tx.select({ id: suppliers.id }).from(suppliers).where(and(person ? eq(suppliers.personId, person.id) : eq(suppliers.companyId, company!.id), ne(suppliers.id, supplier.id))).limit(1) : [],
    creditor ? tx.select({ id: creditors.id }).from(creditors).where(and(person ? eq(creditors.personId, person.id) : eq(creditors.companyId, company!.id), ne(creditors.id, creditor.id))).limit(1) : [],
  ]);
  if (otherTaxpayer.length || otherSupplier.length || otherCreditor.length) throw new Error("Identidade já vinculada a outro cadastro do mesmo papel; a duplicidade exige decisão documental, sem mesclagem automática.");
  if (creditor?.document && creditor.document.replace(/\D/g, "") !== document.normalized) throw new Error("Documento do credor diverge da identidade canônica.");
  if (creditor && supplier) {
    if (creditor.supplierId && creditor.supplierId !== supplier.id) throw new Error("Credor já vinculado a outro fornecedor.");
    if ((await tx.select({ id: creditors.id }).from(creditors).where(and(eq(creditors.supplierId, supplier.id), ne(creditors.id, creditor.id))).limit(1)).length) throw new Error("Fornecedor já possui outro credor; preserve os dois históricos até conciliação documental.");
  }
  if (creditor?.supplierId && !supplier) {
    const existingSupplier = requireRecord(await tx.select({ personId: suppliers.personId, companyId: suppliers.companyId }).from(suppliers).where(eq(suppliers.id, creditor.supplierId)).limit(1));
    if (existingSupplier.personId !== identity.personId || existingSupplier.companyId !== identity.companyId) throw new Error("Fornecedor existente do credor não possui a mesma identidade reconciliada.");
  }
  const before = { taxpayer: taxpayer && { id: taxpayer.id, personId: taxpayer.personId, companyId: taxpayer.companyId }, supplier: supplier && { id: supplier.id, personId: supplier.personId, companyId: supplier.companyId }, creditor: creditor && { id: creditor.id, personId: creditor.personId, companyId: creditor.companyId, supplierId: creditor.supplierId } };
  if (taxpayer) await tx.update(taxpayers).set(identity).where(eq(taxpayers.id, taxpayer.id));
  if (supplier) await tx.update(suppliers).set(identity).where(eq(suppliers.id, supplier.id));
  if (creditor) await tx.update(creditors).set({ ...identity, ...(supplier ? { supplierId: supplier.id } : {}) }).where(eq(creditors.id, creditor.id));
  await tx.insert(financialAuditLogs).values({ action: "CANONICAL_IDENTITY_RECONCILIATION", entityType: "CanonicalIdentity", entityId: commandId, authorUsuarioId: actorId, payload: { fingerprint, identityType: input.identityType, identityId: input.identityId, taxpayerId: input.taxpayerId ?? null, supplierId: input.supplierId ?? null, creditorId: input.creditorId ?? null, before, reason: input.reason } });
  return commandId;
}
