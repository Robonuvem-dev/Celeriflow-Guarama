import { createHash } from "node:crypto";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { sql } from "drizzle-orm";
import type { JsonObject, JsonValue } from "@/db/json";
import { findFinancialScopeYear, listCostScopeUnits } from "@/db/repositories/finance/report-scopes";
import { countClosedAccountingMonths } from "@/db/repositories/finance/accounting";
import { hasAnnualRapDependents, insertAnnualAudit, listAnnualAuditRecords, listAnnualCashOrigins, listAnnualPostings, listAnnualSourceEntries, readAnnualAudit, readAnnualResultAccount } from "@/db/repositories/finance/annual-stages";
import { postAccountingTransactionInTransaction, type FinanceActor, type AccountingLine } from "./index";
import { getBankResourceSourceBalance } from "./bank-resource-sources";
import { annualEditionSchema } from "./annual-posting-origin";
import { resolveAccountClassificationSnapshots } from "./account-catalog";

type StageInput = { stage: "OPENING" | "RESULT_CLOSE" | "BUDGET_CLOSE"; sourceFinancialYearId: string; targetFinancialYearId: string; resultAccountId: string; reason: string; requestKey: string };
type Group = { budgetUnitId: string; lines: Array<AccountingLine & { annualBalanceOriginEntryId: string; value: string }> };
const object = (value: JsonValue | undefined | null): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;

