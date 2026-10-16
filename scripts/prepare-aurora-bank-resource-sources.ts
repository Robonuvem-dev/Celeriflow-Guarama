import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { configureBankResourceSources } from "../src/lib/financeiro/bank-resource-sources";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-bank-resource-sources-2026-v1";
const source = { id: "aurora-source-1501", code: "1501", name: "Outros recursos não vinculados", stnGroup: "1", stnSpecification: "501", referenceYear: 2026 };
const sources = ["aurora-source-1500", source.id];
const scope = [
  { governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1", bankAccountId: "aurora-finance-control-2026-v1:bank:exe" },
  { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1", bankAccountId: "aurora-finance-control-2026-v1:bank:leg" },
];
const decision = "Configuração municipal inicial ajustável autorizada: as duas contas de movimentação podem receber fontes 1500 e 1501 explicitamente. Fonte principal 1500 preservada, saldos iniciais permanecem zero, sem atribuir movimentos históricos nem criar arrecadações ou dotações da fonte adicional.";
const hash = createHash("sha256").update(JSON.stringify({ key, source, sources, scope, decision })).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
      if (!actor.ativo || !actor.employeeId || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador com autoria funcional indisponível.");
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_BANK_RESOURCE_SOURCES", entityId: key } });
      if (prior && (prior.payload as Prisma.JsonObject).configurationHash !== hash) throw new Error("Preparação anterior divergente.");
      const original = await tx.resourceSource.findUniqueOrThrow({ where: { id: sources[0] } });
      if (original.code !== "1500") throw new Error("Fonte original divergente.");
      const existing = await tx.resourceSource.findUnique({ where: { code: source.code } });
      if (existing && (existing.id !== source.id || existing.name !== source.name || existing.stnGroup !== source.stnGroup || existing.stnSpecification !== source.stnSpecification || existing.referenceYear !== source.referenceYear)) throw new Error("Fonte adicional preexistente divergente; preserve seu cadastro.");
      for (const item of scope) {
        const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: item.bankAccountId }, include: { budgetUnit: { include: { planningEntityUnit: true } }, permittedSources: { where: { isActive: true } } } });
        if (!account.isActive || account.resourceSourceId !== sources[0] || account.budgetUnitId !== item.budgetUnitId || account.budgetUnit?.planningEntityUnit?.governmentEntityId !== item.governmentEntityId) throw new Error("Conta fora da configuração municipal explícita.");
        if (!prior && account.permittedSources.length) throw new Error("Lista de fontes preexistente; preservar a configuração.");
        if (prior && JSON.stringify(account.permittedSources.map(permission => permission.resourceSourceId).sort()) !== JSON.stringify([...sources].sort())) throw new Error("Lista de fontes alterada após adoção.");
      }
      const fingerprint = async () => {
        const [row] = await tx.$queryRaw<{ value: string }[]>`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY id), '')) AS value FROM "TreasuryMovement" t`;
        return row.value;
      };
      const before = await fingerprint();
      if (apply && !prior) {
        if (!existing) await tx.resourceSource.create({ data: source });
        const db = new Proxy(tx, { get(target, property) { if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx); return Reflect.get(target, property); } }) as unknown as PrismaClient;
        for (const item of scope) await configureBankResourceSources(db, { usuarioId: actor.id, employeeId: actor.employeeId }, item.bankAccountId, sources);
        await tx.financialAuditLog.create({ data: { action: "PREPARE_BANK_RESOURCE_SOURCES", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, scope, sources, decision, parameterOrigin: "OWNER_ESTIMATE" } } });
      }
      if (await fingerprint() !== before) throw new Error("Configuração não pode alterar tesouraria histórica.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, sources, decision, treasuryPreserved: true };
    }, { timeout: 120000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
