import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type AccountingTransaction } from "@prisma/client";
import { z } from "zod";
import { resolveFinancialReportScope } from "./report-scope";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export const fiscalIndexCodes = ["HEALTH_MINIMUM", "EDUCATION_MINIMUM"] as const;
export type FiscalIndexCode = typeof fiscalIndexCodes[number];
type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type Tx = Prisma.TransactionClient;
export class FiscalIndexError extends Error {}
const ids = z.array(z.string().trim().min(1)).min(1).max(500).refine(values => new Set(values).size === values.length, "Referências repetidas.");
export const fiscalIndexTermSchema = z.object({ label: z.string().trim().min(1).max(300), accountIds: ids, side: z.enum(["DEBIT_NET", "CREDIT_NET"]), operation: z.enum(["ADD", "SUBTRACT"]), sourceTypes: ids.optional(), budgetUnitIds: ids.optional(), functionCodes: z.array(z.string().regex(/^\d{2}$/)).min(1).optional() }).strict();
export const fiscalIndexDefinitionSchema = z.object({ numerator: z.array(fiscalIndexTermSchema).min(1).max(100), denominator: z.array(fiscalIndexTermSchema).min(1).max(100) }).strict();
export type FiscalIndexDefinition = z.infer<typeof fiscalIndexDefinitionSchema>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function scopeFor(tx: Tx, actor: Actor, financialYearId: string) {
  const scope = await resolveFinancialReportScope(tx, financialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
  if (!scope.governmentEntityId || !scope.fullEntity || !scope.budgetUnitIds?.length) throw new FiscalIndexError("Índice constitucional exige exercício do ente e autorização de todas as suas UGs.");
  return scope;
}

export async function defineMunicipalFiscalIndex(db: PrismaClient, actor: Actor, input: { financialYearId: string; code: FiscalIndexCode; legalReference: string; minimumPercentage: string; effectiveFrom: Date; reason: string; definition: FiscalIndexDefinition }) {
  const definition = fiscalIndexDefinitionSchema.parse(input.definition);
  const minimum = new Prisma.Decimal(input.minimumPercentage);
  if (!fiscalIndexCodes.includes(input.code) || !input.legalReference?.trim() || !input.reason?.trim() || !Number.isFinite(input.effectiveFrom.getTime()) || !minimum.isFinite() || minimum.lte(0) || minimum.gt(100) || minimum.decimalPlaces() > 4) throw new FiscalIndexError("Informe fundamento, vigência, justificativa e percentual mínimo válido.");
  return db.$transaction(async tx => {
    const scope = await scopeFor(tx, actor, input.financialYearId);
    const entity = await tx.governmentEntity.findUniqueOrThrow({ where: { id: scope.governmentEntityId! }, select: { type: true } });
    if (entity.type !== "PREFEITURA") throw new FiscalIndexError("Mínimos municipais de Saúde/Educação exigem composição do ente executivo; não aplicar à Câmara isoladamente.");
    if (input.effectiveFrom.getUTCFullYear() !== scope.year) throw new FiscalIndexError("Vigência da composição fiscal deve pertencer ao exercício.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_INDEX:${input.financialYearId}:${input.code}`}, 0))::text`;
    for (const term of [...definition.numerator, ...definition.denominator]) {
      if (term.budgetUnitIds?.some(id => !scope.budgetUnitIds!.includes(id))) throw new FiscalIndexError("Componente fiscal contém UG de outro ente.");
      const accounts = await tx.accountingPlan.findMany({ where: { id: { in: term.accountIds } }, select: { id: true, code: true } });
      if (accounts.length !== term.accountIds.length) throw new FiscalIndexError("Componente fiscal contém conta contábil inexistente.");
      if (await tx.accountingPlan.count({ where: { OR: accounts.map(account => ({ code: { startsWith: `${account.code}.` } })) } })) throw new FiscalIndexError("A composição fiscal exige contas analíticas, sem contas-filhas.");
    }
    const last = await tx.municipalFiscalIndexDefinition.findFirst({ where: { financialYearId: input.financialYearId, code: input.code }, orderBy: { revision: "desc" }, select: { revision: true } });
    const record = await tx.municipalFiscalIndexDefinition.create({ data: { financialYearId: input.financialYearId, code: input.code, revision: (last?.revision ?? 0) + 1, legalReference: input.legalReference.trim(), minimumPercentage: minimum, effectiveFrom: input.effectiveFrom, reason: input.reason.trim(), actorId: actor.usuarioId, definition: json(definition) } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_FISCAL_INDEX_DEFINITION", targetId: record.id });
    return record;
  });
}

/** Same dated Decimal accounting facts for diagnostics, index monitoring and reports. */
export async function readMunicipalFiscalIndex(tx: Tx, actor: Actor, input: { financialYearId: string; code: FiscalIndexCode; through: Date }) {
  const scope = await scopeFor(tx, actor, input.financialYearId);
  if (!Number.isFinite(input.through.getTime()) || input.through.getUTCFullYear() !== scope.year || input.through > new Date()) throw new FiscalIndexError("Corte fiscal inválido ou futuro.");
  const definition = await tx.municipalFiscalIndexDefinition.findFirst({ where: { financialYearId: input.financialYearId, code: input.code, effectiveFrom: { lte: input.through } }, orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }] });
  const base = { code: input.code, financialYearId: input.financialYearId, governmentEntityId: scope.governmentEntityId, through: input.through.toISOString(), definitionId: definition?.id ?? null };
  const entity = await tx.governmentEntity.findUniqueOrThrow({ where: { id: scope.governmentEntityId! }, select: { type: true } });
  if (entity.type !== "PREFEITURA") return { ...base, status: "NOT_EVALUATED" as const, issues: ["Mínimos municipais de Saúde/Educação não são aplicáveis à Câmara isoladamente; consultar o ente executivo."], numerator: null, denominator: null, percentage: null, minimum: null, rows: [], sourceHash: null };
  if (!definition) return { ...base, status: "NOT_EVALUATED" as const, issues: ["Composição/fundamento fiscal não configurados."], numerator: null, denominator: null, percentage: null, minimum: null, rows: [], sourceHash: null };
  const config = fiscalIndexDefinitionSchema.parse(definition.definition);
  const start = new Date(Date.UTC(scope.year, 0, 1));
  const closes = await tx.monthlyAccountingClose.findMany({ where: { financialYearId: input.financialYearId, competence: { gte: start, lte: input.through }, status: "FECHADO" }, select: { id: true, competence: true } });
  const issues: string[] = [];
  const finalDay = new Date(Date.UTC(scope.year, input.through.getUTCMonth() + 1, 0)).getUTCDate();
  if (input.through.getUTCDate() !== finalDay || input.through.getUTCHours() !== 23 || input.through.getUTCMinutes() !== 59 || input.through.getUTCSeconds() !== 59 || input.through.getUTCMilliseconds() !== 999) issues.push("Corte fiscal não encerra uma competência mensal completa.");
  for (let month = 0; month <= input.through.getUTCMonth(); month++) if (!closes.some(close => close.competence.getUTCMonth() === month)) issues.push(`Competência ${scope.year}-${String(month + 1).padStart(2, "0")} sem fechamento confirmado.`);
  const terms = [...config.numerator, ...config.denominator];
  const entries = await tx.accountingEntry.findMany({ where: { accountId: { in: [...new Set(terms.flatMap(term => term.accountIds))] }, transaction: { financialYearId: input.financialYearId, governmentEntityId: scope.governmentEntityId, budgetUnitId: { in: scope.budgetUnitIds }, status: "POSTADO", date: { gte: start, lte: input.through } } }, include: { transaction: true }, orderBy: { id: "asc" } });
  const reversalIds = [...new Set(entries.flatMap(entry => entry.transaction?.reversalOfId ? [entry.transaction.reversalOfId] : []))];
  const originals = new Map<string, AccountingTransaction>();
  for (let offset = 0; offset < reversalIds.length; offset += 500) for (const transaction of await tx.accountingTransaction.findMany({ where: { id: { in: reversalIds.slice(offset, offset + 500) } } })) originals.set(transaction.id, transaction);
  const originFor = (transaction: NonNullable<typeof entries[number]["transaction"]>) => transaction.reversalOfId ? originals.get(transaction.reversalOfId) ?? transaction : transaction;
  const functionByTransaction = new Map<string, string | null>();
  if (terms.some(term => term.functionCodes?.length)) for (const transaction of new Map(entries.map(entry => [entry.transactionId!, entry.transaction!])).values()) {
    const source = originFor(transaction);
    let appropriationId: string | null = null;
    if (source.sourceId && source.sourceType === "SETTLEMENT") appropriationId = (await tx.settlement.findUnique({ where: { id: source.sourceId }, select: { commitment: { select: { appropriationId: true } } } }))?.commitment.appropriationId ?? null;
    if (source.sourceId && source.sourceType === "PAYMENT") appropriationId = (await tx.payment.findUnique({ where: { id: source.sourceId }, select: { commitment: { select: { appropriationId: true } } } }))?.commitment.appropriationId ?? null;
    if (source.sourceId && source.sourceType === "COMMITMENT") appropriationId = (await tx.commitment.findUnique({ where: { id: source.sourceId }, select: { appropriationId: true } }))?.appropriationId ?? null;
    if (source.sourceId && source.sourceType === "COMMITMENT_MOVEMENT") appropriationId = (await tx.commitmentMovement.findUnique({ where: { id: source.sourceId }, select: { commitment: { select: { appropriationId: true } } } }))?.commitment.appropriationId ?? null;
    const appropriation = appropriationId ? await tx.budgetAppropriation.findUnique({ where: { id: appropriationId }, select: { financialYearId: true, budgetUnitId: true, planningLine: { select: { functionCode: true } } } }) : null;
    functionByTransaction.set(transaction.id, appropriation?.financialYearId === input.financialYearId && scope.budgetUnitIds!.includes(appropriation.budgetUnitId) ? appropriation.planningLine?.functionCode ?? null : null);
  }
  const rows: Array<{ section: string; label: string; value: string; entryIds: string[] }> = [];
  async function total(section: string, selection: z.infer<typeof fiscalIndexTermSchema>[]) {
    const used = new Set<string>(); let sum = new Prisma.Decimal(0);
    for (const term of selection) {
      let value = new Prisma.Decimal(0); const entryIds: string[] = [];
      for (const entry of entries) {
        const transaction = entry.transaction!;
        const origin = originFor(transaction);
        if (transaction.reversalOfId && !originals.has(transaction.reversalOfId)) { issues.push(`Estorno ${transaction.id} sem partida original conciliada.`); continue; }
        if (!term.accountIds.includes(entry.accountId) || (term.budgetUnitIds && !term.budgetUnitIds.includes(transaction.budgetUnitId!)) || (term.sourceTypes && !term.sourceTypes.includes(origin.sourceType))) continue;
        if (term.functionCodes) {
          const code = functionByTransaction.get(transaction.id);
          if (!code) { issues.push(`Partida ${transaction.id} sem função canônica conciliada.`); continue; }
          if (!term.functionCodes.includes(code)) continue;
        }
        if (used.has(entry.id)) { issues.push(`Linha ${entry.id} selecionada em mais de um componente de ${section}.`); continue; }
        used.add(entry.id);
        if (!entry.valueDecimal || !["Débito", "Crédito"].includes(entry.type)) { issues.push(`Linha ${entry.id} sem valor Decimal/sinal conciliado.`); continue; }
        const sign = (entry.type === "Débito") === (term.side === "DEBIT_NET") ? 1 : -1;
        value = value.plus(entry.valueDecimal.mul(sign).mul(term.operation === "ADD" ? 1 : -1)); entryIds.push(entry.id);
      }
      rows.push({ section, label: term.label, value: value.toFixed(2), entryIds }); sum = sum.plus(value);
    }
    return sum;
  }
  const numerator = await total("NUMERATOR", config.numerator), denominator = await total("DENOMINATOR", config.denominator);
  if (denominator.lte(0)) issues.push("Base de cálculo inexistente ou não positiva.");
  if (numerator.lt(0)) issues.push("Aplicação líquida negativa exige conciliação fiscal.");
  const percentage = denominator.gt(0) ? numerator.mul(100).div(denominator) : null;
  return { ...base, status: issues.length ? "NOT_EVALUATED" as const : percentage!.lt(definition.minimumPercentage) ? "IRREGULAR" as const : "REGULAR" as const, issues: [...new Set(issues)], numerator: numerator.toFixed(2), denominator: denominator.toFixed(2), percentage: issues.length ? null : percentage!.toFixed(4), minimum: definition.minimumPercentage.toFixed(4), legalReference: definition.legalReference, revision: definition.revision, rows, sourceHash: hash({ definitionId: definition.id, rows, closes: closes.map(close => ({ id: close.id, month: close.competence.toISOString() })), entries: entries.map(entry => ({ id: entry.id, amount: entry.valueDecimal?.toFixed(2), type: entry.type, transactionId: entry.transactionId })) }) };
}
