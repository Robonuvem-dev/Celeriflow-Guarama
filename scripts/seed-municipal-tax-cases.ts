import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection, type DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accessProfiles, users } from "../src/db/schema/identity";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { realEstates } from "../src/db/schema/registry";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { requireTaxFinalRecord } from "../src/db/repositories/tax-final-helpers/records";
import { key, systemDataset } from "./municipal-system-dataset";

export async function seedMunicipalTaxCases(connection: DatabaseConnection, apply = false) {
  const { createTaxAssessmentInTransaction, generateTaxGuideInTransaction } = await import("../src/lib/tributacao");
  const rollback = new Error("PREVIEW_ROLLBACK");
  const rows: Array<{ case: string; assessmentId: string; guideId: string; reused: boolean }> = [];
  const user = requireTaxFinalRecord((await connection.db.select({ id: users.id, employeeId: users.employeeId }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1))[0], "Administrador ativo");
  const actor = { usuarioId: user.id, employeeId: user.employeeId };
  try {
    await withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('AURORA_SYSTEM_TAX_CASES_V1'))`);
        for (let i = 0; i < 20; i++) {
          const caseId = key("tax-case", i);
          const [prior] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "MUNICIPAL_TAX_CASE_POPULATED"), eq(financialAuditLogs.entityId, caseId))).limit(1);
          if (prior) {
            const data = prior.payload;
            if (!data || typeof data !== "object" || !("assessmentId" in data) || typeof data.assessmentId !== "string" || !("guideId" in data) || typeof data.guideId !== "string") throw new Error("Recibo do caso tributário não conciliado.");
            const assessment = requireTaxFinalRecord((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, data.assessmentId)).limit(1))[0], "Lançamento");
            requireTaxFinalRecord((await tx.select().from(taxGuides).where(and(eq(taxGuides.id, data.guideId), eq(taxGuides.assessmentId, data.assessmentId))).limit(1))[0], "Guia");
            if (!assessment.realEstateId) {
              const property = requireTaxFinalRecord((await tx.select().from(realEstates).where(and(eq(realEstates.id, key("property", i)), eq(realEstates.taxpayerId, assessment.taxpayerId))).limit(1))[0], "Imóvel");
              if (assessment.taxpayerId !== key("taxpayer", i) || !["Lançado", "Emitido"].includes(assessment.status)) throw new Error("Origem cadastral do caso foi alterada; preservar o registro do operador.");
              const linked = requireTaxFinalRecord((await tx.update(taxAssessments).set({ realEstateId: property.id }).where(eq(taxAssessments.id, assessment.id)).returning())[0], "Lançamento");
              if (JSON.stringify(linked) !== JSON.stringify({ ...assessment, realEstateId: property.id, updatedAt: linked.updatedAt })) throw new Error("Vínculo cadastral alterou campos fora do escopo; transação revertida.");
              await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_TAX_PROPERTY_LINKED", entityType: "TaxAssessment", entityId: assessment.id, authorUsuarioId: user.id, payload: { fictional: true, before: { realEstateId: null }, after: { realEstateId: property.id }, monetaryValuesPreserved: true, originalSnapshotsPreserved: true } });
            } else if (assessment.realEstateId !== key("property", i)) throw new Error("Imóvel do caso alterado pelo operador; nenhuma substituição automática.");
            rows.push({ case: caseId, assessmentId: data.assessmentId, guideId: data.guideId, reused: true }); continue;
          }
          const assessment = await createTaxAssessmentInTransaction(tx, actor, { year: 2026, taxId: "tax_iptu", taxpayerId: key("taxpayer", i), realEstateId: key("property", i), taxableBase: 80000 + i * 3500, rate: "0.5", competence: new Date("2026-10-01T12:00:00Z") });
          const guide = await generateTaxGuideInTransaction(tx, actor, { assessmentId: assessment.id, dueDate: new Date("2026-11-20T12:00:00Z") });
          await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_TAX_CASE_POPULATED", entityType: "TaxAssessment", entityId: caseId, authorUsuarioId: user.id, payload: { dataset: systemDataset, fictional: true, source: "OWNER_AUTHORIZED_REFERENCE", assessmentId: assessment.id, guideId: guide.id, rateNature: "REFERENCE_PARAMETER", nativeServices: true, externalCollectionSent: false } });
          rows.push({ case: caseId, assessmentId: assessment.id, guideId: guide.id, reused: false });
        }
        if (!apply) throw rollback;
    }, { timeoutMs: 240000 });
  } catch (error) { if (error !== rollback) throw error; }
  return { mode: apply ? "APPLY" : "TRANSACTIONAL_PREVIEW_ROLLED_BACK", cases: rows.length, created: apply ? rows.filter(row => !row.reused).length : 0, reused: rows.filter(row => row.reused).length, arithmetic: "base de 80.000 a 146.500; parâmetro de referência 0,5%; principal de 400,00 a 732,50", externalCollectionSent: false };
}
async function main() {
  config({ path: ".env.local", quiet: true }); config({ quiet: true });
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  try { console.log(JSON.stringify(await seedMunicipalTaxCases(connection, process.argv.includes("--apply")), null, 2)); }
  finally { await connection.pool.end(); }
}
if (process.argv[1] && /(?:^|[\\/])seed-municipal-tax-cases\.ts$/.test(process.argv[1])) {
  main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga tributária."); process.exitCode = 1; });
}
