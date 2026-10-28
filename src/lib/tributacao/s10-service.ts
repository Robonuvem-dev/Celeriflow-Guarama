import { createHash } from "node:crypto";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { vafAccountants, vafCompanies, vafExercises, vafRules, vafEfdImports, vafGiaImports, vafProtocols, vafRepasses, vafActivities, vafResults, vafMunicipalIndices, vafCompanyIndices, vafMonthlySummaries, vafCfopEntries, vafCrossChecks, vafNotifications, vafEstimates } from "@/db/schema/tax-collection-operations";
import { collectionJson as json, collectionRow, lockCollectionOperation } from "@/db/repositories/tax-collection-operations/shared";
import { abcCurve, calculateVaf, checkContrapartida, crossCheck, detectOmission, estimateAnnual, evaluateFormula, financialReturn, mergeEfdGia, monthlyTrend, participation, protocolNumber, VafError } from "./s10-engine";

type Actor = { usuarioId: string };
const money = (v: number | string | Decimal) => new Decimal(String(v)).toDecimalPlaces(2);
const num = (v: unknown) => Number(new Decimal(String(v ?? 0)).toFixed(2));
const optionalDecimal = (v: number | undefined) => v === undefined ? undefined : new Decimal(v);
export type Movement = { cfop: string; cfopDescription?: string; operationType: "ENTRADA" | "SAIDA"; value: number };

export async function upsertAccountant(db: DatabaseConnection, input: { cpfCnpj: string; name: string; email?: string; phone?: string }) {
  if (!input.cpfCnpj || !input.name) throw new VafError("Identificador e nome do contador são obrigatórios.");
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.insert(vafAccountants).values(input).onConflictDoUpdate({ target: vafAccountants.cpfCnpj, set: { name: input.name, email: input.email, phone: input.phone } }).returning()));
}

export async function upsertCompany(db: DatabaseConnection, input: { cnpj: string; corporateName: string; tradeName?: string; stateInsc?: string; address?: string; phone?: string; email?: string; cnae?: string; taxRegime?: string; accountantId?: string }) {
  if (!input.cnpj || !input.corporateName) throw new VafError("CNPJ e razão social são obrigatórios.");
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.insert(vafCompanies).values(input).onConflictDoUpdate({ target: vafCompanies.cnpj, set: { ...input } }).returning()));
}

export async function linkCompanyAccountant(db: DatabaseConnection, companyId: string, accountantId: string | null) {
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.update(vafCompanies).set({ accountantId }).where(eq(vafCompanies.id, companyId)).returning()));
}

export async function upsertRule(db: DatabaseConnection, input: { exerciseId: string; cfop: string; cfopDescription?: string; composesVaf?: boolean; formula: string; formulaVersion?: string; contrapartidaCfop?: string; contrapartidaRule?: string; effectiveFrom: Date; effectiveUntil?: Date; situation?: string }) {
  evaluateFormula(input.formula, { saida: 1, entrada: 0 });
  return withDatabaseTransaction(db, async tx => {
    await lockCollectionOperation(tx, `VAF-RULE:${input.exerciseId}:${input.cfop}`);
    const current = (await tx.select().from(vafRules).where(and(eq(vafRules.exerciseId, input.exerciseId), eq(vafRules.cfop, input.cfop), eq(vafRules.situation, "VIGENTE"))).limit(1))[0];
    if (current && (current.formula !== input.formula || current.contrapartidaCfop !== (input.contrapartidaCfop ?? null))) await tx.update(vafRules).set({ situation: "SUBSTITUIDA", effectiveUntil: input.effectiveFrom }).where(eq(vafRules.id, current.id));
    return collectionRow(await tx.insert(vafRules).values({ ...input, composesVaf: input.composesVaf ?? true, formulaVersion: input.formulaVersion ?? String(Number(current?.formulaVersion ?? 0) + 1), situation: input.situation ?? "VIGENTE" }).returning());
  });
}

