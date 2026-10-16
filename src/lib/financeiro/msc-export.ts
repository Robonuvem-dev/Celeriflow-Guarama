import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import JSZip from "jszip";
import { z } from "zod";
import { mscReference2026Hash } from "./msc-configuration";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type Position = { account: string; pairs: Array<{ type: string; value: string }>; beginning: Prisma.Decimal; debit: Prisma.Decimal; credit: Prisma.Decimal };
const object = (value: Prisma.JsonValue | undefined): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const icType = z.enum(["PO", "FP", "DC", "FR", "CO", "NR", "ND", "FS", "AI"]);
const mscMemory = z.object({ status: z.literal("DOCUMENTED"), accountCode: z.string().regex(/^[1-8]\d{8}$/), referenceHash: z.literal(mscReference2026Hash), referenceVersionId: z.string().min(1), mappingEntryId: z.string().min(1), mappingVersionId: z.string().min(1), informationPairs: z.literal(6), omittedInformationTypes: z.array(z.enum(["CO", "DC"])).default([]), pairs: z.array(z.object({ type: icType, value: z.string().regex(/^\d+$/) })).min(1).max(6) });
const selection = { id: true, type: true, valueDecimal: true, classificationSnapshot: true, transaction: { select: { date: true, eventType: true, governmentEntityId: true, budgetUnitId: true } } } satisfies Prisma.AccountingEntrySelect;
type Entry = Prisma.AccountingEntryGetPayload<{ select: typeof selection }>;

