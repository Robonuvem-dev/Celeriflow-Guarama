import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { configureAccountingPostingRule } from "../src/lib/financeiro";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-budget-posting-matrix-2026-v1";
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const accounts = [
  { suffix: "available", code: "6.2.2.1.1.00.00.00.00.00.00.00" },
  { suffix: "committed", code: "6.2.2.1.3.01.00.00.00.00.00.00" },
  { suffix: "settled", code: "6.2.2.1.3.03.00.00.00.00.00.00" },
];
const rules = [
  { eventCode: "EMPENHO_EMITIDO", eventName: "Emissão de empenho — execução orçamentária", debit: "available", credit: "committed" },
  { eventCode: "LIQUIDACAO_REGISTRADA", eventName: "Liquidação — execução orçamentária", debit: "committed", credit: "settled" },
];
const scope = [{ governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1" }, { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1" }];
const decision = "Adoção municipal para execução orçamentária das jornadas autorizadas: crédito disponível → empenhado a liquidar → liquidado a pagar, com contas escriturais oficiais TCE-PR 2026. Classificação vigente somente nas duas UGs indicadas. Configuração inicial ajustável; não constitui homologação integral da matriz, abertura de saldos, reconhecimento patrimonial do ativo/passivo ou controle de disponibilidade por fonte.";
const hash = createHash("sha256").update(JSON.stringify({ key, sourceHash, accounts, rules, scope, decision })).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    console.log(JSON.stringify(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const actor = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
      if (!actor.ativo || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador autorizado indisponível.");
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência contábil divergente.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceVersionId, kind: "ACCOUNT", code: { in: accounts.map(item => item.code) } } });
      if (entries.length !== accounts.length || entries.some(entry => {
        const attributes = entry.attributes as Prisma.JsonObject;
        return attributes.postingAllowed !== true || attributes.informationNature !== "O" || attributes.balanceNature !== "C" || attributes.sourceHash !== sourceHash;
      })) throw new Error("Contas escriturais orçamentárias não conciliadas com a referência.");
      for (const item of scope) {
        const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: item.budgetUnitId } });
        if (binding.governmentEntityId !== item.governmentEntityId) throw new Error("Escopo da adoção contábil divergente.");
      }
      const prior = await tx.financialAuditLog.findFirst({ where: { action: "PREPARE_BUDGET_POSTING_MATRIX", entityId: key } });
      if (prior && (prior.payload as Prisma.JsonObject).configurationHash !== hash) throw new Error("Adoção anterior divergente; preservar configuração.");
      for (const rule of rules) {
        const event = await tx.accountingEventCatalog.findUnique({ where: { code: rule.eventCode }, include: { rules: true } });
        if (!prior && event) throw new Error(`Evento preexistente ${rule.eventCode}; conciliar antes de configurar, sem substituir regras.`);
        if (prior && (!event?.isActive || event.rules.filter(item => item.isActive).length !== 1 || !event.rules.some(item => item.isActive && !item.isReference && item.debitAccountId === `${key}:account:${rule.debit}` && item.creditAccountId === `${key}:account:${rule.credit}`))) throw new Error(`Regra ${rule.eventCode} alterada após adoção; preservar a edição atual.`);
      }
      const before = await tx.accountingTransaction.count();
      if (apply && !prior) {
        for (const account of accounts) {
          const entry = entries.find(item => item.code === account.code)!;
          await tx.accountingPlan.create({ data: { id: `${key}:account:${account.suffix}`, code: `AURORA.BUDGET.${account.suffix.toUpperCase()}`, name: entry.name, type: "Orçamentária" } });
        }
        for (const item of scope) {
          const versionId = `${key}:catalog:${item.governmentEntityId}`;
          const editionHash = createHash("sha256").update(JSON.stringify({ configurationHash: hash, scope: item })).digest("hex");
          await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — execução orçamentária", status: "DRAFT", sourceHash: editionHash, normativeReference: decision, createdById: actor.id,
            entries: { create: accounts.map(account => {
              const entry = entries.find(candidate => candidate.code === account.code)!;
              return { kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: `${key}:account:${account.suffix}`, attributes: { ...(entry.attributes as Prisma.JsonObject), ...item, operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, adoptionScope: "BUDGET_EXECUTION_ONLY", decision } };
            }) },
          } });
          await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        }
        const db = new Proxy(tx, { get(target, property) {
          if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx);
          return Reflect.get(target, property);
        } }) as unknown as PrismaClient;
        for (const rule of rules) await configureAccountingPostingRule(db, { usuarioId: actor.id, employeeId: actor.employeeId }, { eventCode: rule.eventCode, eventName: rule.eventName, debitAccountId: `${key}:account:${rule.debit}`, creditAccountId: `${key}:account:${rule.credit}`, description: decision, isReference: false });
        await tx.financialAuditLog.create({ data: { action: "PREPARE_BUDGET_POSTING_MATRIX", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, decision, scope, sourceVersionId, sourceHash, eventCodes: rules.map(rule => rule.eventCode), accountingMovementsCreated: false } } });
      }
      if (await tx.accountingTransaction.count() !== before) throw new Error("A preparação não deve gerar lançamentos contábeis.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, rules, decision };
    }, { timeout: 120000 }), null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na adoção orçamentária."); process.exitCode = 1; });