async function nextProtocol(tx: DatabaseTransaction, exerciseId: string, prefix: string, year: number) {
  await lockCollectionOperation(tx, `VAF-PROTOCOL:${exerciseId}:${prefix}`);
  const counts = await tx.select({ count: sql<number>`count(*)::int` }).from(vafProtocols).where(and(eq(vafProtocols.exerciseId, exerciseId), eq(vafProtocols.documentType, prefix)));
  return protocolNumber(prefix, year, collectionRow(counts).count + 1);
}

export async function importMovements(db: DatabaseConnection, actor: Actor, kind: "EFD" | "GIA", input: { companyId: string; exerciseId: string; competency: string; fileName: string; movements: Movement[]; version?: string; substituteId?: string }) {
  if (!/^\d{6}$/.test(input.competency)) throw new VafError("Competência deve ser AAAAMM.");
  if (!input.movements.length) throw new VafError("Informe ao menos um movimento por CFOP.");
  for (const m of input.movements) { if (!/^\d{4}$/.test(m.cfop)) throw new VafError(`CFOP inválido: ${m.cfop}.`); money(m.value); }
  const hash = createHash("sha256").update(JSON.stringify(input.movements)).digest("hex");
  const parsed = { movements: input.movements };
  return withDatabaseTransaction(db, async tx => {
    const exercise = collectionRow(await tx.select().from(vafExercises).where(eq(vafExercises.id, input.exerciseId)).limit(1));
    const proto = await nextProtocol(tx, input.exerciseId, kind, exercise.year);
    const values = { companyId: input.companyId, exerciseId: input.exerciseId, competency: input.competency, version: input.version ?? "1", fileName: input.fileName, fileHash: hash, rawData: json(parsed), parsedData: json(parsed), status: "IMPORTADO", importedBy: actor.usuarioId, parentImportId: input.substituteId };
    const created = kind === "EFD"
      ? collectionRow(await tx.insert(vafEfdImports).values(values).returning())
      : collectionRow(await tx.insert(vafGiaImports).values(values).returning());
    if (input.substituteId) {
      if (kind === "EFD") collectionRow(await tx.update(vafEfdImports).set({ status: "SUBSTITUIDO" }).where(eq(vafEfdImports.id, input.substituteId)).returning());
      else collectionRow(await tx.update(vafGiaImports).set({ status: "SUBSTITUIDO" }).where(eq(vafGiaImports.id, input.substituteId)).returning());
    }
    await tx.insert(vafProtocols).values({ protocolNumber: proto, companyId: input.companyId, documentType: kind, competency: input.competency, exerciseId: input.exerciseId, status: "RECEBIDO", metadata: json({ importId: created.id, fileName: input.fileName }) });
    return created;
  });
}

export async function importRepasse(db: DatabaseConnection, actor: Actor, input: { exerciseId: string; competency: string; weekNumber?: number; municipalValue: number; stateTotalValue: number; sourceFile?: string; version?: string; correctId?: string }) {
  if (!/^\d{6}$/.test(input.competency)) throw new VafError("Competência deve ser AAAAMM.");
  return withDatabaseTransaction(db, async tx => {
    const created = collectionRow(await tx.insert(vafRepasses).values({ exerciseId: input.exerciseId, competency: input.competency, weekNumber: input.weekNumber, municipalValue: money(input.municipalValue), stateTotalValue: money(input.stateTotalValue), sourceFile: input.sourceFile ?? `repasse-${input.competency}.csv`, version: input.version ?? "1", parentRepasseId: input.correctId }).returning());
    const company = collectionRow(await tx.select({ id: vafCompanies.id }).from(vafCompanies).limit(1));
    await tx.insert(vafActivities).values({ exerciseId: input.exerciseId, companyId: company.id, competency: input.competency, activityType: "REPASSE", title: `Repasse importado ${input.competency}`, description: `Municipal ${input.municipalValue} / Estado ${input.stateTotalValue} por ${actor.usuarioId}.`, status: "CONCLUIDA" });
    return created;
  });
}

