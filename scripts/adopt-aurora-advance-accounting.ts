import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-advance-controls-2026-v1";
const control = "7.9.1.2.1.00.00.00.00.00.00.00";
const pending = "8.9.1.2.1.01.00.00.00.00.00.00";
const reported = "8.9.1.2.1.02.00.00.00.00.00.00";
const approved = "8.9.1.2.1.03.00.00.00.00.00.00";
const disallowed = "8.9.1.2.1.04.00.00.00.00.00.00";
const codes = [control, pending, reported, approved, disallowed];
const events = [{ code: "ADVANCE_GRANTED", debit: control, credit: pending }, { code: "ADVANCE_REPORTED", debit: pending, credit: reported }, { code: "ADVANCE_APPROVED", debit: reported, credit: approved }, { code: "ADVANCE_DISALLOWED", debit: reported, credit: disallowed }];
const decision = "Aurora das Veredas — controle de adiantamentos pelo empenho/concessão, apresentação e revisão da prestação; procedimento inicial estimado autorizado, contas oficiais TCE-PR 2026, sem lei municipal presumida.";
const hash = createHash("sha256").update(JSON.stringify({ sourceHash, codes, events, decision })).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${versionId}))`;
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial divergente.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceVersionId, kind: "ACCOUNT", code: { in: codes } } });
      if (entries.length !== codes.length) throw new Error("Subconjunto de controle oficial incompleto.");
      const ids = new Map<string, string>();
      for (const entry of entries) {
        const attributes = entry.attributes as Prisma.JsonObject;
        if (attributes.postingAllowed !== true || attributes.informationNature !== "C" || attributes.balanceNature !== (entry.code.startsWith("7.") ? "D" : "C") || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Conta de controle não conciliada ${entry.code}.`);
        const account = await tx.accountingPlan.findUnique({ where: { code: entry.code } });
        if (account && (account.name !== entry.name || account.type !== "Controle")) throw new Error(`Cadastro existente divergente ${entry.code}; preservar e conciliar.`);
        ids.set(entry.code, account?.id ?? `aurora-account:${entry.code}`);
      }
      const existing = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      if (existing && (existing.sourceHash !== hash || existing.status !== "PUBLISHED" || existing.entries.length !== codes.length || existing.entries.some(entry => entry.canonicalId !== ids.get(entry.code)))) throw new Error("Edição de controle publicada divergente.");
      for (const event of events) {
        const current = await tx.accountingEventCatalog.findUnique({ where: { code: event.code }, include: { rules: true } });
        if (current && (!current.isActive || current.rules.length !== 1 || current.rules[0].debitAccountId !== ids.get(event.debit) || current.rules[0].creditAccountId !== ids.get(event.credit) || !current.rules[0].isActive || current.rules[0].isReference)) throw new Error(`Matriz de controle existente divergente ${event.code}.`);
        if (existing && !current) throw new Error(`Evento ausente na edição publicada ${event.code}.`);
      }
      if (apply && !existing) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        for (const entry of entries) await tx.accountingPlan.upsert({ where: { code: entry.code }, create: { id: ids.get(entry.code)!, code: entry.code, name: entry.name, type: "Controle" }, update: {} });
        await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — controles de adiantamentos 2026 v1", sourceHash: hash, status: "DRAFT", normativeReference: decision, createdById: actor.id, entries: { create: entries.map(entry => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: ids.get(entry.code), attributes: { ...(entry.attributes as Prisma.JsonObject), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId, estimatedMunicipalPolicy: true, decision } })) } } });
        await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        for (const event of events) await tx.accountingEventCatalog.upsert({ where: { code: event.code }, create: { code: event.code, name: event.code, description: decision, rules: { create: { debitAccountId: ids.get(event.debit)!, creditAccountId: ids.get(event.credit)!, description: versionId, isReference: false } } }, update: {} });
        await tx.financialAuditLog.create({ data: { action: "ADOPT_MUNICIPAL_ADVANCE_CONTROLS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, codes, events, decision } } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, codes, events };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
