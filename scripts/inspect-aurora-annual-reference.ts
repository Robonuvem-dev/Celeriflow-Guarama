import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const version = await prisma.planningCatalogVersion.findUniqueOrThrow({ where: { id: "p1-tce-pr-account-2026-1.0d" } });
    const entries = await prisma.planningCatalogEntry.findMany({ where: { versionId: version.id, kind: "ACCOUNT", OR: ["6.2.2.1", "8.2.1", "5.3"].map(prefix => ({ code: { startsWith: prefix } })), attributes: { path: ["postingAllowed"], equals: true } }, orderBy: { code: "asc" }, select: { code: true, name: true } });
    console.log(JSON.stringify({ sourceHash: version.sourceHash, accounts: entries }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