export async function importIndices(db: DatabaseConnection, input: { exerciseId: string; competency: string; municipalProvisorio?: number; municipalDefinitivo?: number; companies?: { companyId: string; provisorio?: number; definitivo?: number }[] }) {
  return withDatabaseTransaction(db, async tx => {
    const totals = await tx.select({ value: sql<string | null>`sum(${vafResults.vafValue})::text` }).from(vafResults).where(and(eq(vafResults.exerciseId, input.exerciseId), eq(vafResults.competency, input.competency)));
    const sum = collectionRow(totals).value;
    const values = { indexProvisorio: optionalDecimal(input.municipalProvisorio), indexDefinitivo: optionalDecimal(input.municipalDefinitivo), totalVafProvisorio: sum === null ? undefined : new Decimal(sum) };
    await tx.insert(vafMunicipalIndices).values({ exerciseId: input.exerciseId, competency: input.competency, ...values }).onConflictDoUpdate({ target: [vafMunicipalIndices.exerciseId, vafMunicipalIndices.competency], set: values });
    for (const c of input.companies ?? []) {
      const indices = { indexProvisorio: optionalDecimal(c.provisorio), indexDefinitivo: optionalDecimal(c.definitivo) };
      await tx.insert(vafCompanyIndices).values({ exerciseId: input.exerciseId, companyId: c.companyId, competency: input.competency, ...indices }).onConflictDoUpdate({ target: [vafCompanyIndices.exerciseId, vafCompanyIndices.companyId, vafCompanyIndices.competency], set: indices });
    }
    return { ok: true };
  });
}

function movementsOf(imp: { parsedData: unknown; rawData: unknown } | null): Movement[] {
  const data = (imp?.parsedData ?? imp?.rawData) as { movements?: Movement[] } | null;
  return Array.isArray(data?.movements) ? data.movements! : [];
}

