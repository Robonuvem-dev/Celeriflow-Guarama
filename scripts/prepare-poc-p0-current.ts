import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction, type DatabaseExecutor } from "../src/db/transaction";
import { identifier, insertToolRows, openCrossDomainDatabase, queryRows } from "./lib/cross-domain-database";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cadastroPeople, cadastroRoles, executiveUnits, legislativeUnits } from "./plausible-cadastro-data";
import { referenceNames } from "./municipal-name-targets";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const prefix = "p0-current-";
const tables = ["GovernmentEntity", "PlanningEntityScope", "PlanningEntityUnit", "Secretariat", "BudgetUnit", "CostCenter", "FinancialYear", "ResourceSource", "RevenueNature", "ExpenseNature", "AccountingPlan", "ConfiguracaoPerfil", "Usuario", "UsuarioUnidadeGestora", "Person", "Taxpayer", "RealEstate", "EconomicRegistration", "MultiYearPlan", "BudgetGuideline", "AnnualBudgetLaw", "PlanningInstrument"];

async function fingerprint(db: DatabaseExecutor) {
  const result: Record<string, { count: number; hash: string }> = {};
  for (const table of tables) {
    const key = table === "PlanningEntityScope" ? "governmentEntityId" : table === "PlanningEntityUnit" ? "budgetUnitId" : "id";
    const [row] = await queryRows<{ count: bigint; hash: string }>(db, sql`SELECT count(*) AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY ${identifier(key)}),'')) AS hash FROM ${identifier(table)} t WHERE ${identifier(key)} NOT LIKE ${`${prefix}%`}`);
    result[table] = { count: Number(row.count), hash: row.hash };
  }
  return result;
}

async function inventory(db: DatabaseExecutor) {
  const result: Record<string, number> = {};
  for (const table of [...tables, "PlanningBudgetLine", "PlanningCatalogVersion", "AccountingTransaction", "Revenue", "TaxAssessment", "TaxGuide", "FinancialAuditLog"]) {
    const [row] = await queryRows<{ count: bigint }>(db, sql`SELECT count(*) AS count FROM ${identifier(table)}`);
    result[table] = Number(row.count);
  }
  return result;
}

