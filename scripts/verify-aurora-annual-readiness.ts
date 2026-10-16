import assert from "node:assert/strict";
import { config } from "dotenv";
import { inspectAnnualConsistency } from "../src/lib/financeiro/annual-consistency";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
    assert.ok(admin.ativo && admin.employeeId && admin.perfil.codigo === "SYSTEM_ADMINISTRATOR", "Responsável autorizado não disponível.");
    const evidence = [];
    for (const suffix of ["exe", "leg"]) {
      const governmentEntityId = `p0-current-${suffix}`;
      const year = await prisma.financialYear.findUniqueOrThrow({ where: { governmentEntityId_year: { governmentEntityId, year: 2026 } } });
      const report = await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        return inspectAnnualConsistency(tx, {}, year.id);
      }, { isolationLevel: "RepeatableRead", timeout: 120000 });
      assert.equal(report.governmentEntityId, governmentEntityId);
      assert.equal(report.fullEntity, true);
      await assert.rejects(prisma.$transaction(tx => inspectAnnualConsistency(tx, { allowedBudgetUnitIds: [`${governmentEntityId}-ug-1`] }, year.id)), /todas as UGs/);
      const issuesByCode: Record<string, number> = {};
      for (const issue of report.issues) issuesByCode[issue.code] = (issuesByCode[issue.code] ?? 0) + 1;
      evidence.push({ governmentEntityId, financialYearId: year.id, year: year.year, status: report.status, generatedAt: report.generatedAt, counts: report.counts, issuesByCode, partialOperatorRejected: true, reportPersisted: false, accountingFactsCreated: false });
    }
    console.log(JSON.stringify({ mode: "READ_ONLY", evidence }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência anual de leitura."); process.exitCode = 1; });
