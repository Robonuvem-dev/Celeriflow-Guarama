import { config } from "dotenv";
import { eq } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users } from "../src/db/schema/identity";
import { patients } from "../src/db/schema/health-registration";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";
import { healthCatalogRequired, lockHealthCatalogTool } from "./lib/health-catalog-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const key = "aurora-health-identifiers-2026-v1";
const decision = "Identificadores CNS sintéticos autorizados para os pacientes fictícios documentados das jornadas; dígito verificador local, sem consulta, inscrição ou confirmação CADSUS. Não são documentos oficiais de pessoas reais.";

function syntheticCns(index: number) {
  for (let offset = 0; offset < 10; offset++) {
    const base = `8980000000${String(index).padStart(3, "0")}${offset}`;
    const sum = [...base].reduce((total, digit, position) => total + Number(digit) * (15 - position), 0);
    const check = (11 - sum % 11) % 11;
    if (check < 10) return `${base}${check}`;
  }
  throw new Error("Não foi possível gerar identificador sintético local.");
}

export async function prepareAuroraHealthIdentifiers(connection: DatabaseConnection, apply: boolean) {
  const results = await withDatabaseTransaction(connection, async tx => {
    await lockHealthCatalogTool(tx, key);
    const actor = healthCatalogRequired((await tx.select({ id: users.id, ativo: users.ativo }).from(users).where(eq(users.email, "admin@email.com")).limit(1))[0], "Usuario");
    if (!actor.ativo) throw new Error("Administrador autorizado inativo.");
    const rows = [];
    for (let index = 1; index <= 3; index++) {
      const id = `aurora-shared-catalogs-2026-v1:patient:p1-poc-person-${index}`;
      const patient = healthCatalogRequired((await tx.select({ id: patients.id, personId: patients.personId, cns: patients.cns }).from(patients).where(eq(patients.id, id)).limit(1))[0], "Patient");
      if (patient.personId !== `p1-poc-person-${index}`) throw new Error("Paciente não corresponde à identidade fictícia documentada.");
      const cns = syntheticCns(index);
      if (cns.length !== 15 || [...cns].reduce((sum, digit, position) => sum + Number(digit) * (15 - position), 0) % 11) throw new Error("Checksum do identificador sintético divergente.");
      if (patient.cns && patient.cns !== cns) throw new Error("Paciente já possui CNS distinto; preservar o documento cadastrado.");
      const [other] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.cns, cns)).limit(1);
      if (other && other.id !== id) throw new Error("Identificador já utilizado por outra pessoa.");
      if (apply && !patient.cns) {
        await tx.update(patients).set({ cns }).where(eq(patients.id, id));
        await tx.insert(financialAuditLogs).values({ action: "PREPARE_SYNTHETIC_HEALTH_IDENTIFIER", entityType: "Patient", entityId: id, authorUsuarioId: actor.id, payload: { decision, configurationKey: key, identifierNature: "SYNTHETIC_NOT_CADSUS_VERIFIED", personId: patient.personId } });
      }
      rows.push({ patientId: id, replay: Boolean(patient.cns), identifierNature: "SYNTHETIC_NOT_CADSUS_VERIFIED" });
    }
    return rows;
  }, { timeoutMs: 30_000 });
  return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", decision, patients: results };
}

async function main() {
  const connection = openCrossDomainDatabase();
  try { console.log(JSON.stringify(await prepareAuroraHealthIdentifiers(connection, process.argv.includes("--apply")), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação de identificadores."); process.exitCode = 1; });
