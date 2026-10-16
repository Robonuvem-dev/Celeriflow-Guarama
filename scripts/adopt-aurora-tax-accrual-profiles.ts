import { config } from "dotenv";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const catalogVersionId = "aurora-tax-accrual-accounts-2026-v1";
const catalogHash = "87804d9fcb481ded62b0b7834c4b311aa3a382fa833c33766039e7a1713fc77d";
const rows = [
  { taxId: "tax_iptu", right: "1.1.2.1.1.01.05.00.00.00.00.00", vpa: "4.1.1.2.1.02.00.00.00.00.00.00", deduction: "4.1.1.2.1.97.02.00.00.00.00.00" },
  { taxId: "tax_itbi", right: "1.1.2.1.1.01.06.00.00.00.00.00", vpa: "4.1.1.2.1.04.00.00.00.00.00.00", deduction: "4.1.1.2.1.97.04.00.00.00.00.00" },
  { taxId: "tax_issqn", right: "1.1.2.1.1.01.07.00.00.00.00.00", vpa: "4.1.1.3.1.02.00.00.00.00.00.00", deduction: "4.1.1.3.1.97.02.00.00.00.00.00" },
];
const from = new Date("2026-01-01T00:00:00.000Z");
const until = new Date("2026-12-31T23:59:59.999Z");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${catalogVersionId}, 0))::text`;
      const catalog = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: catalogVersionId }, include: { entries: true } });
      if (catalog.status !== "PUBLISHED" || catalog.sourceHash !== catalogHash || catalog.year !== 2026) throw new Error("Edição municipal tributária divergente.");
      const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      const result = [];
      for (const row of rows) {
        const mapping = await tx.taxFinancialMapping.findUnique({ where: { taxId: row.taxId }, include: { tax: true, defaultBankAccount: true } });
        if (!mapping) {
          result.push({ taxId: row.taxId, active: false, status: "AGUARDANDO_VINCULO_FINANCEIRO", reason: "Vincule natureza, fonte e conta arrecadadora municipal com UG antes da ativação." });
          continue;
        }
        const budgetUnitId = mapping.defaultBankAccount.budgetUnitId;
        if (!mapping.isActive || !mapping.tax.isActive || !mapping.defaultBankAccount.isActive || !budgetUnitId) throw new Error(`Origem tributária sem UG ativa: ${row.taxId}.`);
        const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId } });
        const account = (code: string) => {
          const entries = catalog.entries.filter(entry => entry.kind === "ACCOUNT" && entry.code === code);
          if (entries.length !== 1 || !entries[0].canonicalId) throw new Error(`Conta municipal sem vínculo único: ${code}.`);
          return entries[0].canonicalId;
        };
        const id = `aurora-tax-profile:${row.taxId}:${budgetUnitId}:2026:v1`;
        const data: Prisma.JsonObject = { budgetUnitId, governmentEntityId: binding.governmentEntityId, catalogVersionId, catalogHash, receivableAccountId: account(row.right), revenueAccountId: account(row.vpa), deductionAccountId: account(row.deduction), lossAccountId: account("3.6.5.1.1.03.00.00.00.00.00.00"), decision: "Procedimento municipal estimado: reconhecimento na constituição e baixa do direito no recebimento; legados preservados sem reconhecimento retroativo." };
        const existing = await tx.taxRegistryEntry.findUnique({ where: { id } });
        if (existing) {
          const stored = existing.data as Prisma.JsonObject;
          if (existing.entityType !== "TAX" || existing.entityId !== row.taxId || existing.category !== "ACCOUNTING_PROFILE" || existing.status !== "ATIVO" || existing.effectiveFrom.getTime() !== from.getTime() || existing.effectiveUntil?.getTime() !== until.getTime() || Object.keys(stored).length !== Object.keys(data).length || Object.entries(data).some(([key, value]) => stored[key] !== value)) throw new Error(`Perfil municipal publicado divergente: ${id}.`);
        }
        const overlapping = await tx.taxRegistryEntry.count({ where: { id: { not: id }, entityType: "TAX", entityId: row.taxId, category: "ACCOUNTING_PROFILE", status: "ATIVO", effectiveFrom: { lte: until }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: from } }], data: { path: ["budgetUnitId"], equals: budgetUnitId } } });
        if (overlapping) throw new Error(`Perfil municipal sobreposto: ${id}.`);
        if (apply && !existing) {
          await tx.taxRegistryEntry.create({ data: { id, entityType: "TAX", entityId: row.taxId, category: "ACCOUNTING_PROFILE", title: `${mapping.tax.name} — reconhecimento patrimonial por UG 2026`, status: "ATIVO", source: "MUNICIPAL", effectiveFrom: from, effectiveUntil: until, actorUsuarioId: actor.id, data } });
          await tx.taxAuditLog.create({ data: { action: "ADOPT_TAX_ACCOUNTING_PROFILE", entityType: "TaxRegistryEntry", entityId: id, authorUsuarioId: actor.id, payload: data } });
        }
        result.push({ id, existing: Boolean(existing), active: apply || Boolean(existing), ...data });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", profiles: result };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
