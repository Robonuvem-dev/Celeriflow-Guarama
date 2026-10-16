import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const humanFields = new Set(["name", "nome", "fullName", "corporateName", "tradeName", "title", "description", "descricao", "email", "emailPrimary", "municipalInsc", "streetName", "address", "object", "history", "reason", "reference", "notes", "fiscalNotes"]);
const pattern = "(^|[^a-zA-Z0-9])(POC|DEMONSTRA[ÇC][ÃA]O|DEMO|ENSAIO|SINT[ÉE]TIC[OA]|FICT[ÍI]CI[OA]|TESTE|SIMULAD[OA])([^a-zA-Z0-9]|$)|example[.]test|[.]poc[.]test";
async function main() {
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }) });
  try {
    const tables = await db.$queryRaw<Array<{ name: string }>>`SELECT tablename::text AS name FROM pg_tables WHERE schemaname=current_schema()`;
    const present = new Set(tables.map(table => table.name));
    const queries = Prisma.dmmf.datamodel.models.flatMap(model => {
      const table = model.dbName || model.name;
      const primary = model.fields.find(field => field.name === "id" && field.kind !== "object");
      const fields = model.fields.filter(field => field.type === "String" && !field.isList && humanFields.has(field.name));
      if (!present.has(table) || !primary || !fields.length) return [];
      const object = fields.flatMap(field => [Prisma.sql`${field.name}::text`, Prisma.raw(`t."${field.dbName || field.name}"`)]);
      return [Prisma.sql`SELECT ${model.name}::text AS model, t."id"::text AS id, f.key AS field, f.value AS value FROM ${Prisma.raw(`"${table}"`)} t CROSS JOIN LATERAL jsonb_each_text(jsonb_build_object(${Prisma.join(object)})) f WHERE f.value ~* ${pattern}`];
    });
    const rows = await db.$queryRaw<Array<{ model: string; id: string; field: string; value: string }>>(Prisma.join(queries, " UNION ALL "));
    const directory = join(process.cwd(), ".next", "cache", "data-review"); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "inventory.json"), JSON.stringify(rows, null, 2));
    const details = process.argv.find(argument => argument.startsWith("--details="))?.slice("--details=".length).split(",");
    if (details) { console.log(JSON.stringify(rows.filter(row => details.includes(row.model)), null, 2)); return; }
    if (process.argv.includes("--counts")) {
      console.log(JSON.stringify({ matches: rows.length, models: Object.fromEntries([...new Set(rows.map(row => row.model))].sort().map(model => [model, rows.filter(row => row.model === model).length])) }, null, 2)); return;
    }
    const summary = [...new Set(rows.map(row => row.model))].sort().map(model => ({ model, records: new Set(rows.filter(row => row.model === model).map(row => row.id)).size, fields: [...new Set(rows.filter(row => row.model === model).map(row => row.field))], samples: rows.filter(row => row.model === model).slice(0, 3) }));
    console.log(JSON.stringify({ capturedAt: new Date().toISOString(), matches: rows.length, models: summary }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha no inventário de dados."); process.exitCode = 1; });
