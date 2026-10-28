import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { identifier, openCrossDomainDatabase, queryRows, readApplicationCatalog } from "./lib/cross-domain-database";
import { mkdirSync, writeFileSync } from "node:fs";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const fields = new Set(["name", "nome", "fullName", "nomeCompleto", "nomeParlamentar", "corporateName", "tradeName", "title", "titulo", "label", "description", "descricao", "email", "emailPrimary", "streetName", "address", "endereco", "object", "notes", "fiscalNotes", "observations", "profession", "propertyUse", "acronym", "municipalInsc", "code", "number", "registration", "contactPerson", "holderName", "funeralHomeName", "doctorName", "motherName", "fatherName", "reason", "reference", "bankName", "ownerName", "generatorName", "requesterName", "managerName"]);
const pattern = "(^|[^a-zA-Z0-9])(POC|DEMONSTRA[ÇC][ÃA]O|DEMO|TESTE|EXEMPLO|MODELO|SIMULAD[OA]|FICT[ÍI]CI[OA]|ENSAIO)([^a-zA-Z0-9]|$)|example[.](test|invalid)|[.]poc[.]test";
const isHumanField = (name: string) => fields.has(name) || ["nomePrefeitura", "municipio", "nomeInstituicao"].includes(name) || /(?:name|nome|title|titulo|label|description|descricao)$/i.test(name) && !/(?:password|senha|token|secret|private)/i.test(name);
async function main() {
  const { db, pool } = openCrossDomainDatabase();
  try {
    const models = await readApplicationCatalog(db);
    const schema = process.argv.find(argument => argument.startsWith("--schema="))?.slice(9).split(",");
    if (schema) { console.log(JSON.stringify(models.filter(model => schema.includes(model.name)).map(model => ({ model: model.name, fields: model.fields.map(field => `${field.name}:${field.type}${field.required ? "" : "?"}${field.defaultValue ? `@default(${field.defaultValue})` : ""}`), relations: model.relations.map(relation => `${relation.columns.join(",")} -> ${relation.model}`) })), null, 2)); return; }
    const inspect = process.argv.find(argument => argument.startsWith("--inspect="))?.slice(10).split(",");
    if (inspect) {
      for (const model of models.filter(model => inspect.includes(model.name))) {
        const selected = model.fields.filter(field => isHumanField(field.name) || field.name.endsWith("Id") || ["id", "status", "year", "kind", "type", "scope", "isDemo", "firebaseUid", "canonicalId", "versionId", "ruleSetId", "sourceHash", "normativeReference", "attributes", "catalogVersionId", "effectiveFrom", "effectiveUntil", "legalReference", "value", "configuracaoInstanciaId", "startsAt", "endsAt", "publishedBy", "createdBy", "version"].includes(field.name));
        const pairs = selected.flatMap(field => [sql`${field.name}::text`, sql`t.${identifier(field.name)}`]);
        const filter = process.argv.find(argument => argument.startsWith("--where="))?.slice(8);
        const split = filter?.indexOf(":") ?? -1;
        const field = filter?.slice(0, split), value = filter?.slice(split + 1);
        if (filter && (split < 1 || !field || !model.fields.some(item => item.name === field))) throw new Error("Campo de inspeção inválido.");
        const where = filter ? sql`WHERE t.${identifier(field!)}::text = ${value}` : sql``;
        const rows = await queryRows(db, sql`SELECT jsonb_build_object(${sql.join(pairs, sql`, `)}) AS record FROM ${identifier(model.name)} t ${where}`);
        console.log(JSON.stringify({ model: model.name, rows }, null, 2));
      }
      return;
    }
    const counts: Array<{ model: string; count: bigint }> = [];
    const labels: Array<{ model: string; id: string; field: string; value: string }> = [];
    for (let offset = 0; offset < models.length; offset += 40) {
      const batch = models.slice(offset, offset + 40);
      counts.push(...await queryRows<{ model: string; count: bigint }>(db, sql.join(batch.map(model => sql`SELECT ${model.name}::text AS model, count(*) AS count FROM ${identifier(model.name)}`), sql` UNION ALL `)));
      const queries = batch.flatMap(model => {
        const selected = model.fields.filter(field => field.isString && !field.isArray && isHumanField(field.name));
        if (!selected.length || !model.fields.some(field => field.name === "id")) return [];
        const pairs = selected.flatMap(field => [sql`${field.name}::text`, sql`t.${identifier(field.name)}`]);
        return [sql`SELECT ${model.name}::text AS model, t.id::text AS id, f.key AS field, f.value AS value FROM ${identifier(model.name)} t CROSS JOIN LATERAL jsonb_each_text(jsonb_build_object(${sql.join(pairs, sql`, `)})) f WHERE f.value ~* ${pattern}`];
      });
      if (queries.length) labels.push(...await queryRows<{ model: string; id: string; field: string; value: string }>(db, sql.join(queries, sql` UNION ALL `)));
    }
    const coverage = counts.map(row => ({ model: row.model, count: Number(row.count), requiredRelations: models.find(model => model.name === row.model)!.relations.filter(relation => relation.required).map(relation => ({ field: relation.field, model: relation.model })) }));
    const report = { capturedAt: new Date().toISOString(), tables: coverage.length, populated: coverage.filter(row => row.count > 0).length, empty: coverage.filter(row => row.count === 0).map(row => row.model), coverage, labels };
    mkdirSync(".next/cache/data-review", { recursive: true });
    writeFileSync(".next/cache/data-review/system-checkup.json", JSON.stringify(report, null, 2));
    if (process.argv.includes("--write-report")) {
      writeFileSync("docs/COBERTURA_TABELAS_DADOS_20261014.md", ["# Cobertura de tabelas — carga municipal", "", `Captura: ${report.capturedAt}`, "", `**${report.tables} tabelas inspecionadas; ${report.populated} com registros; ${report.empty.length} vazias.**`, "", "A cobertura conta registros existentes, não certifica completude funcional. A população literal de todas as tabelas ainda está em andamento. Novos dados desta carga são referências plausíveis autorizadas; dados legais, evidências e confirmações externas preservam seus estados e suas origens.", "", "| Tabela | Registros | Relações obrigatórias |", "| --- | ---: | --- |", ...coverage.sort((a, b) => a.model.localeCompare(b.model)).map(row => `| ${row.model} | ${row.count} | ${row.requiredRelations.map(relation => `${relation.field} → ${relation.model}`).join("; ") || "—"} |`), ""].join("\n"));
    }
    console.log(JSON.stringify({ tables: report.tables, populated: report.populated, emptyCount: report.empty.length, ...(process.argv.includes("--summary") ? {} : { empty: report.empty }), labelMatches: labels.length, labelModels: Object.fromEntries([...new Set(labels.map(row => row.model))].sort().map(model => [model, labels.filter(row => row.model === model).length])) }, null, 2));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha no checkup."); process.exitCode = 1; });
