import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Conferência somente de leitura: não cadastra contas, não ativa perfis e não infere saldos.
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const [bankAccounts, mappings, profiles, catalogVersions, controlPlans] = await Promise.all([
      prisma.bankAccount.count(),
      prisma.taxFinancialMapping.count(),
      prisma.taxRegistryEntry.count({ where: { category: "ACCOUNTING_PROFILE", status: "ATIVO" } }),
      prisma.planningCatalogVersion.findMany({ where: { OR: [{ id: { startsWith: "p1-ibge-cnae-" } }, { id: { startsWith: "p1-mte-cbo-" } }, { id: "p1-tce-pr-account-2026-1.0d" }] }, select: { id: true, status: true } }),
      prisma.internalControlPlan.count(),
    ]);
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mode: "READ_ONLY", bankAccounts, taxFinancialMappings: mappings, activeTaxAccountingProfiles: profiles, catalogVersions, controlPlans, operationalDependencies: { bankConfigurationRequired: bankAccounts === 0, taxFinancialMappingRequired: mappings === 0, taxAccountingActivationRequired: profiles === 0 } }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência municipal."); process.exitCode = 1; });
