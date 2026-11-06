/** Six reviewed label formats from three known seed packages. Keys and all details remain identical. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { hrReferenceRecords } from "../src/db/schema/personnel-reference-records";
import { financialAuditLogs } from "../src/db/schema/finance-identity";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_RH_ROTULOS_2026_V1";
const apply = process.argv.includes("--apply");
const preview = new Error("ROLLBACK_PREVIEW");
const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
type Reference = typeof hrReferenceRecords.$inferSelect;
function reviewedName(row: Reference): string | null {
  const source = row.code.split(":")[0];
  if (source === "RH_ESCALAS_ESTIMADAS_2026_V1") {
    if (row.kind === "ESCALA" && row.name.startsWith("Escala DEMO — ")) return `Escala de trabalho — ${row.name.slice("Escala DEMO — ".length)}`;
    if (row.kind === "FAIXA" && row.name.startsWith("DEMO ")) return row.name.slice("DEMO ".length);
  }
  if (source === "RH_CENARIOS_AJUSTES_2026_V1" || source === "RH_HISTORICO_2025_2026_V1") {
    if (["RATEIO_FOLHA", "GRADUACAO_SERVIDOR", "TEMPO_CONTRIBUICAO", "VT_ITINERARIO"].includes(row.kind) && row.name.endsWith(" — DEMO")) return row.name.slice(0, -" — DEMO".length);
  }
  return null;
}
async function main() {
  const report = { packageId, mode: apply ? "APPLIED" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), changes: [] as { id: string; kind: string; previous: string; current: string }[], finishedAt: "" };
  const reportKey = Date.now();
  const persist = () => { mkdirSync("docs/checkup/demonstration-data", { recursive: true }); writeFileSync(`docs/checkup/demonstration-data/rh-labels-${apply ? "applied" : "preview"}-${reportKey}.json`, JSON.stringify(report, null, 2) + "\n"); };
  try {
    const [actor] = (await connection.db.execute<{ id: string }>(sql`SELECT u.id FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.id='cmvba36v700007kqmdslbwhkk' AND u.ativo AND p.ativo AND p.codigo='SYSTEM_ADMINISTRATOR'`)).rows;
    assert.ok(actor);
    const selected = (await connection.db.select().from(hrReferenceRecords).orderBy(hrReferenceRecords.id)).flatMap(row => { const name = reviewedName(row); return name ? [{ row, name }] : []; });
    for (let offset = 0; offset < selected.length; offset += 50) {
      try {
        await withDatabaseTransaction(connection, async tx => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
          await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${actor.id},true)`);
          for (const { row: inspected, name } of selected.slice(offset, offset + 50)) {
            const [row] = await tx.select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.id, inspected.id), eq(hrReferenceRecords.updatedAt, inspected.updatedAt))).for("update");
            assert.ok(row, `Referência alterada desde a inspeção: ${inspected.id}`);
            // The full-record service adds defaults to legacy details. This label-only
            // schema update preserves their exact JSON; the existing DB trigger records the revision.
            const [saved] = await tx.update(hrReferenceRecords).set({ name }).where(eq(hrReferenceRecords.id, row.id)).returning();
            assert.equal(saved.code, row.code);
            assert.deepEqual(saved.details, row.details);
            await tx.execute(sql`INSERT INTO "MunicipalPresentationRevision" (id,"tableName","recordId","columnName","previousValue","currentValue") VALUES (${randomUUID()},'HrReferenceRecord',${row.id},'name',${row.name},${name})`);
            report.changes.push({ id: row.id, kind: row.kind, previous: row.name, current: name });
          }
          if (apply) await tx.insert(financialAuditLogs).values({ action: "CHECKUP_RH_PRESENTATION_NORMALIZED", entityType: "DATASET", entityId: `${packageId}:${offset}`, authorUsuarioId: actor.id, payload: { source: "Rótulos de apresentação revisados; campos de cálculo, escopo, códigos, vínculos e snapshots anteriores preservados.", ids: selected.slice(offset, offset + 50).map(({ row }) => row.id) } });
          else throw preview;
        }, { timeoutMs: 180000 });
      } catch (error) { if (error !== preview) throw error; }
      persist();
    }
    report.finishedAt = new Date().toISOString(); persist();
    console.log(JSON.stringify({ mode: report.mode, changes: report.changes.length, kinds: report.changes.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.kind]: (counts[row.kind] ?? 0) + 1 }), {}) }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
