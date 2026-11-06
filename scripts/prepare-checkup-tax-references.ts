/** Auxiliary presentation catalogs only: canonical versioning/audit, preview rollback by default. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import { listFiscalPlanningUnits } from "../src/db/repositories/taxation-pages/lookups";
import { saveTaxReference } from "../src/lib/tributacao/reference-catalog-service";
import type { TaxReferenceKind } from "../src/lib/tributacao/reference-catalog";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_REFERENCIAS_FISCAIS_2026_V1";
const apply = process.argv.includes("--apply");
const rollback = new Error("CHECKUP_PREVIEW_ROLLBACK");
function entityId(kind: string, code: string) {
  const hash = createHash("sha256").update(`${packageId}:${kind}:${code}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
async function main() {
  const connection = databaseConnection;
  const report = { packageId, mode: apply ? "APPLIED" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), origin: {} as Record<string, string>, changes: [] as { kind: string; code: string; id: string; name: string }[] };
  try {
    const [actor] = (await connection.db.execute<{ firebaseUid: string }>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id='cmvba36v700007kqmdslbwhkk' AND ativo`)).rows;
    assert.ok(actor?.firebaseUid);
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity?.ativo && identity.perfil.codigo === "SYSTEM_ADMINISTRATOR");
    try {
      await withDatabaseTransaction(connection, async tx => inDatabaseTransactionScope(connection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        const units = await listFiscalPlanningUnits(tx);
        const origin = units.filter(unit => unit.governmentEntityId === "p0-current-exe").sort((left, right) => left.budgetUnitId.localeCompare(right.budgetUnitId))[0];
        assert.ok(origin, "Origem fiscal municipal não encontrada.");
        report.origin = { governmentEntityId: origin.governmentEntityId, budgetUnitId: origin.budgetUnitId, name: origin.governmentEntity.name };
        const samples: { kind: TaxReferenceKind; code: string; name: string; procedureType?: string }[] = [
          { kind: "atividade", code: "ATV-001", name: "Suporte técnico e manutenção de sistemas" },
          { kind: "atividade", code: "ATV-002", name: "Assessoria e apoio administrativo" },
          { kind: "procedimento-fiscal", code: "CAD-001", name: "Conferência cadastral da atividade econômica", procedureType: "Revisão cadastral" },
          { kind: "procedimento-fiscal", code: "CAD-002", name: "Orientação para atualização da inscrição municipal", procedureType: "Orientação cadastral" },
          { kind: "evento-contabil", code: "EVT-001", name: "Conferência da receita de serviços" },
          { kind: "evento-contabil", code: "EVT-002", name: "Conciliação da classificação da receita" },
          { kind: "codigo-tributacao-desif", code: "CTD-001", name: "Atendimento e apoio administrativo" },
          { kind: "codigo-tributacao-desif", code: "CTD-002", name: "Processamento e organização de informações" },
          { kind: "codigo-tributacao-municipal", code: "CTM-001", name: "Serviços de apoio à gestão administrativa" },
          { kind: "codigo-tributacao-municipal", code: "CTM-002", name: "Serviços de suporte em tecnologia da informação" },
        ];
        for (const sample of samples) {
          const id = entityId(sample.kind, sample.code);
          const existing = (await tx.execute<{ entityId: string }>(sql`SELECT e."entityId" FROM "TaxRegistryEntry" e WHERE e."entityType"='TAX_REFERENCE' AND e.category='TAX_REFERENCE' AND e.data->>'budgetUnitId'=${origin.budgetUnitId} AND e.data->>'kind'=${sample.kind} AND e.data->>'code'=${sample.code} ORDER BY e.version DESC LIMIT 1`)).rows;
          if (existing.length) continue;
          const saved = await saveTaxReference(connection, { usuarioId: identity.id, employeeId: identity.employee?.id ?? null }, { ...sample, budgetUnitId: origin.budgetUnitId, governmentEntityId: origin.governmentEntityId, details: "Referência auxiliar do ambiente municipal fictício, para apresentação do catálogo. Sem regra de cálculo, alíquota, lançamento ou integração contábil automática." }, 0, id);
          report.changes.push({ ...sample, id: saved });
        }
        if (!apply) throw rollback;
      }));
    } catch (error) { if (error !== rollback) throw error; }
    mkdirSync("docs/checkup/demonstration-data", { recursive: true });
    writeFileSync(`docs/checkup/demonstration-data/tax-references-${apply ? "applied" : "preview"}-${Date.now()}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