export async function processCompetency(db: DatabaseConnection, actor: Actor, input: { exerciseId: string; competency: string; sourceType?: string }) {
  return withDatabaseTransaction(db, async tx => {
    const sourceType = input.sourceType ?? "PROVISORIO";
    await lockCollectionOperation(tx, `VAF-COMPETENCY:${input.exerciseId}:${input.competency}`);
    const companies = await tx.select().from(vafCompanies).where(eq(vafCompanies.active, true));
    const rules = await tx.select().from(vafRules).where(and(eq(vafRules.exerciseId, input.exerciseId), eq(vafRules.situation, "VIGENTE")));
    const ruleByCfop = new Map(rules.map(r => [r.cfop, r]));
    const received: string[] = [];
    let total = new Decimal(0);
    for (const company of companies) {
      const efd = (await tx.select().from(vafEfdImports).where(and(eq(vafEfdImports.companyId, company.id), eq(vafEfdImports.exerciseId, input.exerciseId), eq(vafEfdImports.competency, input.competency), ne(vafEfdImports.status, "SUBSTITUIDO"))).orderBy(desc(vafEfdImports.importedAt)).limit(1))[0] ?? null;
      const gia = (await tx.select().from(vafGiaImports).where(and(eq(vafGiaImports.companyId, company.id), eq(vafGiaImports.exerciseId, input.exerciseId), eq(vafGiaImports.competency, input.competency), ne(vafGiaImports.status, "SUBSTITUIDO"))).orderBy(desc(vafGiaImports.importedAt)).limit(1))[0] ?? null;
      if (efd || gia) received.push(company.id);
      const efdByCfop = new Map<string, { saida: number; entrada: number }>(), giaByCfop = new Map<string, { saida: number; entrada: number }>();
      for (const m of movementsOf(efd)) { const cur = efdByCfop.get(m.cfop) ?? { saida: 0, entrada: 0 }; if (m.operationType === "SAIDA") cur.saida += m.value; else cur.entrada += m.value; efdByCfop.set(m.cfop, cur); }
      for (const m of movementsOf(gia)) { const cur = giaByCfop.get(m.cfop) ?? { saida: 0, entrada: 0 }; if (m.operationType === "SAIDA") cur.saida += m.value; else cur.entrada += m.value; giaByCfop.set(m.cfop, cur); }
      const cfops = new Set([...efdByCfop.keys(), ...giaByCfop.keys()]);
      let saidaElegivel = new Decimal(0), entradaElegivel = new Decimal(0);
      for (const cfop of cfops) {
        const e = efdByCfop.get(cfop) ?? { saida: 0, entrada: 0 }, g = giaByCfop.get(cfop) ?? { saida: 0, entrada: 0 };
        const merged = mergeEfdGia({ saida: e.saida, entrada: e.entrada }, { saida: g.saida, entrada: g.entrada }, "MERGED");
        const rule = ruleByCfop.get(cfop), composes = rule?.composesVaf ?? true, formula = rule?.formula ?? "saida - entrada";
        const vafCfop = composes ? evaluateFormula(formula, { saida: String(merged.saida), entrada: String(merged.entrada) }) : new Decimal(0);
        if (composes) { saidaElegivel = saidaElegivel.plus(merged.saida); entradaElegivel = entradaElegivel.plus(merged.entrada); }
        const summary = { efdSaida: new Decimal(e.saida), efdEntrada: new Decimal(e.entrada), giaSaida: new Decimal(g.saida), giaEntrada: new Decimal(g.entrada), composesVaf: composes, vafCalculated: vafCfop, formulaApplied: formula, sourcePriority: "MERGED", divergences: json({ efd: e, gia: g }) };
        await tx.insert(vafMonthlySummaries).values({ exerciseId: input.exerciseId, companyId: company.id, competency: input.competency, cfop, cfopDescription: rule?.cfopDescription, ...summary }).onConflictDoUpdate({ target: [vafMonthlySummaries.exerciseId, vafMonthlySummaries.companyId, vafMonthlySummaries.competency, vafMonthlySummaries.cfop], set: summary });
        const entry = { efdValue: new Decimal(e.saida), giaValue: new Decimal(g.saida), composesVaf: composes, formulaDetail: formula };
        await tx.insert(vafCfopEntries).values({ id: `${input.exerciseId}-${company.id}-${input.competency}-${cfop}-SAIDA`, exerciseId: input.exerciseId, companyId: company.id, competency: input.competency, cfop, cfopDescription: rule?.cfopDescription, operationType: "SAIDA", ...entry }).onConflictDoUpdate({ target: vafCfopEntries.id, set: entry });
        const check = crossCheck(e.saida + e.entrada, g.saida + g.entrada, "DIFERENCA_MAX", 0.01);
        const checkKey = { exerciseId: input.exerciseId, companyId: company.id, competency: input.competency, cfop, status: "ABERTA" };
        if ((efd || gia) && !check.ok) await tx.insert(vafCrossChecks).values({ ...checkKey, checkType: "EFD_X_GIA", description: `Divergência EFD x GIA no CFOP ${cfop}: diferença ${check.difference}.`, severity: "ALERTA", efdValue: check.efd, giaValue: check.gia, difference: check.difference });
        const contra = checkContrapartida(cfop, rule?.contrapartidaCfop ?? undefined, [...cfops].map(c => ({ cfop: c, value: new Decimal(0) })));
        if (!contra.ok) await tx.insert(vafCrossChecks).values({ ...checkKey, checkType: "CONTRAPARTIDA", description: `CFOP ${cfop} exige contrapartida ${contra.missing.join(", ")} não localizada.`, severity: "ERRO" });
        if (cfop === "5929" && e.saida + g.saida + e.entrada + g.entrada > 0) await tx.insert(vafCrossChecks).values({ ...checkKey, checkType: "GENERICO", description: `CFOP genérico ${cfop} exige conferência da base de cálculo.`, severity: "ALERTA", efdValue: new Decimal(e.saida + e.entrada), giaValue: new Decimal(g.saida + g.entrada) });
      }
      const calc = calculateVaf({ saidaElegivel: saidaElegivel.toString(), entradaElegivel: entradaElegivel.toString() });
      total = total.plus(calc.vaf);
      const result = { saidaElegivel: calc.saida, entradaElegivel: calc.entrada, vafValue: calc.vaf, isSimples: (company.taxRegime ?? "").includes("SIMPLES") };
      await tx.insert(vafResults).values({ exerciseId: input.exerciseId, companyId: company.id, competency: input.competency, sourceType, ...result }).onConflictDoUpdate({ target: [vafResults.exerciseId, vafResults.companyId, vafResults.competency, vafResults.sourceType], set: result });
      if (efd) await tx.update(vafEfdImports).set({ status: "PROCESSADO", processedAt: new Date() }).where(eq(vafEfdImports.id, efd.id));
      if (gia) await tx.update(vafGiaImports).set({ status: "PROCESSADO", processedAt: new Date() }).where(eq(vafGiaImports.id, gia.id));
    }
    const results = await tx.select().from(vafResults).where(and(eq(vafResults.exerciseId, input.exerciseId), eq(vafResults.competency, input.competency), eq(vafResults.sourceType, sourceType))).orderBy(desc(vafResults.vafValue));
    let rank = 1;
    for (const r of results) await tx.update(vafResults).set({ participation: participation(total.toString(), r.vafValue.toString()).participation, rank: rank++ }).where(eq(vafResults.id, r.id));
    const omitted = detectOmission(companies.map(c => c.id), received);
    for (const companyId of omitted) await tx.insert(vafNotifications).values({ companyId, type: "OMISSAO", title: `Declaração ausente em ${input.competency}`, content: `Nenhum arquivo EFD/GIA localizado para a competência ${input.competency}. Regularize ou justifique.`, competency: input.competency, exerciseId: input.exerciseId, status: "ENVIADA" });
    const firstCompany = companies[0]?.id ?? collectionRow(await tx.select({ id: vafCompanies.id }).from(vafCompanies).limit(1)).id;
    await tx.insert(vafActivities).values({ exerciseId: input.exerciseId, companyId: firstCompany, competency: input.competency, activityType: "CRUZAMENTO", title: `Apuração ${input.competency} (${sourceType})`, description: `Total VAF ${total.toFixed(2)} em ${results.length} empresas; ${omitted.length} omissas.`, status: "ANALISADA", analyzedAt: new Date() });
    return { total: total.toFixed(2), companies: results.length, omitted: omitted.length };
  });
}