async function main() {
  const connection = openCrossDomainDatabase(20_000);
  const { db } = connection;
  const apply = process.argv.includes("--apply");
  const baseline = JSON.parse(readFileSync("docs/poc-p0/BASELINE.json", "utf8"));
  try {
    const migrations = await queryRows<{ migration_name: string; checksum: string; finished: boolean; rolled_back: boolean }>(db, sql`SELECT migration_name,checksum,finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at`);
    const migrationStatus = baseline.migrations.map((m: { name: string; hash: string }) => {
      const sql = readFileSync(`prisma/migrations-ibema/${m.name}/migration.sql`, "utf8");
      const localHash = createHash("sha256").update(sql).digest("hex");
      const lfHash = createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex");
      const crlfHash = createHash("sha256").update(sql.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")).digest("hex");
      const row = migrations.findLast((r) => r.migration_name === m.name && !r.rolled_back);
      return { name: m.name, applied: row?.finished === true, checksumMatches: [localHash, lfHash, crlfHash].includes(row?.checksum ?? ""), checksumMode: row?.checksum === localHash ? "BYTES_IDÊNTICOS" : "NORMALIZAÇÃO_LF_CRLF", baselineMatches: m.hash === localHash };
    });
    const subsequentMigrations = [...new Set(migrations.map((row) => row.migration_name).filter((name) => !baseline.migrations.some((item: { name: string }) => item.name === name)))].map((name) => {
      const row = migrations.findLast((migration) => migration.migration_name === name)!;
      const sql = readFileSync(`prisma/migrations-ibema/${row.migration_name}/migration.sql`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const normalized = createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex");
      return { name: row.migration_name, applied: row.finished && !row.rolled_back, checksumMatches: [checksum, normalized].includes(row.checksum), status: row.finished && !row.rolled_back && [checksum, normalized].includes(row.checksum) ? "APLICADA_E_CHECKSUM_CONFERIDO" : "PENDENTE_OU_DIVERGENTE" };
    });
    if (migrationStatus.some((m: { applied: boolean; checksumMatches: boolean; baselineMatches: boolean }) => !m.applied || !m.checksumMatches || !m.baselineMatches)) {
      console.log(JSON.stringify(migrationStatus.filter((m: { applied: boolean; checksumMatches: boolean; baselineMatches: boolean }) => !m.applied || !m.checksumMatches || !m.baselineMatches), null, 2));
      throw new Error("Migration pendente ou checksum divergente; consultar inventário antes da carga.");
    }
    const before = await inventory(db);
    const preserved = await fingerprint(db);
    const [actor] = await queryRows<{ id: string }>(db, sql`SELECT u.id FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo=true AND p.codigo='SYSTEM_ADMINISTRATOR' LIMIT 1`);
    if (apply && !actor) throw new Error("Administrador técnico ativo não encontrado.");
    if (apply) await withDatabaseTransaction(connection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('IBEMA_POC_P0_CURRENT_V1'))`);
      for (const suffix of ["exe", "leg"] as const) {
        const governmentEntityId = `${prefix}${suffix}`;
        const secretariatId = `${prefix}secretariat-${suffix}`;
        await insertToolRows(tx, "GovernmentEntity", { id: governmentEntityId, code: suffix === "exe" ? "AURORA-EXEC" : "AURORA-LEG", name: `${suffix === "exe" ? "Prefeitura" : "Câmara"} Municipal de Aurora das Veredas`, type: suffix === "exe" ? "PREFEITURA" : "CAMARA" }, ["id"]);
        for (const year of [2024, 2025, 2026, 2027]) await insertToolRows(tx, "FinancialYear", { id: `${prefix}fin-year-${suffix}-${year}`, governmentEntityId, year, status: "Preparação", startDate: new Date(`${year}-01-01T00:00:00Z`), endDate: new Date(`${year}-12-31T23:59:59Z`) }, ["governmentEntityId", "year"]);
        await insertToolRows(tx, "PlanningEntityScope", { governmentEntityId, jurisdiction: suffix === "exe" ? "EXECUTIVE" : "LEGISLATIVE" }, ["governmentEntityId"]);
        await insertToolRows(tx, "Secretariat", { id: secretariatId, name: suffix === "exe" ? "Secretaria Municipal de Administração" : "Diretoria Administrativa da Câmara Municipal" }, ["id"]);
        for (let i = 1; i <= 21; i++) {
          const id = `${prefix}${suffix}-ug-${i}`;
          const name = (suffix === "exe" ? executiveUnits : legislativeUnits)[i - 1];
          await insertToolRows(tx, "BudgetUnit", { id, code: `AV.${suffix === "exe" ? "01" : "02"}.${String(i).padStart(3, "0")}`, name, secretariatId }, ["id"]);
          await insertToolRows(tx, "PlanningEntityUnit", { budgetUnitId: id, governmentEntityId }, ["budgetUnitId"]);
          await insertToolRows(tx, "CostCenter", { id: `${prefix}${suffix}-cc-${i}`, code: `AV.${suffix === "exe" ? "01" : "02"}.CC.${String(i).padStart(3, "0")}`, name: `${name} — Custeio`, governmentEntityId, secretariatId }, ["id"]);
        }
        const roles: Record<string, Record<string, boolean>> = { proponente: { create: true, update: true }, aprovador: { update: true, legalApproval: true }, sancionador: { update: true, legalApproval: true }, consulta: { create: false, update: false, issueReports: true }, financeiro: { create: true, update: true, issueReports: true }, controlador: { create: true, update: true, issueReports: true }, notificado: { create: false, update: false } };
        for (const [role, grants] of Object.entries(roles)) {
          const id = `${prefix}${suffix}-${role}`;
          const permissions = { modules: Object.fromEntries(["PLANEJAMENTO", "FINANCEIRO", "TRIBUTACAO", "AUDITORIA", "CAMARA", "DOCUMENTOS", "TRANSPARENCIA"].map((code) => [code, { blocked: false, ...grants }])) };
          const roleIndex = cadastroRoles.findIndex(([key]) => key === role);
          const roleLabel = cadastroRoles[roleIndex][1];
          const person = cadastroPeople[roleIndex + (suffix === "leg" ? 7 : 0)];
          await insertToolRows(tx, "ConfiguracaoPerfil", { id, codigo: `POC_P0_${suffix}_${role}`.toUpperCase(), nome: `${roleLabel} — ${suffix === "exe" ? "Executivo" : "Legislativo"}`, permissoes: JSON.stringify(permissions) }, ["id"]);
          await insertToolRows(tx, "Usuario", { id, nome: person.name, email: person.email, perfilId: id }, ["id"]);
          await insertToolRows(tx, "UsuarioUnidadeGestora", { id: `${id}-scope`, usuarioId: id, budgetUnitId: `${prefix}${suffix}-ug-1` }, ["usuarioId", "budgetUnitId"]);
        }
        const ppaId = `${prefix}${suffix}-ppa`;
        const pieceId = `${prefix}${suffix}-piece-ppa`;
        await insertToolRows(tx, "MultiYearPlan", { id: ppaId, code: `AV.${suffix.toUpperCase()}.2024-2027`, name: `Plano Plurianual 2024–2027 — ${suffix === "exe" ? "Executivo" : "Legislativo"}`, startYear: 2024, endYear: 2027, status: "DRAFT", draftedById: actor!.id }, ["id"]);
        await insertToolRows(tx, "PlanningInstrument", { id: pieceId, governmentEntityId, kind: "PPA", code: "AV-PPA-2024", title: "Plano Plurianual 2024–2027", startYear: 2024, endYear: 2027, multiYearPlanId: ppaId, createdById: actor!.id }, ["id"]);
        for (const year of [2024, 2025, 2026, 2027]) {
          const [financialYear] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "FinancialYear" WHERE "governmentEntityId"=${governmentEntityId} AND year=${year}`);
          if (!financialYear) throw new Error("Exercício financeiro não encontrado.");
          const ldoId = `${prefix}${suffix}-ldo-${year}`;
          const loaId = `${prefix}${suffix}-loa-${year}`;
          const ldoPiece = `${prefix}${suffix}-piece-ldo-${year}`;
          await insertToolRows(tx, "BudgetGuideline", { id: ldoId, financialYearId: financialYear.id, multiYearPlanId: ppaId, status: "DRAFT", draftedById: actor!.id }, ["id"]);
          await insertToolRows(tx, "PlanningInstrument", { id: ldoPiece, governmentEntityId, kind: "LDO", code: `AV-LDO-${year}`, title: `Diretrizes Orçamentárias ${year}`, startYear: year, endYear: year, budgetGuidelineId: ldoId, parentId: pieceId, createdById: actor!.id }, ["id"]);
          await insertToolRows(tx, "AnnualBudgetLaw", { id: loaId, lawNumber: `AV-LOA-${year}`, financialYearId: financialYear.id, budgetGuidelineId: ldoId, totalRevenue: 0, totalExpense: 0, status: "DRAFT", draftedById: actor!.id }, ["id"]);
          await insertToolRows(tx, "PlanningInstrument", { id: `${prefix}${suffix}-piece-loa-${year}`, governmentEntityId, kind: "LOA", code: `AV-LOA-${year}`, title: `Orçamento Anual ${year}`, startYear: year, endYear: year, annualBudgetLawId: loaId, parentId: ldoPiece, createdById: actor!.id }, ["id"]);
        }
      }
      for (let i = 1; i <= 21; i++) {
        // Explicitly synthetic codes: never replace or impersonate official classifications.
        await insertToolRows(tx, "ResourceSource", { id: `${prefix}source-${i}`, code: `AV.SOURCE.${String(i).padStart(3, "0")}`, name: referenceNames.ResourceSource[i - 1] }, ["id"]);
        await insertToolRows(tx, "RevenueNature", { id: `${prefix}revenue-${i}`, code: `AV.REVENUE.${String(i).padStart(3, "0")}`, name: referenceNames.RevenueNature[i - 1] }, ["id"]);
        await insertToolRows(tx, "ExpenseNature", { id: `${prefix}expense-${i}`, code: `AV.EXPENSE.${String(i).padStart(3, "0")}`, name: referenceNames.ExpenseNature[i - 1] }, ["id"]);
        await insertToolRows(tx, "AccountingPlan", { id: `${prefix}account-${i}`, code: `AV.ACCOUNT.${String(i).padStart(3, "0")}`, name: referenceNames.AccountingPlan[i - 1], type: i % 2 ? "Ativo" : "Passivo" }, ["id"]);
        await insertToolRows(tx, "Taxpayer", { id: `${prefix}taxpayer-${i}`, taxpayerType: "PF", municipalInsc: `AV.PF.${1000 + i}`, fiscalNotes: "Cadastro municipal de referência, com documentação sujeita à conferência cadastral." }, ["id"]);
        await insertToolRows(tx, "RealEstate", { id: `${prefix}property-${i}`, municipalInsc: `01.02.${String(i).padStart(4, "0")}.001`, propertyType: "Terreno", taxpayerId: `${prefix}taxpayer-${i}`, landArea: 100 + i, streetName: ["Rua das Veredas", "Avenida do Ipê", "Rua Serra Clara", "Rua do Comércio", "Avenida das Nascentes", "Rua das Palmeiras", "Rua da Estação"][(i - 1) % 7], number: String(i) }, ["id"]);
        await insertToolRows(tx, "EconomicRegistration", { id: `${prefix}economic-${i}`, municipalInsc: `AV.EC.${2000 + i}`, taxpayerId: `${prefix}taxpayer-${i}`, startDate: new Date("2026-01-01T00:00:00Z") }, ["id"]);
      }
      const [marker] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "FinancialAuditLog" WHERE action='POC_P0_DATASET_PREPARED' AND "entityId"='POC_P0_CURRENT_V1' LIMIT 1`);
      if (!marker) await insertToolRows(tx, "FinancialAuditLog", { action: "POC_P0_DATASET_PREPARED", entityType: "POC_DATASET", entityId: "POC_P0_CURRENT_V1", authorUsuarioId: actor!.id, payload: { phase: "P0", version: 1, prefix, synthetic: true, mode: "ADDITIVE_ONLY", years: [2024, 2025, 2026, 2027] } });
      // Abort the whole seed if any pre-existing row changed unexpectedly.
      const after = await fingerprint(tx);
      if (JSON.stringify(after) !== JSON.stringify(preserved)) throw new Error(`Verificação de preservação falhou em ${tables.filter((table) => JSON.stringify(after[table]) !== JSON.stringify(preserved[table])).join(", ")}; transação revertida.`);
    }, { timeoutMs: 240000, lockTimeoutMs: 240000 });
    const after = await inventory(db);
    const fingerprintsAfter = await fingerprint(db);
    const users = await queryRows<{ perfilId: string; _count: number }>(db, sql`SELECT "perfilId",count(*)::integer AS _count FROM "Usuario" WHERE ativo=true AND "firebaseUid" IS NOT NULL GROUP BY "perfilId"`);
    const report = { generatedAt: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), environment: "BANCO_ATUAL_AUTORIZADO_PELO_USUÁRIO_COM_DADOS_FICTÍCIOS", mode: apply ? "ADDITIVE_ONLY" : "READ_ONLY", migrations: migrationStatus, subsequentMigrations, before, after, existingRowsPreserved: JSON.stringify(preserved) === JSON.stringify(fingerprintsAfter), fingerprintsBefore: preserved, fingerprintsAfter, dataset: { id: "POC_P0_CURRENT_V1", prefix, years: [2024, 2025, 2026, 2027], nature: "SINTÉTICO; NÃO PARAMETRIZAÇÃO LEGAL", seeded: apply }, authentication: { activeFirebaseLinkedUsers: users.reduce((sum, row) => sum + row._count, 0), profilesWithFirebaseLinkedUsers: users.length, existingCredentialsChanged: false, browserAcceptance: "NÃO_EXECUTADO; NAVEGADOR NÃO CONECTADO" }, conclusion: "Base atual compatível; nenhuma infraestrutura nova exigida. Preparação não é aceite dos requisitos." };
    const reportPath = existsSync("docs/poc-p0/AMBIENTE_ATUAL.json") && JSON.parse(readFileSync("docs/poc-p0/AMBIENTE_ATUAL.json", "utf8")).mode === "ADDITIVE_ONLY" ? "docs/poc-p0/AMBIENTE_ATUAL_VERIFICACAO.json" : "docs/poc-p0/AMBIENTE_ATUAL.json";
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ mode: report.mode, migrations: migrationStatus.length + subsequentMigrations.length, baselineMigrations: migrationStatus.length, before, after, existingRowsPreserved: report.existingRowsPreserved, authentication: report.authentication }, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch((error: unknown) => { console.error("P0 não concluída:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[URL omitida]") : "ERRO"); process.exitCode = 1; });
