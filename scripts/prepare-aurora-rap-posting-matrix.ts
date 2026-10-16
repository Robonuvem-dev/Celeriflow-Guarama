import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { configureAccountingPostingRule } from "../src/lib/financeiro";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-rap-posting-matrix-2026-v1";
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const accounts = [
  { suffix: "unprocessed-pending", code: "6.3.1.1.0.00.00.00.00.00.00.00" },
  { suffix: "unprocessed-settled", code: "6.3.1.3.0.00.00.00.00.00.00.00" },
  { suffix: "unprocessed-paid", code: "6.3.1.4.0.00.00.00.00.00.00.00" },
  { suffix: "processed-pending", code: "6.3.2.1.0.00.00.00.00.00.00.00" },
  { suffix: "processed-paid", code: "6.3.2.2.0.00.00.00.00.00.00.00" },
];
const events = [
  { eventCode: "RAP_NAO_PROCESSADO_LIQUIDACAO", eventName: "RAP não processado — liquidação", debit: "unprocessed-pending", credit: "unprocessed-settled" },
  { eventCode: "RAP_NAO_PROCESSADO_PAGAMENTO", eventName: "RAP não processado liquidado — pagamento", debit: "unprocessed-settled", credit: "unprocessed-paid" },
  { eventCode: "RAP_PROCESSADO_PAGAMENTO", eventName: "RAP processado — pagamento", debit: "processed-pending", credit: "processed-paid" },
];
const scope = [{ governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1" }, { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1" }];
const decision = "Procedimento municipal inicial ajustável: execução orçamentária de RAP no exercício de 2026. Não processados a liquidar são transferidos para liquidados a pagar no ateste; pagamentos transferem saldos a pagar para pagos por tipo da inscrição. Estornos invertem as partidas originais. A abertura dos saldos inscritos, as partidas patrimoniais e a DDR são etapas complementares próprias e devem ser conciliadas antes do aceite integral.";
const hash = createHash("sha256").update(JSON.stringify({ key, sourceHash, accounts, events, scope, decision })).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
      if (!actor.ativo || !actor.employeeId || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador com autoria funcional indisponível.");
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência contábil divergente.");
      const references = await Promise.all(accounts.map(account => tx.planningCatalogEntry.findUniqueOrThrow({ where: { id: `${sourceVersionId}:${account.code}` } })));
      for (const entry of references) {
        const attributes = entry.attributes as Prisma.JsonObject;
        if (entry.kind !== "ACCOUNT" || attributes.postingAllowed !== true || attributes.informationNature !== "O" || attributes.balanceNature !== "C" || attributes.sourceHash !== sourceHash) throw new Error("Conta RAP sem referência analítica orçamentária conciliada.");
      }
      for (const item of scope) {
        const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: item.budgetUnitId } });
        if (binding.governmentEntityId !== item.governmentEntityId) throw new Error("UG fora do ente explícito.");
      }
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_RAP_POSTING_MATRIX", entityId: key } });
      if (prior && (prior.payload as Prisma.JsonObject).configurationHash !== hash) throw new Error("Preparação anterior divergente.");
      for (const expected of events) {
        const event = await tx.accountingEventCatalog.findUnique({ where: { code: expected.eventCode }, include: { rules: { include: { components: true } } } });
        if (!prior && event) throw new Error(`Preserve a configuração preexistente de ${expected.eventCode}.`);
        const active = event?.rules.filter(rule => rule.isActive) ?? [];
        if (prior && (!event?.isActive || active.length !== 1 || active[0].isReference || active[0].debitAccountId !== `${key}:account:${expected.debit}` || active[0].creditAccountId !== `${key}:account:${expected.credit}`)) throw new Error("Matriz RAP alterada após adoção.");
      }
      const before = await tx.accountingTransaction.count();
      if (apply && !prior) {
        for (const [index, account] of accounts.entries()) await tx.accountingPlan.create({ data: { id: `${key}:account:${account.suffix}`, code: `AURORA.RAP.${account.suffix.toUpperCase()}`, name: references[index].name, type: "Orçamentária" } });
        for (const item of scope) {
          const versionId = `${key}:catalog:${item.governmentEntityId}`;
          await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — execução de restos a pagar", status: "DRAFT", sourceHash: createHash("sha256").update(JSON.stringify({ hash, item })).digest("hex"), normativeReference: decision, createdById: actor.id, entries: { create: references.map((entry, index) => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: `${key}:account:${accounts[index].suffix}`, attributes: { ...(entry.attributes as Prisma.JsonObject), ...item, operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, adoptionScope: "CARRY_FORWARD_BUDGET_EXECUTION_ONLY", decision } })) } } });
          await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        }
        const db = new Proxy(tx, { get(target, property) { if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx); return Reflect.get(target, property); } }) as unknown as PrismaClient;
        for (const event of events) await configureAccountingPostingRule(db, { usuarioId: actor.id, employeeId: actor.employeeId }, { eventCode: event.eventCode, eventName: event.eventName, debitAccountId: `${key}:account:${event.debit}`, creditAccountId: `${key}:account:${event.credit}`, isReference: false, description: decision });
        await tx.financialAuditLog.create({ data: { action: "PREPARE_RAP_POSTING_MATRIX", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, scope, sourceVersionId, sourceHash, decision, accountingMovementsCreated: false } } });
      }
      if (await tx.accountingTransaction.count() !== before) throw new Error("Preparação não pode gerar movimentação financeira.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, events: events.map(event => event.eventCode), scope, decision };
    }, { timeout: 120000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
