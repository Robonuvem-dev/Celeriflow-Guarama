import { config } from "dotenv";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const prefix = "p0-current-";
const apply = process.argv.includes("--apply");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const [sources, revenues, expenses, accounts, actor] = await Promise.all([
      prisma.resourceSource.findMany({ where: { id: { startsWith: `${prefix}source-` } }, orderBy: { code: "asc" } }),
      prisma.revenueNature.findMany({ where: { id: { startsWith: `${prefix}revenue-` } }, orderBy: { code: "asc" } }),
      prisma.expenseNature.findMany({ where: { id: { startsWith: `${prefix}expense-` } }, orderBy: { code: "asc" } }),
      prisma.accountingPlan.findMany({ where: { id: { startsWith: `${prefix}account-` } }, orderBy: { code: "asc" } }),
      prisma.usuario.findFirst({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } }),
    ]);
    if (!actor || [sources, revenues, expenses, accounts].some((rows) => rows.length !== 21)) throw new Error("A carga P0 e o usuário autor devem estar presentes antes da proveniência P1.");
    const rows = [
      ...sources.map((row) => ({ kind: "SOURCE", canonicalId: row.id, code: row.code, name: row.name })),
      ...revenues.map((row) => ({ kind: "REVENUE", canonicalId: row.id, code: row.code, name: row.name })),
      ...expenses.map((row) => ({ kind: "EXPENSE", canonicalId: row.id, code: row.code, name: row.name })),
      ...accounts.map((row) => ({ kind: "ACCOUNT", canonicalId: row.id, code: row.code, name: row.name })),
    ];
    // Accounting accounts are documented in the evidence manifest; the planning
    // catalog registry accepts only its existing SOURCE/REVENUE/EXPENSE kinds.
    const planningRows = rows.filter((row) => row.kind !== "ACCOUNT");
    const versions = [];
    for (const year of [2024, 2025, 2026, 2027]) {
      const source = { nature: "SYNTHETIC_POC_ONLY", origin: "scripts/prepare-poc-p0-current.ts", year, effectiveFrom: `${year}-01-01`, effectiveUntil: `${year}-12-31`, rows };
      const sourceHash = createHash("sha256").update(JSON.stringify(source)).digest("hex");
      const id = `p1-poc-catalog-${year}`;
      if (apply) await prisma.$transaction(async (tx) => {
        const prior = await tx.planningCatalogVersion.findUnique({ where: { id }, include: { entries: true } });
        if (prior) {
          if (prior.sourceHash !== sourceHash || prior.status !== "DRAFT" || prior.entries.length !== planningRows.length) throw new Error(`Catálogo ${year} diverge da carga original; concilie a versão antes de continuar.`);
          return;
        }
        await tx.planningCatalogVersion.create({ data: {
          id, year, label: `POC P1 — classificações sintéticas ${year}`, normativeReference: "Ensaio P0/P1 autorizado; não constitui PCASP, TCE/STN ou classificação municipal oficial.", sourceHash, status: "DRAFT", createdById: actor.id,
          entries: { create: planningRows.map((row) => ({ ...row, degree: row.code.split(".").length, attributes: { synthetic: true, homologated: false, origin: source.origin, effectiveFrom: source.effectiveFrom, effectiveUntil: source.effectiveUntil, externalCode: null } as Prisma.InputJsonObject })) },
        } });
        await tx.financialAuditLog.create({ data: { action: "POC_P1_CATALOG_PROVENANCE", entityType: "PlanningCatalogVersion", entityId: id, authorUsuarioId: actor.id, payload: { sourceHash, year, count: rows.length, synthetic: true, homologated: false } } });
      });
      versions.push({ id, sourceHash, ...source });
    }
    const evidence = { generatedAt: new Date().toISOString(), mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versions, conclusion: "Origem e vigência de ensaio documentadas. As versões permanecem DRAFT e não homologam nem substituem catálogos oficiais." };
    if (apply) writeFileSync("docs/poc-p0/CLASSIFICACOES_ENSAIO_P1.json", `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ mode: evidence.mode, versions: versions.length, entriesPerVersion: planningRows.length, documentedAccountsPerYear: accounts.length, synthetic: true, homologated: false }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falha na proveniência P1."); process.exitCode = 1; });
