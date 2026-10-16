import { createHash } from "node:crypto";
import { z } from "zod";
import { AccessError, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { validateCnpj, validateCpf } from "@/lib/identifiers/brazilian-identifiers";

/** Adds missing canonical links without merging records or reassigning their history. */
export async function reconcileCanonicalIdentity(context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "CADASTROS", "update")) throw new AccessError("Reconciliação cadastral não autorizada.", 403);
  const input = z.object({ identityType: z.enum(["PF", "PJ"]), identityId: z.string().trim().min(1), taxpayerId: z.string().trim().min(1).optional(), supplierId: z.string().trim().min(1).optional(), creditorId: z.string().trim().min(1).optional(), reason: z.string().trim().min(3).max(4000), idempotencyKey: z.string().trim().min(1).max(200) }).parse(raw);
  if (!input.taxpayerId && !input.supplierId && !input.creditorId) throw new Error("Selecione ao menos um cadastro a reconciliar.");
  if (input.creditorId && !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Vincular credor exige autorização financeira.", 403);
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const commandId = `identity-link:${createHash("sha256").update(input.idempotencyKey).digest("hex")}`;
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${commandId}, 0))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`CANONICAL_IDENTITY:${input.identityType}:${input.identityId}`}, 0))::text`;
    const prior = await tx.financialAuditLog.findFirst({ where: { action: "CANONICAL_IDENTITY_RECONCILIATION", entityId: commandId } });
    if (prior) {
      if ((prior.payload as { fingerprint?: string } | null)?.fingerprint !== fingerprint) throw new Error("Chave de reconciliação utilizada com outros dados.");
      return commandId;
    }
    if (input.identityType === "PF") await tx.$queryRaw`SELECT id FROM "Person" WHERE id=${input.identityId} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "Company" WHERE id=${input.identityId} FOR UPDATE`;
    const person = input.identityType === "PF" ? await tx.person.findUniqueOrThrow({ where: { id: input.identityId } }) : null;
    const company = input.identityType === "PJ" ? await tx.company.findUniqueOrThrow({ where: { id: input.identityId } }) : null;
    const document = person ? validateCpf(person.cpf) : validateCnpj(company!.cnpj);
    if (!document.valid) throw new Error("Identidade canônica com CPF/CNPJ inválido; concilie o documento antes de vincular.");
    if (input.taxpayerId) await tx.$queryRaw`SELECT id FROM "Taxpayer" WHERE id=${input.taxpayerId} FOR UPDATE`;
    if (input.supplierId) await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id=${input.supplierId} FOR UPDATE`;
    if (input.creditorId) await tx.$queryRaw`SELECT id FROM "Creditor" WHERE id=${input.creditorId} FOR UPDATE`;
    const taxpayer = input.taxpayerId ? await tx.taxpayer.findUniqueOrThrow({ where: { id: input.taxpayerId } }) : null;
    const supplier = input.supplierId ? await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId } }) : null;
    const creditor = input.creditorId ? await tx.creditor.findUniqueOrThrow({ where: { id: input.creditorId } }) : null;
    const identity = { personId: person?.id ?? null, companyId: company?.id ?? null };
    for (const record of [taxpayer, supplier, creditor]) {
      if (!record) continue;
      if (record.personId && record.personId !== identity.personId || record.companyId && record.companyId !== identity.companyId) throw new Error("O cadastro já pertence a outra identidade. Vínculo e histórico foram preservados.");
    }
    if (taxpayer && taxpayer.taxpayerType !== input.identityType) throw new Error("Tipo PF/PJ do contribuinte diverge da identidade.");
    const uniqueWhere = person ? { personId: person.id } : { companyId: company!.id };
    const [otherTaxpayer, otherSupplier, otherCreditor] = await Promise.all([
      taxpayer ? tx.taxpayer.findFirst({ where: { ...uniqueWhere, id: { not: taxpayer.id } }, select: { id: true } }) : null,
      supplier ? tx.supplier.findFirst({ where: { ...uniqueWhere, id: { not: supplier.id } }, select: { id: true } }) : null,
      creditor ? tx.creditor.findFirst({ where: { ...uniqueWhere, id: { not: creditor.id } }, select: { id: true } }) : null,
    ]);
    if (otherTaxpayer || otherSupplier || otherCreditor) throw new Error("Identidade já vinculada a outro cadastro do mesmo papel; a duplicidade exige decisão documental, sem mesclagem automática.");
    if (creditor?.document && creditor.document.replace(/\D/g, "") !== document.normalized) throw new Error("Documento do credor diverge da identidade canônica.");
    if (creditor && supplier) {
      if (creditor.supplierId && creditor.supplierId !== supplier.id) throw new Error("Credor já vinculado a outro fornecedor.");
      if (await tx.creditor.findFirst({ where: { supplierId: supplier.id, id: { not: creditor.id } }, select: { id: true } })) throw new Error("Fornecedor já possui outro credor; preserve os dois históricos até conciliação documental.");
    }
    if (creditor?.supplierId && !supplier) {
      const existingSupplier = await tx.supplier.findUniqueOrThrow({ where: { id: creditor.supplierId } });
      if (existingSupplier.personId !== identity.personId || existingSupplier.companyId !== identity.companyId) throw new Error("Fornecedor existente do credor não possui a mesma identidade reconciliada.");
    }
    const before = { taxpayer: taxpayer && { id: taxpayer.id, personId: taxpayer.personId, companyId: taxpayer.companyId }, supplier: supplier && { id: supplier.id, personId: supplier.personId, companyId: supplier.companyId }, creditor: creditor && { id: creditor.id, personId: creditor.personId, companyId: creditor.companyId, supplierId: creditor.supplierId } };
    if (taxpayer) await tx.taxpayer.update({ where: { id: taxpayer.id }, data: identity });
    if (supplier) await tx.supplier.update({ where: { id: supplier.id }, data: identity });
    if (creditor) await tx.creditor.update({ where: { id: creditor.id }, data: { ...identity, ...(supplier ? { supplierId: supplier.id } : {}) } });
    await tx.financialAuditLog.create({ data: { action: "CANONICAL_IDENTITY_RECONCILIATION", entityType: "CanonicalIdentity", entityId: commandId, authorUsuarioId: context.user.id, payload: { fingerprint, identityType: input.identityType, identityId: input.identityId, taxpayerId: input.taxpayerId ?? null, supplierId: input.supplierId ?? null, creditorId: input.creditorId ?? null, before, reason: input.reason } } });
    return commandId;
  });
}