export async function notifyCorrection(db: DatabaseConnection, input: { companyId: string; exerciseId: string; competency: string; title: string; content: string; accountantId?: string }) {
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.insert(vafNotifications).values({ ...input, type: "CORRECAO", status: "ENVIADA" }).returning()));
}
export async function markNotificationRead(db: DatabaseConnection, id: string) {
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.update(vafNotifications).set({ status: "LIDA", readAt: new Date() }).where(eq(vafNotifications.id, id)).returning()));
}
export async function resolveCrossCheck(db: DatabaseConnection, actor: Actor, id: string, status: "CORRIGIDA" | "IGNORADA") {
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.update(vafCrossChecks).set({ status, resolvedAt: new Date(), resolvedBy: actor.usuarioId }).where(eq(vafCrossChecks.id, id)).returning()));
}
export async function createEstimate(db: DatabaseConnection, actor: Actor, input: { exerciseId: string; competency: string; companyId?: string; method: "LINEAR" | "MEDIA_MOVEL"; realizedMonths: number; realizedValue: number; history?: number[]; hypothesis?: string }) {
  const est = estimateAnnual(input.realizedMonths, input.realizedValue, input.method, input.history ?? []);
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.insert(vafEstimates).values({ exerciseId: input.exerciseId, companyId: input.companyId, competency: input.competency, method: est.method, realizedMonths: input.realizedMonths, realizedValue: money(input.realizedValue), estimatedValue: est.annual, hypothesis: input.hypothesis, createdBy: actor.usuarioId }).returning()));
}

