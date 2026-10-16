import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { cadastroTargets } from "./plausible-cadastro-data";
import { getMunicipalNameTargets, type MunicipalNameTarget } from "./municipal-name-targets";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const placeholder = /(^|[^a-zA-Z0-9])(POC|DEMONSTRA[ÇC][ÃA]O|DEMO|FICT[ÍI]CI[OA]|TESTE|SINT[ÉE]TIC[OA]|EXEMPLO|SIMULAD[OA]|ENSAIO)([^a-zA-Z0-9]|$)|example[.](test|invalid)|[.]poc[.]test/i;
const apply = process.argv.includes("--apply");
type Change = { model: string; id: string; before: Record<string, string | null>; after: Record<string, string>; snapshot: Prisma.InputJsonObject };
async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Conexão do banco não configurada.");
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
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
    const linkedEmployees = await db.employee.findMany({ where: { personId: { in: personTargets.map(target => target.id) } }, select: { id: true, person: { select: { id: true, fullName: true } } } });
    for (const employee of linkedEmployees) {
      if (!employee.person || targetsForRun.some(target => target.model === "Employee" && target.id === employee.id)) continue;
      const personTarget = personTargets.find(target => target.id === employee.person!.id)!;
      const name = placeholder.test(employee.person.fullName) ? personTarget.values.fullName : employee.person.fullName;
      targetsForRun.push({ model: "Employee", id: employee.id, values: { name } });
    }
    for (const modelName of new Set(targetsForRun.map(target => target.model))) {
      const model = Prisma.dmmf.datamodel.models.find(item => item.name === modelName);
      if (!model || model.dbName) throw new Error(`Modelo não suportado: ${modelName}`);
      const targets = targetsForRun.filter(target => target.model === modelName);
      const rows = await db.$queryRaw<Array<{ row: Prisma.InputJsonObject }>>(Prisma.sql`SELECT to_jsonb(t) AS row FROM ${Prisma.raw(`"${modelName}"`)} t WHERE id IN (${Prisma.join(targets.map(target => target.id))})`);
      for (const target of targets) {
        const snapshot = rows.find(item => item.row.id === target.id)?.row;
        if (!snapshot) { skipped.push({ model: modelName, id: target.id, reason: "Registro ausente; não criar identidade paralela" }); continue; }
        const before: Change["before"] = {}; const after: Change["after"] = {};
        for (const [field, value] of Object.entries(target.values)) {
          if (!model.fields.some(item => item.name === field && item.type === "String" && item.kind === "scalar")) throw new Error(`Campo não suportado: ${modelName}.${field}`);
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
      const actor = await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } }, select: { id: true } });
      await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('PLAUSIBLE_CADASTROS_V1'))`;
        for (const change of changes) {
          const assignments = Object.entries(change.after).map(([field, value]) => Prisma.sql`${Prisma.raw(`"${field}"`)} = ${value}`);
          const model = Prisma.dmmf.datamodel.models.find(item => item.name === change.model)!;
          if (model.fields.some(field => field.name === "updatedAt")) assignments.push(Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`);
          // Compare the complete snapshot: concurrent edits abort the whole transaction.
          const rows = await tx.$queryRaw<Array<{ row: Prisma.InputJsonObject }>>(Prisma.sql`UPDATE ${Prisma.raw(`"${change.model}"`)} t SET ${Prisma.join(assignments)} WHERE id = ${change.id} AND to_jsonb(t) = ${JSON.stringify(change.snapshot)}::jsonb RETURNING to_jsonb(t) AS row`);
          if (rows.length !== 1) throw new Error(`Cadastro alterado durante a prévia: ${change.model}/${change.id}`);
          for (const [field, previous] of Object.entries(change.snapshot)) {
            if (field === "updatedAt" || field in change.after) continue;
            if (JSON.stringify(rows[0].row[field]) !== JSON.stringify(previous)) throw new Error(`Campo fora do escopo alterado: ${change.model}.${field}`);
          }
          await tx.financialAuditLog.create({ data: { action: "PLAUSIBLE_CADASTRO_UPDATED", entityType: change.model, entityId: change.id, authorUsuarioId: actor.id, payload: { dataset: "aurora-cadastros-v1", fictional: true, before: change.before, after: change.after, credentialsPreserved: true } } });
        }
      }, { timeout: 240000, maxWait: 20000 });
    }
    const report = { capturedAt: new Date().toISOString(), mode: apply ? "APPLY" : "PREVIEW", fictional: true, records: changes.length, fields: changes.reduce((total, change) => total + Object.keys(change.after).length, 0), changes: changes.map(({ model, id, before, after }) => ({ model, id, before, after })), skipped };
    mkdirSync(".next/cache/data-review", { recursive: true });
    const reportPath = `.next/cache/data-review/repopulation-${apply ? "applied" : "preview"}-${report.capturedAt.replaceAll(":", "-")}.json`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, records: report.records, fields: report.fields, models: [...new Set(changes.map(change => change.model))], skipped: skipped.length, report: reportPath }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na repopulação."); process.exitCode = 1; });