/** Native staged journal editions. Re-editions reverse only their own predecessor, never current-year activity. */
export async function executeAnnualBalanceStage(db: DatabaseConnection, actor: FinanceActor, input: StageInput) {
  if (!actor.employeeId) throw new Error("Etapa anual exige usuário vinculado ao servidor responsável.");
  if (!input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 150 || !["OPENING", "RESULT_CLOSE", "BUDGET_CLOSE"].includes(input.stage)) throw new Error("Informe etapa anual, justificativa e chave documental válidas.");
  return withDatabaseTransaction(db, async tx => {
    const [source, target] = await Promise.all([findFinancialScopeYear(tx, input.sourceFinancialYearId), findFinancialScopeYear(tx, input.targetFinancialYearId)]);
    if (!source || !target) throw new Error("Exercício da etapa anual não encontrado.");
    if (!source.governmentEntityId || target.governmentEntityId !== source.governmentEntityId || input.stage === "OPENING" && target.year !== source.year + 1 || input.stage !== "OPENING" && source.id !== target.id) throw new Error("A etapa exige exercícios sequenciais do mesmo ente; encerramento usa origem e destino iguais.");
    const units = (await listCostScopeUnits(tx, source.governmentEntityId)).sort((a, b) => a.budgetUnitId.localeCompare(b.budgetUnitId));
    if (!units.length || actor.allowedBudgetUnitIds && units.some(unit => !actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId))) throw new Error("Etapa anual exige autorização para todas as UGs do ente.");
    const stageKey = `ANNUAL_BALANCE:${input.targetFinancialYearId}:${input.stage}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${stageKey}, 0))::text`);
    for (const year of [...new Map([source, target].map(year => [year.id, year])).values()].sort((a, b) => a.year - b.year)) {
      for (let month = 0; month < 12; month++) {
        const periodKey = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, month, 1)).toISOString()}`;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${periodKey}, 0))::text`);
      }
    }
    const requestHash = createHash("sha256").update(JSON.stringify({ ...input, reason: input.reason.trim(), requestKey: input.requestKey.trim() })).digest("hex");
    const [priorRequest] = await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_COMPLETE", entityType: "AnnualBalanceEdition", entityId: stageKey, requestKey: input.requestKey.trim() }, 1);
    if (priorRequest) {
      const previous = object(priorRequest.payload);
      if (previous.requestHash !== requestHash) throw new Error("Chave anual já utilizada com outra configuração.");
      return { editionId: String(previous.editionId), replay: true, transactionIds: previous.transactionIds, provisional: previous.provisional };
    }
    const refreshedSource = await findFinancialScopeYear(tx, source.id);
    const refreshedTarget = await findFinancialScopeYear(tx, target.id);
    if (!refreshedSource || !refreshedTarget) throw new Error("Exercício da etapa anual não encontrado.");
    if (input.stage === "OPENING" && (refreshedTarget.status !== "Aberto" || !["Aberto", "Em Encerramento", "Encerrado"].includes(refreshedSource.status))) throw new Error("Abertura exige destino aberto e origem configurada para movimento ou encerrada.");
    if (input.stage !== "OPENING" && (refreshedTarget.status !== "Em Encerramento" || await countClosedAccountingMonths(tx, target.id) !== 12)) throw new Error("Encerramento exige doze competências fechadas e exercício em encerramento.");
    const date = input.stage === "OPENING" ? target.startDate : target.endDate;
    const [previousEdition] = await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_COMPLETE", entityType: "AnnualBalanceEdition", entityId: stageKey, latest: true }, 1);
    const previousUndone = previousEdition ? (await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_UNDONE", entityType: "AnnualBalanceEdition", entityId: String(object(previousEdition.payload).editionId) }, 1))[0] : null;
    if (previousEdition && !previousUndone && input.stage !== "OPENING") throw new Error("Desmovimente a etapa de encerramento vigente antes de refazê-la.");
    if (previousEdition && !previousUndone) {
      const memory = object(previousEdition.payload);
      if (!Array.isArray(memory.transactionIds) || memory.transactionIds.some(id => typeof id !== "string")) throw new Error("Edição anterior sem memória documental de partidas.");
      for (const transactionId of memory.transactionIds as string[]) {
        const [original] = await listAnnualPostings(tx, { id: transactionId }, 1);
        if (!original) throw new Error("Transação da edição anterior não encontrada.");
        if (original.reversedBy || original.financialYearId !== target.id) throw new Error("Edição anterior já estornada ou fora do exercício.");
        await postAccountingTransactionInTransaction(tx, actor, { financialYearId: target.id, governmentEntityId: source.governmentEntityId, budgetUnitId: original.budgetUnitId!, date, history: `Reedição de abertura: ${input.reason.trim()}`, sourceModule: "FINANCEIRO", sourceType: "ANNUAL_BALANCE_REVERSAL", sourceId: original.sourceId!, eventType: "ANNUAL_OPENING_REPLACED", reversalOfId: original.id, idempotencyKey: `${stageKey}:${input.requestKey}:REVERSE:${original.id}`, lines: original.entries.map(entry => ({ accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal!, originalEntryId: entry.id })) });
      }
    }
    const entries = await listAnnualSourceEntries(tx, source.id, source.endDate);
    if (entries.some(entry => !entry.transaction?.budgetUnitId || entry.transaction.governmentEntityId !== source.governmentEntityId || !units.some(unit => unit.budgetUnitId === entry.transaction!.budgetUnitId))) throw new Error("Razão de origem possui partidas fora do ente/UG conciliados.");
    const positions = new Map<string, { budgetUnitId: string; accountId: string; nature: string; dimensions: JsonObject; amount: Decimal; debitOrigin?: string; creditOrigin?: string }>();
    const financialSources = new Map<string, { budgetUnitId: string; resourceSourceId: string; assets: Decimal; liabilities: Decimal }>();
    const unclassifiedFinancialEntries: string[] = [];
    for (const entry of entries) {
      if (!entry.valueDecimal || !["Débito", "Crédito"].includes(entry.type)) throw new Error("Saldo anual exige partidas Decimal e direção conciliadas.");
      const snapshot = object(entry.classificationSnapshot ?? undefined);
      const code = typeof snapshot.externalCode === "string" ? snapshot.externalCode : "";
      const classNumber = code.replace(/\D/g, "").slice(0, 1);
      const fallback = process.env.CELERIFLOW_ACCOUNTING_MODE === "POC" ? entry.account.type === "Ativo" ? "1" : entry.account.type === "Passivo" ? "2" : entry.account.type === "VPD" ? "3" : entry.account.type === "VPA" ? "4" : "" : "";
      const classification = classNumber || fallback;
      if (!classification) throw new Error("Partida de origem sem classificação documental para etapa anual.");
      if (input.stage === "OPENING" && ["1", "2"].includes(classification)) {
        const raw = object(snapshot.dimensions);
        const msc = object(raw.msc);
        const information = object(msc.information);
        if (msc.status !== "DOCUMENTED" || !["1", "2"].includes(String(information.FP))) unclassifiedFinancialEntries.push(entry.id);
        else if (information.FP === "1") {
          if (typeof raw.resourceSourceId !== "string") unclassifiedFinancialEntries.push(entry.id);
          else {
            const key = JSON.stringify([entry.transaction!.budgetUnitId, raw.resourceSourceId]);
            const row = financialSources.get(key) ?? { budgetUnitId: entry.transaction!.budgetUnitId!, resourceSourceId: raw.resourceSourceId, assets: new Decimal(0), liabilities: new Decimal(0) };
            const signed = entry.type === "Débito" ? entry.valueDecimal : entry.valueDecimal.negated();
            if (classification === "1") row.assets = row.assets.plus(signed);
            else row.liabilities = row.liabilities.minus(signed);
            financialSources.set(key, row);
          }
        }
      }
      if (!(input.stage === "OPENING" ? ["1", "2", "7", "8"] : input.stage === "BUDGET_CLOSE" ? ["5", "6"] : ["3", "4"]).includes(classification)) continue;
      const rawDimensions = object(snapshot.dimensions);
      const dimensions = { resourceSourceId: rawDimensions.resourceSourceId ?? null, sourceClassification: rawDimensions.sourceClassification ?? null, budgetDimensions: rawDimensions.budgetDimensions ?? null, msc: rawDimensions.msc ?? null };
      const nature = ["5", "6"].includes(classification) ? "O" : ["7", "8"].includes(classification) ? "C" : "P";
      const key = JSON.stringify([entry.transaction!.budgetUnitId, entry.accountId, nature, dimensions]);
      const position = positions.get(key) ?? { budgetUnitId: entry.transaction!.budgetUnitId!, accountId: entry.accountId, nature, dimensions, amount: new Decimal(0), debitOrigin: undefined, creditOrigin: undefined };
      position.amount = entry.type === "Débito" ? position.amount.plus(entry.valueDecimal) : position.amount.minus(entry.valueDecimal);
      if (entry.type === "Débito") position.debitOrigin ??= entry.id;
      else position.creditOrigin ??= entry.id;
      positions.set(key, position);
    }
    const groups = new Map<string, Group>();
    const counterparts = new Map<string, { budgetUnitId: string; nature: string; amount: Decimal; originId: string }>();
    for (const position of positions.values()) {
      if (position.amount.isZero()) continue;
      const type = input.stage === "OPENING" ? position.amount.gt(0) ? "Débito" : "Crédito" : position.amount.gt(0) ? "Crédito" : "Débito";
      const originId = (position.amount.gt(0) ? position.debitOrigin : position.creditOrigin)!;
      const group = groups.get(position.budgetUnitId) ?? { budgetUnitId: position.budgetUnitId, lines: [] };
      group.lines.push({ accountId: position.accountId, type, value: position.amount.abs().toFixed(2), annualBalanceOriginEntryId: originId });
      groups.set(position.budgetUnitId, group);
      const key = JSON.stringify([position.budgetUnitId, position.nature, position.dimensions.resourceSourceId, position.dimensions.sourceClassification, position.dimensions.budgetDimensions]);
      const counterpart = counterparts.get(key) ?? { budgetUnitId: position.budgetUnitId, nature: position.nature, amount: new Decimal(0), originId };
      counterpart.amount = counterpart.amount.plus(input.stage === "OPENING" ? position.amount : position.amount.negated());
      counterparts.set(key, counterpart);
    }
    for (const counterpart of counterparts.values()) {
      if (counterpart.amount.isZero()) continue;
      if (counterpart.nature !== "P" || !input.resultAccountId) throw new Error("Saldo orçamentário/de controle desequilibrado por UG/fonte/dimensões ou conta explícita de resultado ausente.");
      const resultAccount = await readAnnualResultAccount(tx, input.resultAccountId);
      const classification = (await resolveAccountClassificationSnapshots(tx, [resultAccount], date, { governmentEntityId: source.governmentEntityId, budgetUnitId: counterpart.budgetUnitId })).get(resultAccount.id);
      if (classification ? !String(classification.externalCode).replace(/\D/g, "").startsWith("23") : process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC" || resultAccount.type !== "Passivo") throw new Error("Contrapartida anual exige conta patrimonial de resultado acumulado documentada.");
      groups.get(counterpart.budgetUnitId)!.lines.push({ accountId: input.resultAccountId, type: counterpart.amount.gt(0) ? "Crédito" : "Débito", value: counterpart.amount.abs().toFixed(2), annualBalanceOriginEntryId: counterpart.originId });
    }
    const provisional = input.stage === "OPENING" && refreshedSource.status !== "Encerrado";
    const cashBalances = [];
    if (input.stage === "OPENING") {
      const banks = await listAnnualCashOrigins(tx, units.map(unit => unit.budgetUnitId), source.endDate);
      for (const bank of banks) {
        const { movements, redistributions } = bank;
        if (movements.some(row => !row.resourceSourceId)) throw new Error("Abertura bancária exige fonte documental nos movimentos históricos.");
        const sourceIds = [...new Set([...(bank.resourceSourceId ? [bank.resourceSourceId] : []), ...bank.permittedSources.map(row => row.resourceSourceId), ...movements.map(row => row.resourceSourceId!), ...redistributions.flatMap(row => [row.sourceResourceSourceId, row.destinationResourceSourceId])])];
        for (const resourceSourceId of sourceIds) cashBalances.push({ bankAccountId: bank.id, budgetUnitId: bank.budgetUnitId, resourceSourceId, cash: (await getBankResourceSourceBalance(tx, bank.id, resourceSourceId, source.endDate)).toFixed(2) });
      }
    }
    const editionData = { stage: input.stage, sourceFinancialYearId: source.id, targetFinancialYearId: target.id, governmentEntityId: source.governmentEntityId, date: date.toISOString(), groups: [...groups.values()] };
    annualEditionSchema.parse(editionData);
    const financialPosition = input.stage === "OPENING" ? { status: unclassifiedFinancialEntries.length ? "NOT_RECONCILED" : "DOCUMENTED", unclassifiedEntryIds: unclassifiedFinancialEntries, rows: [...financialSources.values()].map(row => ({ budgetUnitId: row.budgetUnitId, resourceSourceId: row.resourceSourceId, financialAssets: row.assets.toFixed(2), financialLiabilities: row.liabilities.toFixed(2), deficitSurplus: row.assets.minus(row.liabilities).toFixed(2) })) } : null;
    const edition = await insertAnnualAudit(tx, { action: "ANNUAL_BALANCE_EDITION", entityType: "AnnualBalanceEdition", entityId: stageKey, financialYearId: target.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ ...editionData, provisional, reason: input.reason.trim(), cashBalances, financialPosition, predecessorEditionId: previousEdition ? object(previousEdition.payload).editionId : null }) });
    const transactionIds = [];
    for (const group of groups.values()) {
      const posting = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: target.id, governmentEntityId: source.governmentEntityId, budgetUnitId: group.budgetUnitId, date, history: `${input.stage === "OPENING" ? "Abertura anual" : input.stage === "BUDGET_CLOSE" ? "Encerramento orçamentário" : "Encerramento de resultado"}: ${input.reason.trim()}`, sourceModule: "FINANCEIRO", sourceType: "ANNUAL_BALANCE", sourceId: edition.id, eventType: `ANNUAL_${input.stage}`, idempotencyKey: `${edition.id}:${group.budgetUnitId}`, lines: group.lines });
      transactionIds.push(posting.id);
    }
    await insertAnnualAudit(tx, { action: "ANNUAL_BALANCE_COMPLETE", entityType: "AnnualBalanceEdition", entityId: stageKey, financialYearId: target.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ editionId: edition.id, transactionIds, provisional, requestKey: input.requestKey.trim(), requestHash, cashBalances }) });
    return { editionId: edition.id, replay: false, transactionIds, provisional };
  }, { timeoutMs: 120000 });
}

