import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { postAccountingTransactionInTransaction, type FinanceActor, type AccountingLine } from "./index";
import { assertAnnualPayableRegistrations } from "./annual-payable-registration";
import { resolveFinancialReportScope } from "./report-scope";
import { annualEditionSchema } from "./annual-posting-origin";

const object = (value: Prisma.JsonValue | null | undefined): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const stageKey = (year: string) => `ANNUAL_BALANCE:${year}:RAP_REGISTRATION`;

async function activeEdition(tx: Prisma.TransactionClient, financialYearId: string) {
  const complete = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_BALANCE_COMPLETE", entityType: "AnnualBalanceEdition", entityId: stageKey(financialYearId) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!complete) return null;
  const editionId = object(complete.payload).editionId;
  if (typeof editionId !== "string") throw new Error("Memória de partidas RAP sem edição documental.");
  if (await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_BALANCE_UNDONE", entityType: "AnnualBalanceEdition", entityId: editionId } })) return null;
  return tx.financialAuditLog.findUniqueOrThrow({ where: { id: editionId } });
}

export async function assertNoActiveAnnualRapPosting(tx: Prisma.TransactionClient, financialYearId: string) {
  if (await activeEdition(tx, financialYearId)) throw new Error("Desmovimente as partidas específicas de RAP antes de alterar as inscrições anuais.");
}

export async function assertAnnualRapPostings(tx: Prisma.TransactionClient, financialYearId: string) {
  const payables = await tx.payableCarryForward.findMany({ where: { financialYearId, originFinancialYearId: financialYearId, status: "PENDENTE" }, orderBy: { id: "asc" }, select: { id: true, valueDecimal: true, type: true } });
  const edition = await activeEdition(tx, financialYearId);
  if (!payables.length && !edition) return;
  if (!edition) throw new Error("Publique as partidas específicas de inscrição RAP antes da validação final.");
  const memory = object(edition.payload);
  const rows = memory.registrations;
  const expected = payables.map(row => JSON.stringify([row.id, row.type, row.valueDecimal.toFixed(2)])).sort();
  const persisted = Array.isArray(rows) ? rows.map(row => { const value = object(row); return JSON.stringify([value.payableId, value.type, value.value]); }).sort() : [];
  if (JSON.stringify(expected) !== JSON.stringify(persisted)) throw new Error("Partidas RAP divergem das inscrições vigentes; desmovimente e publique nova edição.");
  const data = annualEditionSchema.parse(edition.payload);
  const postings = await tx.accountingTransaction.findMany({ where: { sourceType: "ANNUAL_BALANCE", sourceId: edition.id }, include: { entries: true, reversedBy: true } });
  if (postings.length !== data.groups.length) throw new Error("Edição RAP possui partidas ausentes.");
  for (const group of data.groups) {
    const posting = postings.find(row => row.budgetUnitId === group.budgetUnitId);
    const key = (accountId: string, type: string, value: string, origin: unknown) => JSON.stringify([accountId, type, value, origin]);
    if (!posting || posting.status !== "POSTADO" || posting.reversedBy || posting.financialYearId !== financialYearId || posting.governmentEntityId !== data.governmentEntityId || posting.eventType !== "ANNUAL_RAP_REGISTRATION" || posting.date.toISOString() !== data.date || JSON.stringify(posting.entries.map(row => key(row.accountId, row.type, row.valueDecimal?.toFixed(2) ?? "", object(row.classificationSnapshot).annualBalanceOriginEntryId)).sort()) !== JSON.stringify(group.lines.map(row => key(row.accountId, row.type, row.value, row.annualBalanceOriginEntryId)).sort())) throw new Error("Composição publicada da inscrição RAP diverge da memória anual.");
  }
}

/** Explicit matrices include the budget and DDR pairs. No municipal accounts are inferred. */
export async function executeAnnualRapPostings(db: PrismaClient, actor: FinanceActor, input: { financialYearId: string; reason: string; requestKey: string }) {
  if (!actor.employeeId || !input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 150) throw new Error("Informe servidor, justificativa e chave documental das partidas RAP.");
  return db.$transaction(async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.fullEntity || !scope.governmentEntityId) throw new Error("Partidas anuais RAP exigem autorização para todas as UGs do ente.");
    const key = stageKey(input.financialYearId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    // Same order as ordinary event posting: rule before accounting period.
    // Keep main pair and complementary pairs from one configuration edition.
    for (const eventCode of ["RAP_NAO_PROCESSADO_INSCRICAO", "RAP_PROCESSADO_INSCRICAO"]) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTING_RULE:${eventCode}`}, 0))::text`;
    const year = await tx.financialYear.findUniqueOrThrow({ where: { id: input.financialYearId } });
    for (let month = 0; month < 12; month++) { const period = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${period}, 0))::text`; }
    const requestHash = createHash("sha256").update(JSON.stringify({ ...input, reason: input.reason.trim(), requestKey: input.requestKey.trim() })).digest("hex");
    const previous = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_BALANCE_COMPLETE", entityId: key, payload: { path: ["requestKey"], equals: input.requestKey.trim() } } });
    if (previous) { const payload = object(previous.payload); if (payload.requestHash !== requestHash) throw new Error("Chave das partidas RAP já usada com outros dados."); return { editionId: String(payload.editionId), replay: true }; }
    if ((await tx.financialYear.findUniqueOrThrow({ where: { id: year.id } })).status !== "Em Encerramento" || await tx.monthlyAccountingClose.count({ where: { financialYearId: year.id, status: "FECHADO" } }) !== 12) throw new Error("Partidas RAP exigem exercício em encerramento e doze competências fechadas.");
    await assertNoActiveAnnualRapPosting(tx, year.id);
    await assertAnnualPayableRegistrations(tx, year.id);
    const payables = await tx.payableCarryForward.findMany({ where: { financialYearId: year.id, originFinancialYearId: year.id, status: "PENDENTE" }, include: { commitment: { select: { appropriation: { select: { budgetUnitId: true, resourceSourceId: true } } } } }, orderBy: { id: "asc" } });
    const groups = new Map<string, { budgetUnitId: string; lines: Array<AccountingLine & { value: string; annualBalanceOriginEntryId: string }> }>();
    const matrices = await tx.accountingEventCatalog.findMany({ where: { code: { in: ["RAP_PROCESSADO_INSCRICAO", "RAP_NAO_PROCESSADO_INSCRICAO"] } }, include: { rules: { where: { isActive: true }, include: { components: { orderBy: { sequence: "asc" } } } } } });
    const registrations = [];
    for (const payable of payables) {
      const origin = payable.commitment.appropriation;
      const eventCode = payable.type === "PROCESSADO" ? "RAP_PROCESSADO_INSCRICAO" : "RAP_NAO_PROCESSADO_INSCRICAO";
      const event = matrices.find(row => row.code === eventCode);
      if (!event?.isActive || event.rules.length !== 1 || event.rules[0].isReference && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") throw new Error(`Adote uma matriz explícita para ${eventCode}, incluindo as partidas orçamentárias e DDR aplicáveis.`);
      const rule = event.rules[0];
      if (rule.components.some(component => component.valueBasis !== "EVENT_VALUE" || component.creditFromOriginBank)) throw new Error("Inscrição RAP aceita somente pares de valor inscrito, sem bases de pagamento/banco.");
      const originals = await tx.accountingTransaction.findMany({ where: { financialYearId: year.id, sourceModule: "FINANCEIRO", sourceType: "COMMITMENT", sourceId: payable.commitmentId, eventType: "EMPENHO_EMITIDO", status: "POSTADO", governmentEntityId: scope.governmentEntityId, budgetUnitId: origin.budgetUnitId }, include: { entries: true }, take: 2 });
      const entry = originals.length === 1 ? originals[0].entries.find(row => object(object(row.classificationSnapshot).dimensions).resourceSourceId === origin.resourceSourceId) : undefined;
      if (!entry || !origin.resourceSourceId) throw new Error("Inscrição RAP exige a fonte/dimensões da postagem documental original do empenho.");
      const group = groups.get(origin.budgetUnitId) ?? { budgetUnitId: origin.budgetUnitId, lines: [] };
      for (const pair of [{ debitAccountId: rule.debitAccountId, creditAccountId: rule.creditAccountId }, ...rule.components]) group.lines.push({ accountId: pair.debitAccountId, type: "Débito", value: payable.valueDecimal.toFixed(2), annualBalanceOriginEntryId: entry.id }, { accountId: pair.creditAccountId, type: "Crédito", value: payable.valueDecimal.toFixed(2), annualBalanceOriginEntryId: entry.id });
      groups.set(origin.budgetUnitId, group);
      registrations.push({ payableId: payable.id, commitmentId: payable.commitmentId, type: payable.type, value: payable.valueDecimal.toFixed(2), eventCode, ruleId: rule.id, originEntryId: entry.id });
    }
    const data = { stage: "RAP_REGISTRATION", sourceFinancialYearId: year.id, targetFinancialYearId: year.id, governmentEntityId: scope.governmentEntityId, date: year.endDate.toISOString(), groups: [...groups.values()] };
    annualEditionSchema.parse(data);
    const edition = await tx.financialAuditLog.create({ data: { action: "ANNUAL_BALANCE_EDITION", entityType: "AnnualBalanceEdition", entityId: key, financialYearId: year.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ ...data, registrations, reason: input.reason.trim(), provisional: false }) } });
    const transactionIds = [];
    for (const group of groups.values()) {
      const posting = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, governmentEntityId: scope.governmentEntityId, budgetUnitId: group.budgetUnitId, date: year.endDate, sourceModule: "FINANCEIRO", sourceType: "ANNUAL_BALANCE", sourceId: edition.id, eventType: "ANNUAL_RAP_REGISTRATION", history: `Inscrição contábil RAP: ${input.reason.trim()}`, idempotencyKey: `${edition.id}:${group.budgetUnitId}`, lines: group.lines });
      transactionIds.push(posting.id);
    }
    await tx.financialAuditLog.create({ data: { action: "ANNUAL_BALANCE_COMPLETE", entityType: "AnnualBalanceEdition", entityId: key, financialYearId: year.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ editionId: edition.id, transactionIds, requestKey: input.requestKey.trim(), requestHash, provisional: false }) } });
    return { editionId: edition.id, replay: false };
  }, { timeout: 120000 });
}
