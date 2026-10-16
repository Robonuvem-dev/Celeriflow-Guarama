import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const migrationName = "20261011030000_hr_workforce_foundation";
const expectedLF = "eb830c0f4fe72f9b0bee6269c5ab141089d0a12db3af52596db7fe970e72f402";
export const expectedFoundationChecksum = "b0da3ace2e59d743cd4584c983729dbc87d0b0ba26156e86b8f0226d99ffd1f2";
const hash = (value) => createHash("sha256").update(value).digest("hex");

/** Restore only the proven original bytes; any SQL/content change fails closed. */
export function reconstructFoundationBytes(current) {
  const lf = current.toString("utf8").replaceAll("\r\n", "\n");
  if (hash(lf) !== expectedLF) throw new Error("Conteúdo SQL diferente do diagnóstico; nenhuma gravação permitida.");
  const lines = lf.split("\n");
  if (lines.length !== 114 || lines[113] !== "") throw new Error("Quantidade de linhas ou terminador final inesperado.");
  const lfLines = new Set([67, 68, 69, 70, 71, 72, 73, 74, 80, 81, 82, 83, 84, 85, 86, 87]);
  const original = Buffer.from(lines.map((line, index) => line + (index === lines.length - 1 ? "" : lfLines.has(index + 1) ? "\n" : "\r\n")).join(""), "utf8");
  if (hash(original) !== expectedFoundationChecksum || original.toString("utf8").replaceAll("\r\n", "\n") !== lf) {
    throw new Error("Reconstrução divergente do arquivo aplicado; nenhuma gravação permitida.");
  }
  return original;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--apply", "--temporal", "--consignments"].includes(arg)) || new Set(args).size !== args.length || (args.includes("--temporal") && args.includes("--consignments"))) throw new Error("Use nenhum argumento para a foundation; --temporal ou --consignments seleciona um único arquivo. Acrescente --apply para restaurar.");
  const selectedName = args.includes("--temporal") ? "20261011130000_hr_contract_temporal_revisions" : args.includes("--consignments") ? "20261011160000_hr_consignment_schedule" : migrationName;
  const expectedChecksum = args.includes("--temporal") ? "3f5d8a57c8ba0c693da4868bb6088e6474defe2392bfa52b6f22130583a70d6c" : args.includes("--consignments") ? "71ac51cab3db791b284de006763091011147581b94d4dda253d8cd77e73697fe" : expectedFoundationChecksum;
  const migrationPath = `prisma/migrations-ibema/${selectedName}/migration.sql`;
  const current = readFileSync(migrationPath);
  const original = selectedName === migrationName ? reconstructFoundationBytes(current) : Buffer.from(current.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
  if (hash(original) !== expectedChecksum) throw new Error("Conteúdo SQL diferente do diagnóstico; nenhuma gravação permitida.");
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaNeon } = await import("@prisma/adapter-neon");
  const { neonConfig } = await import("@neondatabase/serverless");
  const { default: ws } = await import("ws");
  neonConfig.webSocketConstructor = ws;
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL }) });
  try {
    const rows = await db.$queryRaw`
      SELECT checksum, finished_at, rolled_back_at, applied_steps_count
      FROM "_prisma_migrations" WHERE migration_name = ${selectedName} ORDER BY started_at`;
    const active = rows.filter((row) => row.rolled_back_at === null);
    if (active.length !== 1 || active[0].finished_at === null || active[0].applied_steps_count !== 1 || active[0].checksum !== expectedChecksum) {
      throw new Error("Registro do banco não corresponde ao diagnóstico; nenhuma gravação permitida.");
    }
    const apply = args.includes("--apply");
    if (apply && hash(current) !== expectedChecksum) writeFileSync(migrationPath, original);
    if (apply && hash(readFileSync(migrationPath)) !== expectedChecksum) throw new Error("Falha na conferência dos bytes restaurados.");
    console.log(JSON.stringify({ mode: apply ? "RESTORE_FILE_BYTES" : "PREVIEW", migration: selectedName, currentChecksum: hash(current), originalChecksum: hash(original), sqlContentIdentical: true, databaseHistoryChanged: false }));
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const message = error instanceof Error && /^(Use nenhum|Conteúdo SQL|Quantidade de linhas|Reconstrução divergente|Registro do banco|Falha na conferência)/.test(error.message) ? error.message : "Não foi possível conferir/restaurar a foundation; nenhum histórico de banco foi modificado.";
    console.error(message);
    process.exitCode = 1;
  });
}
