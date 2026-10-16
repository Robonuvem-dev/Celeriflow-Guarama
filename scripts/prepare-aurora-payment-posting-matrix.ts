import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { configureAccountingPostingRule } from "../src/lib/financeiro";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-payment-posting-matrix-2026-v1";
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const paidCode = "6.2.2.1.3.04.00.00.00.00.00.00";
const paidId = `${key}:account:paid`;
const settledId = "aurora-budget-posting-matrix-2026-v1:account:settled";
const eventCode = "PAGAMENTO_EFETIVADO";
const scope = [{ governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1" }, { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1" }];
const decision = "Procedimento municipal inicial ajustável: pagamento bruto transfere crédito empenhado liquidado a pagar para crédito empenhado pago na execução orçamentária TCE-PR 2026. O estorno inverte a postagem original. Escopo explícito das duas UGs. A partida patrimonial do passivo, banco e retenções e o controle de disponibilidade por fonte exigem matriz complementar própria.";
const hash = createHash("sha256").update(JSON.stringify({ key, sourceHash, paidCode, paidId, settledId, eventCode, scope, decision })).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
      if (!actor.ativo || !actor.employeeId || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador com autoria funcional indisponível.");
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência contábil divergente.");
      const entry = await tx.planningCatalogEntry.findUniqueOrThrow({ where: { id: `${sourceVersionId}:${paidCode}` } });
      const attributes = entry.attributes as Prisma.JsonObject;
      if (entry.kind !== "ACCOUNT" || attributes.postingAllowed !== true || attributes.informationNature !== "O" || attributes.balanceNature !== "C" || attributes.sourceHash !== sourceHash) throw new Error("Conta de crédito empenhado pago não conciliada.");
      const settled = await tx.accountingPlan.findUniqueOrThrow({ where: { id: settledId } });
      for (const item of scope) {
        const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: item.budgetUnitId } });
        if (binding.governmentEntityId !== item.governmentEntityId) throw new Error("UG fora do ente explícito.");
        const predecessor = await tx.planningCatalogEntry.findFirstOrThrow({ where: { canonicalId: settled.id, version: { status: "PUBLISHED" }, attributes: { path: ["budgetUnitId"], equals: item.budgetUnitId } } });
        if ((predecessor.attributes as Prisma.JsonObject).governmentEntityId !== item.governmentEntityId) throw new Error("Classificação de liquidado a pagar fora do ente.");
      }
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_PAYMENT_POSTING_MATRIX", entityId: key } });
      if (prior && (prior.payload as Prisma.JsonObject).configurationHash !== hash) throw new Error("Preparação anterior divergente.");
      const event = await tx.accountingEventCatalog.findUnique({ where: { code: eventCode }, include: { rules: true } });
      if (!prior && event) throw new Error("Evento de pagamento preexistente; preservar sua configuração.");
      if (prior && (!event?.isActive || event.rules.filter(rule => rule.isActive).length !== 1 || !event.rules.some(rule => rule.isActive && !rule.isReference && rule.debitAccountId === settledId && rule.creditAccountId === paidId))) throw new Error("Matriz de pagamento alterada após adoção.");
      const before = await tx.accountingTransaction.count();
      if (apply && !prior) {
        await tx.accountingPlan.create({ data: { id: paidId, code: "AURORA.BUDGET.PAID", name: entry.name, type: "Orçamentária" } });
        for (const item of scope) {
          const versionId = `${key}:catalog:${item.governmentEntityId}`;
          const editionHash = createHash("sha256").update(JSON.stringify({ configurationHash: hash, scope: item })).digest("hex");
          await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — pagamento orçamentário", status: "DRAFT", sourceHash: editionHash, normativeReference: decision, createdById: actor.id, entries: { create: { kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: paidId, attributes: { ...attributes, ...item, operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, adoptionScope: "BUDGET_EXECUTION_ONLY", decision } } } } });
          await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        }
        const db = new Proxy(tx, { get(target, property) {
          if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx);
          return Reflect.get(target, property);
        } }) as unknown as PrismaClient;
        await configureAccountingPostingRule(db, { usuarioId: actor.id, employeeId: actor.employeeId }, { eventCode, eventName: "Pagamento — execução orçamentária", debitAccountId: settledId, creditAccountId: paidId, description: decision, isReference: false });
        await tx.financialAuditLog.create({ data: { action: "PREPARE_PAYMENT_POSTING_MATRIX", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, scope, decision, sourceVersionId, sourceHash, accountingMovementsCreated: false } } });
      }
      if (await tx.accountingTransaction.count() !== before) throw new Error("A preparação não pode gerar fatos financeiros.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, eventCode, paidCode, decision };
    }, { timeout: 120000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação do pagamento."); process.exitCode = 1; });
