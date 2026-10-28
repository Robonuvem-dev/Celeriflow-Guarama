import { createHash } from "node:crypto";
import { config } from "dotenv";
import { and, eq, isNotNull } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users } from "../src/db/schema/identity";
import { healthCbos } from "../src/db/schema/master-data";
import { auditEvents } from "../src/db/schema/audit";
import { healthSusImportBatches, healthSusImportIssues } from "../src/db/schema/health-catalogs";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Carga controlada de procedimentos via infraestrutura oficial do módulo
// (parseHealthSusImport + processHealthSusRecords + HealthSusImportBatch).
// Origem declarada no lote; contrato LOCAL_CONTROLLED_V1; sem vínculo com
// atualização oficial. Códigos de procedimentos na faixa 99 (não oficial),
// referências CBO/CID reais (classificações públicas estáveis).
export async function loadSigtapBase(connection: DatabaseConnection) {
  const { parseHealthSusImport } = await import("../src/lib/saude/sus-import-contract");
  const { processHealthSusRecords } = await import("../src/lib/saude/sus-import-service");
  const [usuario] = await connection.db.select({ id: users.id }).from(users).where(isNotNull(users.employeeId)).limit(1);
  if (!usuario) throw new Error("Usuario não encontrado");
  const competence = "2026-09";
  const [existingCbo] = await connection.db.select({ description: healthCbos.description }).from(healthCbos).where(eq(healthCbos.code, "225125")).limit(1);
  const cbo225125 = existingCbo?.description || "Médico clínico";

  const rows: string[][] = [
    ["tipo", "codigo", "descricao", "valor_unitario", "instrumento_registro", "financiamento", "complexidade", "idade_minima", "idade_maxima", "sexo_permitido", "cids", "cbos", "servicos", "classificacoes"],
    ["cbo", "225125", cbo225125, "", "", "", "", "", "", "", "", "", "", ""],
    ["cbo", "223505", "Enfermeiro", "", "", "", "", "", "", "", "", "", "", ""],
    ["cbo", "322205", "Técnico de enfermagem", "", "", "", "", "", "", "", "", "", "", ""],
    ["cbo", "515105", "Agente comunitário de saúde", "", "", "", "", "", "", "", "", "", "", ""],
    ["cid", "J06", "Infecção aguda das vias aéreas superiores", "", "", "", "", "", "", "", "", "", "", ""],
    ["cid", "I10", "Hipertensão essencial", "", "", "", "", "", "", "", "", "", "", ""],
    ["cid", "E11", "Diabetes mellitus tipo 2", "", "", "", "", "", "", "", "", "", "", ""],
    ["cid", "Z00", "Exame geral e investigação", "", "", "", "", "", "", "", "", "", "", ""],
    ["servico", "SUS_SRV_AB", "Atendimento básico (carga local)", "", "", "", "", "", "", "", "", "", "", ""],
    ["servico", "SUS_SRV_AE", "Atendimento especializado (carga local)", "", "", "", "", "", "", "", "", "", "", ""],
    ["classificacao", "SUS_CLS_AB", "Atenção básica (carga local)", "", "", "", "", "", "", "", "", "", "", ""],
    ["classificacao", "SUS_CLS_MC", "Média complexidade (carga local)", "", "", "", "", "", "", "", "", "", "", ""],
    ["especialidade", "SUS_ESP_MFC", "Medicina de família e comunidade (carga local)", "", "", "", "", "", "", "", "", "", "", ""],
    ["procedimento", "9900000001", "Consulta médica em atenção primária (carga local)", "10.00", "BPA", "PAB", "Baixa", "", "", "", "J06;Z00", "225125", "SUS_SRV_AB", "SUS_CLS_AB"],
    ["procedimento", "9900000002", "Aferição de pressão arterial (carga local)", "0.00", "BPA", "PAB", "Baixa", "", "", "", "I10", "322205", "SUS_SRV_AB", "SUS_CLS_AB"],
    ["procedimento", "9900000003", "Consulta de enfermagem (carga local)", "8.50", "BPA", "PAB", "Baixa", "", "", "", "Z00", "223505", "SUS_SRV_AB", "SUS_CLS_AB"],
    ["procedimento", "9900000004", "Teste de glicemia capilar (carga local)", "3.00", "BPA", "MAC", "Baixa", "", "", "", "E11", "322205", "SUS_SRV_AB", "SUS_CLS_AB"],
    ["procedimento", "9900000005", "Visita domiciliar por agente comunitário (carga local)", "5.00", "BPA", "PAB", "Baixa", "", "", "", "", "515105", "SUS_SRV_AB", "SUS_CLS_AB"],
    ["procedimento", "9900000006", "Consulta especializada em cardiologia (carga local)", "25.00", "BPA", "MAC", "Média", "18", "", "", "I10", "225125", "SUS_SRV_AE", "SUS_CLS_MC"],
    ["procedimento", "9900000007", "Avaliação geriátrica ampla (carga local)", "30.00", "BPA", "MAC", "Média", "60", "", "", "I10;E11", "225125", "SUS_SRV_AE", "SUS_CLS_MC"],
    ["procedimento", "9900000008", "Coleta de exame citopatológico (carga local)", "12.00", "BPA", "MAC", "Baixa", "25", "64", "F", "Z00", "223505", "SUS_SRV_AE", "SUS_CLS_MC"],
    ["procedimento", "9900000009", "Curativo simples (carga local)", "4.00", "BPA", "PAB", "Baixa", "", "", "", "", "322205", "SUS_SRV_AB", "SUS_CLS_AB"],
    ["procedimento", "9900000010", "Administração de medicamento injetável (carga local)", "2.50", "BPA", "PAB", "Baixa", "", "", "", "", "322205;223505", "SUS_SRV_AB", "SUS_CLS_AB"],
    ["procedimento", "9900000011", "Atendimento odontológico individual (carga local)", "15.00", "BPA", "MAC", "Baixa", "", "", "", "", "225125", "SUS_SRV_AE", "SUS_CLS_MC"],
    ["procedimento", "9900000012", "Acompanhamento de hipertenso e diabético (carga local)", "7.00", "BPA", "FAEC", "Baixa", "", "", "", "I10;E11", "225125;223505", "SUS_SRV_AB", "SUS_CLS_AB"],
  ];
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, "\"\"")}"`).join(";")).join("\n");
  const bytes = Buffer.from(csv, "utf-8");
  const records = parseHealthSusImport(csv, "csv");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await connection.db.select({ id: healthSusImportBatches.id, status: healthSusImportBatches.status }).from(healthSusImportBatches).where(and(eq(healthSusImportBatches.source, "SIGTAP"), eq(healthSusImportBatches.competence, competence), eq(healthSusImportBatches.checksum, checksum))).limit(1);
  if (existing && existing.status !== "FAILED") {
    return { status: "SKIPPED_DUPLICATE", batchId: existing.id };
  }
  const [batch] = existing
    ? await connection.db.update(healthSusImportBatches).set({ status: "PROCESSING", startedAt: new Date(), completedAt: null }).where(eq(healthSusImportBatches.id, existing.id)).returning({ id: healthSusImportBatches.id })
    : await connection.db.insert(healthSusImportBatches).values({ source: "SIGTAP", competence, origin: "Carga controlada local para demonstração de fluxos (contrato LOCAL_CONTROLLED_V1; sem vínculo com atualização oficial)", fileName: "sigtap-base-local.csv", fileFormat: "CSV", contractVersion: "LOCAL_CONTROLLED_V1", checksum, actorUsuarioId: usuario.id }).returning({ id: healthSusImportBatches.id });
  const result = await withDatabaseTransaction(connection, async tx => {
    await tx.delete(healthSusImportIssues).where(eq(healthSusImportIssues.batchId, batch.id));
    const out = await processHealthSusRecords(tx, { source: "SIGTAP", competence, batchId: batch.id, records });
    if (out.issues.length) await tx.insert(healthSusImportIssues).values(out.issues.map(item => ({ ...item, batchId: batch.id })));
    await tx.update(healthSusImportBatches).set({ status: out.issues.length ? "COMPLETED_WITH_ISSUES" : "COMPLETED", processedCount: out.counters.processed, insertedCount: out.counters.inserted, updatedCount: out.counters.updated, ignoredCount: out.counters.ignored, issueCount: out.issues.length, completedAt: new Date() }).where(eq(healthSusImportBatches.id, batch.id));
    await tx.insert(auditEvents).values({ actorUsuarioId: usuario.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "HEALTH_SUS_IMPORT", targetId: batch.id });
    return out;
  }, { timeoutMs: 60_000 });
  return { status: "LOADED", batchId: batch.id, counters: result.counters, issues: result.issues };
}

async function main() {
  const connection = openCrossDomainDatabase();
  try {
    const result = await loadSigtapBase(connection);
    console.log(JSON.stringify(result, null, result.status === "LOADED" ? 2 : undefined));
  } finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
