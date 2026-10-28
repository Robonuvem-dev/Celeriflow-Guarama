import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { identifier, openCrossDomainDatabase, queryRows, readApplicationCatalog, requireAdministrator } from "./lib/cross-domain-database";
import { applyRepopulationChanges, type RepopulationChange } from "./lib/cross-domain-repopulation";
import { mkdirSync, writeFileSync } from "node:fs";
import { cadastroTargets } from "./plausible-cadastro-data";
import { getMunicipalNameTargets, type MunicipalNameTarget } from "./municipal-name-targets";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const placeholder = /(^|[^a-zA-Z0-9])(POC|DEMONSTRA[ÇC][ÃA]O|DEMO|FICT[ÍI]CI[OA]|TESTE|SINT[ÉE]TIC[OA]|EXEMPLO|SIMULAD[OA]|ENSAIO)([^a-zA-Z0-9]|$)|example[.](test|invalid)|[.]poc[.]test/i;
const apply = process.argv.includes("--apply");
type Change = RepopulationChange;
async function main() {
  const connection = openCrossDomainDatabase(20_000);
  const { db, pool } = connection;
  try {
    const changes: Change[] = [];
    const skipped: Array<{ model: string; id: string; reason: string }> = [];
    const targetsByKey = new Map<string, MunicipalNameTarget>();
    const candidates: MunicipalNameTarget[] = [...cadastroTargets, ...(process.argv.includes("--general") ? await getMunicipalNameTargets(db) : [])];
    for (const target of candidates) {
      const key = `${target.model}:${target.id}`, previous = targetsByKey.get(key);
      targetsByKey.set(key, { ...target, values: { ...previous?.values, ...target.values }, expected: { ...previous?.expected, ...target.expected }, fill: [...new Set([...(previous?.fill || []), ...(target.fill || [])])] });
    }
    const targetsForRun = [...targetsByKey.values()];
    const personTargets = cadastroTargets.filter(target => target.model === "Person");
    const linkedEmployees = await queryRows<{ id: string; person: { id: string; fullName: string } }>(db, sql`SELECT e.id,jsonb_build_object('id',p.id,'fullName',p."fullName") AS person FROM "Employee" e JOIN "Person" p ON p.id=e."personId" WHERE e."personId"=ANY(${sql.param(personTargets.map(target => target.id))}::text[])`);
    for (const employee of linkedEmployees) {
      if (!employee.person || targetsForRun.some(target => target.model === "Employee" && target.id === employee.id)) continue;
      const personTarget = personTargets.find(target => target.id === employee.person!.id)!;
      const name = placeholder.test(employee.person.fullName) ? personTarget.values.fullName : employee.person.fullName;
      targetsForRun.push({ model: "Employee", id: employee.id, values: { name } });
    }
    const catalog = await readApplicationCatalog(db);
    for (const modelName of new Set(targetsForRun.map(target => target.model))) {
      const model = catalog.find(item => item.name === modelName);
      if (!model) throw new Error(`Modelo não suportado: ${modelName}`);
      const targets = targetsForRun.filter(target => target.model === modelName);
      const rows = await queryRows<{ row: Record<string, unknown> }>(db, sql`SELECT to_jsonb(t) AS row FROM ${identifier(modelName)} t WHERE id=ANY(${sql.param(targets.map(target => target.id))}::text[])`);
      for (const target of targets) {
        const snapshot = rows.find(item => item.row.id === target.id)?.row;
        if (!snapshot) { skipped.push({ model: modelName, id: target.id, reason: "Registro ausente; não criar identidade paralela" }); continue; }
        const before: Change["before"] = {}; const after: Change["after"] = {};
        for (const [field, value] of Object.entries(target.values)) {
          if (!model.fields.some(item => item.name === field && item.isString && !item.isArray)) throw new Error(`Campo não suportado: ${modelName}.${field}`);
          const current = snapshot[field];
          if (current === value) continue;
          if (current != null && typeof current !== "string") throw new Error("Tipo de campo inesperado.");
          if ((target.fill?.includes(field) && !current) || target.expected?.[field] === current || (typeof current === "string" && placeholder.test(current))) {
            before[field] = current as string | null; after[field] = value;
          } else skipped.push({ model: modelName, id: target.id, reason: `${field}: valor personalizado preservado` });
        }
        if (Object.keys(after).length) changes.push({ model: modelName, id: target.id, before, after, snapshot });
      }
    }
    if (apply && changes.length) {
      const actor = await requireAdministrator(db);
      await withDatabaseTransaction(connection, tx => applyRepopulationChanges(tx, changes, actor.id), { timeoutMs: 240000, lockTimeoutMs: 240000 });
    }
    const report = { capturedAt: new Date().toISOString(), mode: apply ? "APPLY" : "PREVIEW", fictional: true, records: changes.length, fields: changes.reduce((total, change) => total + Object.keys(change.after).length, 0), changes: changes.map(({ model, id, before, after }) => ({ model, id, before, after })), skipped };
    mkdirSync(".next/cache/data-review", { recursive: true });
    const reportPath = `.next/cache/data-review/repopulation-${apply ? "applied" : "preview"}-${report.capturedAt.replaceAll(":", "-")}.json`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, records: report.records, fields: report.fields, models: [...new Set(changes.map(change => change.model))], skipped: skipped.length, report: reportPath }, null, 2));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na repopulação."); process.exitCode = 1; });
