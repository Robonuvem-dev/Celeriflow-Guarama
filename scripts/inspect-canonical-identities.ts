import { config } from "dotenv";
import { readCanonicalIdentityIssues } from "../src/lib/cadastros/identity-integrity";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const findings = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return readCanonicalIdentityIssues(tx);
    }, { isolationLevel: "RepeatableRead", timeout: 60000 });
    const byType: Record<string, number> = {};
    for (const issue of findings) byType[issue.issueType] = (byType[issue.issueType] ?? 0) + 1;
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode: "DATABASE_READ_ONLY", preservation: "Transação READ ONLY; nenhum cadastro ou evidência histórica alterado.", byType, findings, conclusion: "Inspeção documental por registro; não substitui regressão nem aceite autenticado." }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => { console.error("Inspeção cadastral falhou:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[URL omitida]") : "ERRO"); process.exitCode = 1; });
