import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { createTaxAssessmentInTransaction, generateTaxGuideInTransaction } from "../src/lib/tributacao";
import { key, systemDataset } from "./municipal-system-dataset";

config({ path: ".env.local", quiet: true }); config({ quiet: true }); neonConfig.webSocketConstructor = ws;
async function main() {
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }) });
  const apply = process.argv.includes("--apply"), rollback = new Error("PREVIEW_ROLLBACK");
  const rows: Array<{ case: string; assessmentId: string; guideId: string; reused: boolean }> = [];
  try {
    const user = await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } }, select: { id: true, employeeId: true } });
    const actor = { usuarioId: user.id, employeeId: user.employeeId };
    try {
      await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('AURORA_SYSTEM_TAX_CASES_V1'))`;
        for (let i = 0; i < 20; i++) {
          const caseId = key("tax-case", i);
          const prior = await tx.financialAuditLog.findFirst({ where: { action: "MUNICIPAL_TAX_CASE_POPULATED", entityId: caseId } });
          if (prior) {
            const data = prior.payload as { assessmentId: string; guideId: string };
            const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: data.assessmentId } });
            await tx.taxGuide.findUniqueOrThrow({ where: { id: data.guideId, assessmentId: data.assessmentId } });
            if (!assessment.realEstateId) {
              const property = await tx.realEstate.findUniqueOrThrow({ where: { id: key("property", i), taxpayerId: assessment.taxpayerId } });
              if (assessment.taxpayerId !== key("taxpayer", i) || !["Lançado", "Emitido"].includes(assessment.status)) throw new Error("Origem cadastral do caso foi alterada; preservar o registro do operador.");
              const linked = await tx.taxAssessment.update({ where: { id: assessment.id }, data: { realEstateId: property.id } });
              if (JSON.stringify(linked) !== JSON.stringify({ ...assessment, realEstateId: property.id, updatedAt: linked.updatedAt })) throw new Error("Vínculo cadastral alterou campos fora do escopo; transação revertida.");
              await tx.financialAuditLog.create({ data: { action: "MUNICIPAL_TAX_PROPERTY_LINKED", entityType: "TaxAssessment", entityId: assessment.id, authorUsuarioId: user.id, payload: { fictional: true, before: { realEstateId: null }, after: { realEstateId: property.id }, monetaryValuesPreserved: true, originalSnapshotsPreserved: true } } });
            } else if (assessment.realEstateId !== key("property", i)) throw new Error("Imóvel do caso alterado pelo operador; nenhuma substituição automática.");
            rows.push({ case: caseId, ...data, reused: true }); continue;
          }
          const assessment = await createTaxAssessmentInTransaction(tx, actor, { year: 2026, taxId: "tax_iptu", taxpayerId: key("taxpayer", i), realEstateId: key("property", i), taxableBase: 80000 + i * 3500, rate: "0.5", competence: new Date("2026-10-01T12:00:00Z") });
          const guide = await generateTaxGuideInTransaction(tx, actor, { assessmentId: assessment.id, dueDate: new Date("2026-11-20T12:00:00Z") });
          await tx.financialAuditLog.create({ data: { action: "MUNICIPAL_TAX_CASE_POPULATED", entityType: "TaxAssessment", entityId: caseId, authorUsuarioId: user.id, payload: { dataset: systemDataset, fictional: true, source: "OWNER_AUTHORIZED_REFERENCE", assessmentId: assessment.id, guideId: guide.id, rateNature: "REFERENCE_PARAMETER", nativeServices: true, externalCollectionSent: false } } });
          rows.push({ case: caseId, assessmentId: assessment.id, guideId: guide.id, reused: false });
        }
        if (!apply) throw rollback;
      }, { timeout: 240000 });
    } catch (error) { if (error !== rollback) throw error; }
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "TRANSACTIONAL_PREVIEW_ROLLED_BACK", cases: rows.length, created: apply ? rows.filter(row => !row.reused).length : 0, reused: rows.filter(row => row.reused).length, arithmetic: "base de 80.000 a 146.500; parâmetro de referência 0,5%; principal de 400,00 a 732,50", externalCollectionSent: false }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga tributária."); process.exitCode = 1; });
