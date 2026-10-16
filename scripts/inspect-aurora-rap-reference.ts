import { config } from "dotenv";
import { Prisma } from "@prisma/client";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const source = await prisma.planningCatalogVersion.findUniqueOrThrow({ where: { id: "p1-tce-pr-account-2026-1.0d" } });
    const entries = await prisma.planningCatalogEntry.findMany({ where: { versionId: source.id, kind: "ACCOUNT", code: { startsWith: "6.3." }, attributes: { path: ["postingAllowed"], equals: true } }, orderBy: { code: "asc" } });
    console.log(JSON.stringify({ sourceHash: source.sourceHash, accounts: entries.map(entry => ({ id: entry.id, code: entry.code, name: entry.name, degree: entry.degree, attributes: entry.attributes as Prisma.JsonObject })) }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