export async function vafReports(db: DatabaseExecutor, exerciseId: string, competency?: string) {
  const [resultRows, summaries, repasses, indices, estimates, crossChecks] = await Promise.all([
    db.select({ result: vafResults, company: vafCompanies }).from(vafResults).innerJoin(vafCompanies, eq(vafCompanies.id, vafResults.companyId)).where(and(eq(vafResults.exerciseId, exerciseId), competency ? eq(vafResults.competency, competency) : undefined)).orderBy(asc(vafResults.competency), asc(vafResults.rank)),
    db.select().from(vafMonthlySummaries).where(and(eq(vafMonthlySummaries.exerciseId, exerciseId), competency ? eq(vafMonthlySummaries.competency, competency) : undefined)),
    db.select().from(vafRepasses).where(and(eq(vafRepasses.exerciseId, exerciseId), competency ? eq(vafRepasses.competency, competency) : undefined)).orderBy(asc(vafRepasses.competency)),
    db.select().from(vafMunicipalIndices).where(eq(vafMunicipalIndices.exerciseId, exerciseId)).orderBy(asc(vafMunicipalIndices.competency)),
    db.select().from(vafEstimates).where(and(eq(vafEstimates.exerciseId, exerciseId), competency ? eq(vafEstimates.competency, competency) : undefined)).orderBy(desc(vafEstimates.createdAt)).limit(50),
    db.select().from(vafCrossChecks).where(and(eq(vafCrossChecks.exerciseId, exerciseId), competency ? eq(vafCrossChecks.competency, competency) : undefined, eq(vafCrossChecks.status, "ABERTA"))).limit(200),
  ]);
  const results = resultRows.map(row => ({ ...row.result, company: row.company }));
  const byCompany = new Map<string, { company: string; vaf: number }>();
  for (const r of results) { const cur = byCompany.get(r.companyId) ?? { company: r.company.corporateName, vaf: 0 }; cur.vaf = Number((cur.vaf + num(r.vafValue)).toFixed(2)); byCompany.set(r.companyId, cur); }
  const ranking = [...byCompany.entries()].map(([companyId, v]) => ({ companyId, ...v })).sort((a, b) => b.vaf - a.vaf);
  const total = ranking.reduce((s, r) => s + r.vaf, 0);
  const ranked = ranking.map((r, i) => ({ ...r, participation: total > 0 ? Number(((r.vaf / total) * 100).toFixed(2)) : 0, rank: i + 1 }));
  const monthly = new Map<string, number>();
  for (const r of results) monthly.set(r.competency, Number(((monthly.get(r.competency) ?? 0) + num(r.vafValue)).toFixed(2)));
  const evolution = monthlyTrend([...monthly.entries()].map(([competency, value]) => ({ competency, value })));
  const abc = abcCurve(ranked.map(r => ({ label: r.company, value: r.vaf })));
  const repasseTotal = repasses.reduce((s, r) => s + num(r.municipalValue), 0);
  const attributed = financialReturn(repasseTotal || 0, total || 1, ranked.map(r => ({ companyId: r.companyId, vaf: r.vaf })));
  const simples = results.filter(r => r.isSimples).map(r => ({ company: r.company.corporateName, competency: r.competency, vaf: num(r.vafValue) }));
  const byCfop = new Map<string, { saida: number; entrada: number; vaf: number }>();
  for (const s of summaries) { const cur = byCfop.get(s.cfop) ?? { saida: 0, entrada: 0, vaf: 0 }; cur.saida += num(s.efdSaida) || num(s.giaSaida); cur.entrada += num(s.efdEntrada) || num(s.giaEntrada); cur.vaf += num(s.vafCalculated); byCfop.set(s.cfop, cur); }
  return { ranking: ranked, total: Number(total.toFixed(2)), evolution, abc, repasses: repasses.map(r => ({ competency: r.competency, week: r.weekNumber, municipal: num(r.municipalValue), state: num(r.stateTotalValue) })), repasseTotal: Number(repasseTotal.toFixed(2)), attributed, indices, estimates: estimates.map(e => ({ id: e.id, competency: e.competency, method: e.method, realized: num(e.realizedValue), estimated: num(e.estimatedValue) })), simples, byCfop: [...byCfop.entries()].map(([cfop, v]) => ({ cfop, ...v })), openIssues: crossChecks.length, resultsCount: results.length };
}