/** Aggregates authorized, closed ledgers using only frozen per-line MSC memory. */
export async function generateMunicipalMscArchive(db: PrismaClient, actor: Actor, raw: unknown) {
  const input = z.object({ reportingScopeEntryId: z.string().min(1), period: z.string().regex(/^2026-(?:0[1-9]|1[0-3])$/) }).strict().parse(raw);
  const month = Number(input.period.slice(5));
  const through = month === 13 ? new Date(Date.UTC(2027, 0, 1)) : new Date(Date.UTC(2026, month, 1));
  const start = month === 13 ? through : new Date(Date.UTC(2026, month - 1, 1));
  if (month !== 13 && through > new Date()) throw new Error("MSC exige competência mensal integralmente transcorrida.");
  const result = await db.$transaction(async tx => {
    const scope = await tx.planningCatalogEntry.findUniqueOrThrow({ where: { id: input.reportingScopeEntryId }, include: { version: { select: { year: true, status: true } } } });
    const attrs = object(scope.attributes);
    const config = z.object({ entityIds: z.array(z.string()).min(1), budgetUnitIds: z.array(z.string()).min(1), aggregation: z.literal("WITHOUT_RECIPROCAL_ELIMINATION"), operational: z.literal(true) }).parse(attrs);
    if (scope.kind !== "MSC_REPORTING_SCOPE" || scope.version.year !== 2026 || scope.version.status !== "PUBLISHED" || !/^\d{7}EX$/.test(scope.code)) throw new Error("Perímetro de envio MSC não publicado ou incompatível com o exercício.");
    const successors = await tx.planningCatalogEntry.count({ where: { kind: "MSC_REPORTING_SCOPE", canonicalId: scope.canonicalId, version: { year: 2026, status: "PUBLISHED" }, attributes: { path: ["predecessorEntryId"], equals: scope.id } } });
    if (successors) throw new Error("Selecione a edição vigente do perímetro MSC.");
    const entities = await tx.governmentEntity.findMany({ where: { OR: [{ id: scope.canonicalId }, { parentId: scope.canonicalId, status: "ATIVA" }] }, select: { id: true, type: true } });
    if (entities.find(entity => entity.id === scope.canonicalId)?.type !== "PREFEITURA" || JSON.stringify(entities.map(entity => entity.id).sort()) !== JSON.stringify([...config.entityIds].sort())) throw new Error("O vínculo dos órgãos/poderes diverge do perímetro MSC publicado; concilie sua edição.");
    const units = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: { in: config.entityIds } }, select: { budgetUnitId: true } });
    const unitIds = units.map(unit => unit.budgetUnitId).sort();
    if (JSON.stringify(unitIds) !== JSON.stringify([...config.budgetUnitIds].sort()) || actor.allowedBudgetUnitIds && unitIds.some(id => !actor.allowedBudgetUnitIds!.includes(id))) throw new Error("A MSC agregada exige todas as UGs do perímetro, autorizadas e com vínculos compatíveis com a edição publicada.");
    const years = await tx.financialYear.findMany({ where: { year: 2026, governmentEntityId: { in: config.entityIds } }, select: { id: true, governmentEntityId: true } });
    if (years.length !== config.entityIds.length || config.entityIds.some(id => !years.some(year => year.governmentEntityId === id))) throw new Error("Exercício 2026 ausente em um dos poderes/órgãos do perímetro.");
    const yearIds = years.map(year => year.id);
    if (month === 13) {
      if (await tx.annualAccountingClose.count({ where: { financialYearId: { in: yearIds }, status: "ENCERRADO" } }) !== yearIds.length) throw new Error("MSC de encerramento exige encerramento anual confirmado em todos os integrantes.");
    } else if (await tx.monthlyAccountingClose.count({ where: { financialYearId: { in: yearIds }, competence: start, status: "FECHADO" } }) !== yearIds.length) throw new Error("MSC mensal exige a competência fechada em todos os integrantes do perímetro.");
    const positions = new Map<string, Position>();
    const evidence: Array<{ id: string; value: string; type: string; memoryHash: string }> = [];
    const verifiedMemories = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const entries: Entry[] = await tx.accountingEntry.findMany({ where: { transaction: { financialYearId: { in: yearIds }, governmentEntityId: { in: config.entityIds }, budgetUnitId: { in: unitIds }, status: "POSTADO", date: { gte: new Date("2026-01-01T00:00:00.000Z"), lt: through } } }, select: selection, orderBy: { id: "asc" }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!entries.length) break;
      for (const entry of entries) {
        const transaction = entry.transaction;
        const dimensions = object(object(entry.classificationSnapshot).dimensions);
        if (!transaction || dimensions.governmentEntityId !== transaction.governmentEntityId || dimensions.budgetUnitId !== transaction.budgetUnitId || !entry.valueDecimal || !entry.valueDecimal.isFinite() || entry.valueDecimal.lte(0) || !["Débito", "Crédito"].includes(entry.type)) throw new Error(`Linha ${entry.id} sem ente/UG/Decimal/natureza conciliados para MSC.`);
        const parsed = mscMemory.safeParse(dimensions.msc);
        if (!parsed.success) throw new Error(`Linha ${entry.id} sem composição MSC documentada e congelada. Regularize sua origem; o exportador não usa o de-para atual para reclassificar o histórico.`);
        const memory = parsed.data;
        if (new Set(memory.pairs.map(pair => pair.type)).size !== memory.pairs.length || !memory.pairs.some(pair => pair.type === "PO")) throw new Error(`Informações complementares duplicadas ou Poder/Órgão ausente na linha ${entry.id}.`);
        const widths: Record<string, number> = { PO: 5, FP: 1, DC: 1, FR: 4, CO: 4, NR: 8, ND: 8, FS: 5, AI: 4 };
        for (const pair of memory.pairs) if (pair.value.length !== widths[pair.type]) throw new Error(`Informação complementar ${pair.type} inválida na linha ${entry.id}.`);
        const memoryHash = createHash("sha256").update(JSON.stringify(dimensions.msc)).digest("hex");
        if (!verifiedMemories.has(memoryHash)) {
          const accountReference = await tx.planningCatalogEntry.findFirst({ where: { kind: "MSC_ACCOUNT", code: memory.accountCode, versionId: memory.referenceVersionId, version: { year: 2026, sourceHash: mscReference2026Hash } }, select: { attributes: true } });
          const allowed = accountReference ? z.array(icType).parse(object(accountReference.attributes).informationTypes) : [];
          if (!accountReference || memory.pairs.some(pair => !allowed.includes(pair.type)) || memory.omittedInformationTypes.some(type => !allowed.includes(type) || memory.pairs.some(pair => pair.type === type)) || allowed.some(type => !memory.pairs.some(pair => pair.type === type) && !memory.omittedInformationTypes.some(omitted => omitted === type))) throw new Error(`Conta/IC da linha ${entry.id} divergem do leiaute oficial ou estão incompletos.`);
          for (const pair of memory.pairs) {
            if (pair.type === "AI") { if (Number(pair.value) > 2026) throw new Error("Ano de inscrição de restos a pagar posterior ao período MSC."); continue; }
            const references = pair.type === "FS" ? await tx.planningCatalogEntry.count({ where: { versionId: memory.referenceVersionId, OR: [{ kind: "MSC_FUNCTION", code: pair.value.slice(0, 2) }, { kind: "MSC_SUBFUNCTION", code: pair.value.slice(2) }] } }) : await tx.planningCatalogEntry.count({ where: { versionId: memory.referenceVersionId, kind: `MSC_${pair.type}`, code: pair.value } });
            if (references !== (pair.type === "FS" ? 2 : 1)) throw new Error(`Código de IC ${pair.type} não consta no leiaute oficial.`);
          }
          verifiedMemories.add(memoryHash);
        }
        const pairs = [...memory.pairs];
        const key = JSON.stringify([memory.accountCode, pairs]);
        let position = positions.get(key);
        if (!position) { position = { account: memory.accountCode, pairs, beginning: new Prisma.Decimal(0), debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) }; positions.set(key, position); }
        const closing = transaction.eventType === "ACCOUNTING_YEAR_CLOSING";
        const opening = transaction.eventType === "ACCOUNTING_YEAR_OPENING";
        if (month !== 13 && closing) continue;
        const inBeginning = month === 13 ? !closing : opening || transaction.date < start;
        if (inBeginning) position.beginning = entry.type === "Débito" ? position.beginning.plus(entry.valueDecimal) : position.beginning.minus(entry.valueDecimal);
        else if (entry.type === "Débito") position.debit = position.debit.plus(entry.valueDecimal);
        else position.credit = position.credit.plus(entry.valueDecimal);
        evidence.push({ id: entry.id, value: entry.valueDecimal.toFixed(2), type: entry.type, memoryHash });
      }
      cursor = entries[entries.length - 1].id;
    }
    const balances = [...positions.values()].sort((left, right) => left.account.localeCompare(right.account) || JSON.stringify(left.pairs).localeCompare(JSON.stringify(right.pairs)));
    const totals = new Map<string, { beginning: Prisma.Decimal; movement: Prisma.Decimal; ending: Prisma.Decimal }>();
    const lines: string[][] = [];
    for (const position of balances) {
      const ending = position.beginning.plus(position.debit).minus(position.credit);
      if (month === 13 && /^[34]/.test(position.account) && !ending.isZero()) throw new Error(`Conta de resultado ${position.account} não encerrada; a MSC 13 exige apuração/distribuição do resultado.`);
      const family = Number(position.account[0]) <= 4 ? "PATRIMONIAL" : Number(position.account[0]) <= 6 ? "ORCAMENTARIA" : "CONTROLE";
      const total = totals.get(family) ?? { beginning: new Prisma.Decimal(0), movement: new Prisma.Decimal(0), ending: new Prisma.Decimal(0) };
      total.beginning = total.beginning.plus(position.beginning); total.movement = total.movement.plus(position.debit).minus(position.credit); total.ending = total.ending.plus(ending); totals.set(family, total);
      const prefix = [position.account, ...position.pairs.flatMap(pair => [pair.value, pair.type]), ...Array(12 - position.pairs.length * 2).fill("")];
      for (const [type, value, nature] of [["beginning_balance", position.beginning.abs(), position.beginning.lt(0) ? "C" : "D"], ["period_change", position.debit, "D"], ["period_change", position.credit, "C"], ["ending_balance", ending.abs(), ending.lt(0) ? "C" : "D"]] as const) if (!value.isZero()) lines.push([...prefix, value.toFixed(2), type, nature]);
    }
    for (const [family, total] of totals) if (!total.beginning.isZero() || !total.movement.isZero() || !total.ending.isZero()) throw new Error(`MSC não balanceada na natureza de informação ${family}; concilie as contrapartes antes de exportar.`);
    if (!lines.length) throw new Error("MSC não pode ser composta somente pelo cabeçalho; sem saldos/movimentos conciliados no período.");
    const headers = ["CONTA", ...Array.from({ length: 6 }, (_, index) => [`IC${index + 1}`, `TIPO${index + 1}`]).flat(), "Valor", "Tipo_valor", "Natureza_valor"];
    const csv = [[scope.code, input.period, ...Array(14).fill("")], headers, ...lines].map(line => line.join(";")).join("\r\n") + "\r\n";
    const csvHash = createHash("sha256").update(csv).digest("hex");
    const evidenceHash = createHash("sha256").update(JSON.stringify({ scopeEntryId: scope.id, period: input.period, referenceHash: mscReference2026Hash, evidence })).digest("hex");
    await tx.financialAuditLog.create({ data: { action: "MSC_FILE_GENERATED", entityType: "PlanningCatalogEntry", entityId: scope.id, authorUsuarioId: actor.usuarioId, payload: { period: input.period, institutionCode: scope.code, csvHash, evidenceHash, sourceEntryCount: evidence.length, outputRows: lines.length, governmentEntityIds: config.entityIds, budgetUnitIds: unitIds, referenceHash: mscReference2026Hash, transmissionStatus: "NOT_TRANSMITTED" } } });
    return { csv, csvHash, evidenceHash, outputRows: lines.length, sourceEntryCount: evidence.length, institutionCode: scope.code };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
  const filename = `MSC_${result.institutionCode}_${input.period}`;
  const zip = new JSZip();
  zip.file(`${filename}.csv`, result.csv, { date: new Date("2026-01-01T00:00:00.000Z") });
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { ...result, filename: `${filename}.zip`, bytes, archiveHash: createHash("sha256").update(bytes).digest("hex") };
}