export async function undoAnnualResultStage(db: DatabaseConnection, actor: FinanceActor, input: { editionId: string; reason: string }) {
  return undoAnnualClosingStage(db, actor, input, "RESULT_CLOSE");
}

export async function undoAnnualBudgetStage(db: DatabaseConnection, actor: FinanceActor, input: { editionId: string; reason: string }) {
  return undoAnnualClosingStage(db, actor, input, "BUDGET_CLOSE");
}

export async function undoAnnualRapPostingStage(db: DatabaseConnection, actor: FinanceActor, input: { editionId: string; reason: string }) {
  return undoAnnualClosingStage(db, actor, input, "RAP_REGISTRATION");
}

async function undoAnnualClosingStage(db: DatabaseConnection, actor: FinanceActor, input: { editionId: string; reason: string }, stage: "RESULT_CLOSE" | "BUDGET_CLOSE" | "RAP_REGISTRATION") {
  if (!actor.employeeId || !input.reason.trim()) throw new Error("Informe servidor responsável e justificativa para desmovimentação.");
  return withDatabaseTransaction(db, async tx => {
    const edition = await readAnnualAudit(tx, input.editionId);
    const data = annualEditionSchema.parse(edition.payload);
    if (edition.action !== "ANNUAL_BALANCE_EDITION" || edition.entityType !== "AnnualBalanceEdition" || data.stage !== stage) throw new Error("Selecione uma edição compatível com a etapa de encerramento solicitada.");
    const units = await listCostScopeUnits(tx, data.governmentEntityId);
    if (!units.length || actor.allowedBudgetUnitIds && units.some(unit => !actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId))) throw new Error("Desmovimentação exige autorização para todas as UGs do ente.");
    const stageKey = `ANNUAL_BALANCE:${data.targetFinancialYearId}:${stage}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${stageKey}, 0))::text`);
    const year = await findFinancialScopeYear(tx, data.targetFinancialYearId);
    if (!year) throw new Error("Exercício da etapa anual não encontrado.");
    for (let month = 0; month < 12; month++) {
      const key = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, month, 1)).toISOString()}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
    }
    const [already] = await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_UNDONE", entityType: "AnnualBalanceEdition", entityId: edition.id }, 1);
    if (already) return { replay: true, editionId: edition.id };
    const refreshed = await findFinancialScopeYear(tx, year.id);
    if (refreshed?.status !== "Em Encerramento") throw new Error("Desmovimentação exige exercício em encerramento, anterior à validação final.");
    const [latest] = await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_COMPLETE", entityType: "AnnualBalanceEdition", entityId: stageKey, latest: true }, 1);
    if (!latest || object(latest.payload).editionId !== edition.id) throw new Error("Somente a edição de resultado vigente pode ser desmovimentada.");
    const [dependent] = await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_EDITION", since: edition.createdAt, sourceFinancialYearId: year.id, differentFinancialYearId: year.id }, 1);
    if (dependent) throw new Error("Exercício possui abertura posterior dependente; concilie essa abertura antes de desmovimentar o resultado.");
    if (stage === "RAP_REGISTRATION") {
      const [budgetEdition] = await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_COMPLETE", entityId: `ANNUAL_BALANCE:${year.id}:BUDGET_CLOSE`, latest: true }, 1);
      const budgetEditionId = budgetEdition ? object(budgetEdition.payload).editionId : null;
      if (typeof budgetEditionId === "string" && !(await listAnnualAuditRecords(tx, { action: "ANNUAL_BALANCE_UNDONE", entityId: budgetEditionId }, 1)).length) throw new Error("Desmovimente o encerramento orçamentário dependente antes das partidas de inscrição RAP.");
      if (await hasAnnualRapDependents(tx, year.id)) throw new Error("Desfaça a execução e os transportes posteriores antes de desmovimentar as partidas RAP.");
    }
    const postings = await listAnnualPostings(tx, { sourceType: "ANNUAL_BALANCE", sourceId: edition.id });
    if (postings.some(posting => posting.reversedBy)) throw new Error("Edição possui estorno anterior fora desta desmovimentação.");
    const reversalIds = [];
    for (const posting of postings) {
      const reversal = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, governmentEntityId: data.governmentEntityId, budgetUnitId: posting.budgetUnitId!, date: year.endDate, sourceModule: "FINANCEIRO", sourceType: "ANNUAL_BALANCE_REVERSAL", sourceId: edition.id, eventType: `ANNUAL_${stage}_UNDONE`, history: `Desmovimentação ${stage === "BUDGET_CLOSE" ? "orçamentária" : "de resultado"}: ${input.reason.trim()}`, reversalOfId: posting.id, idempotencyKey: `ANNUAL_UNDO:${edition.id}:${posting.id}`, lines: posting.entries.map(entry => ({ accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal!, originalEntryId: entry.id })) });
      reversalIds.push(reversal.id);
    }
    await insertAnnualAudit(tx, { action: "ANNUAL_BALANCE_UNDONE", entityType: "AnnualBalanceEdition", entityId: edition.id, financialYearId: year.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ reason: input.reason.trim(), reversalIds }) });
    return { replay: false, editionId: edition.id };
  }, { timeoutMs: 120000 });
}