export async function listVafOverview(db: DatabaseExecutor, year?: number) {
  const exercises = await db.select().from(vafExercises).orderBy(asc(vafExercises.year));
  const exercise = (year ? exercises.find(e => e.year === year) : exercises.find(e => e.year === 2026)) ?? exercises[0];
  if (!exercise) return { exercises, exercise: null as never, companies: [], rules: [], imports: [], results: [], repasses: [], notifications: [], crossChecks: [], reports: null as never };
  const [companyRows, rules, efd, gia, resultRows, repasses, notifications, crossChecks, protocols, activities] = await Promise.all([
    db.select({ company: vafCompanies, accountant: vafAccountants }).from(vafCompanies).leftJoin(vafAccountants, eq(vafAccountants.id, vafCompanies.accountantId)).orderBy(asc(vafCompanies.corporateName)).limit(200),
    db.select().from(vafRules).where(eq(vafRules.exerciseId, exercise.id)).orderBy(asc(vafRules.cfop), desc(vafRules.createdAt)).limit(200),
    db.select().from(vafEfdImports).where(eq(vafEfdImports.exerciseId, exercise.id)).orderBy(desc(vafEfdImports.importedAt)).limit(100),
    db.select().from(vafGiaImports).where(eq(vafGiaImports.exerciseId, exercise.id)).orderBy(desc(vafGiaImports.importedAt)).limit(100),
    db.select({ result: vafResults, company: vafCompanies }).from(vafResults).innerJoin(vafCompanies, eq(vafCompanies.id, vafResults.companyId)).where(eq(vafResults.exerciseId, exercise.id)).orderBy(asc(vafResults.competency), asc(vafResults.rank)).limit(200),
    db.select().from(vafRepasses).where(eq(vafRepasses.exerciseId, exercise.id)).orderBy(asc(vafRepasses.competency)).limit(100),
    db.select().from(vafNotifications).where(eq(vafNotifications.exerciseId, exercise.id)).orderBy(desc(vafNotifications.sentAt)).limit(100),
    db.select().from(vafCrossChecks).where(eq(vafCrossChecks.exerciseId, exercise.id)).orderBy(desc(vafCrossChecks.createdAt)).limit(200),
    db.select().from(vafProtocols).where(eq(vafProtocols.exerciseId, exercise.id)).orderBy(desc(vafProtocols.receivedAt)).limit(100),
    db.select().from(vafActivities).where(eq(vafActivities.exerciseId, exercise.id)).orderBy(desc(vafActivities.openedAt)).limit(100),
  ]);
  const reports = await vafReports(db, exercise.id);
  return { exercises, exercise, companies: companyRows.map(row => ({ ...row.company, accountant: row.accountant })), rules, imports: [...efd.map(i => ({ ...i, kind: "EFD" as const })), ...gia.map(i => ({ ...i, kind: "GIA" as const }))], results: resultRows.map(row => ({ ...row.result, company: row.company })), repasses, notifications, crossChecks, protocols, activities, reports };
}
