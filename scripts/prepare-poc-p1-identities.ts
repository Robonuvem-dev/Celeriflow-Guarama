import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { cadastroPeople } from "./plausible-cadastro-data";
import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { openCrossDomainDatabase, queryRows } from "./lib/cross-domain-database";
import { firstActiveP1Actor } from "./lib/cross-domain-p1-catalogs";

export function p1SyntheticCpf(index: number) {
  let digits = String(980000000 + index);
  for (const weight of [10, 11]) {
    const sum = [...digits].reduce((total, digit, position) => total + Number(digit) * (weight - position), 0);
    const remainder = sum % 11;
    digits += remainder < 2 ? "0" : String(11 - remainder);
  }
  return digits;
}

type P1Taxpayer = { taxpayerType: string; companyId: string | null; personId: string | null };
function assertP1Taxpayer(taxpayer: P1Taxpayer | undefined, index: number, personId: string): void {
  if (!taxpayer || taxpayer.taxpayerType !== "PF" || taxpayer.companyId || (taxpayer.personId && taxpayer.personId !== personId)) throw new Error(`Contribuinte de ensaio ${index} diverge do vínculo esperado.`);
}

/** These are registry identities only: no Auth/Firebase or RBAC mutation. Each
 * chain commits independently, as in the original 21 per-taxpayer transactions. */
export async function prepareP1IdentityLinks(connection: DatabaseConnection, apply: boolean) {
  const { db } = connection;
  const actor = await firstActiveP1Actor(db);
  const links = [];
  for (let index = 1; index <= 21; index++) {
    const ids = { taxpayerId: `p0-current-taxpayer-${index}`, personId: `p1-poc-person-${index}`, supplierId: `p1-poc-supplier-${index}`, creditorId: `p1-poc-creditor-${index}` };
    const [taxpayer] = await queryRows<P1Taxpayer>(db, sql`SELECT "taxpayerType","companyId","personId" FROM "Taxpayer" WHERE id=${ids.taxpayerId}`);
    assertP1Taxpayer(taxpayer, index, ids.personId);
    if (apply) await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ids.taxpayerId}, 0))::text`);
      const [locked] = await queryRows<P1Taxpayer>(tx, sql`SELECT "taxpayerType","companyId","personId" FROM "Taxpayer" WHERE id=${ids.taxpayerId} FOR UPDATE`);
      assertP1Taxpayer(locked, index, ids.personId);
      const cpf = p1SyntheticCpf(index);
      const [existingPerson] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "Person" WHERE cpf=${cpf}`);
      if (existingPerson && existingPerson.id !== ids.personId) throw new Error("Documento sintético já utilizado por outra identidade; nenhuma mesclagem automática executada.");
      const contact = cadastroPeople[index - 1];
      await tx.execute(sql`INSERT INTO "Person" (id,cpf,"fullName",email,"phonePrimary",status,"updatedAt") VALUES (${ids.personId},${cpf},${contact.name},${contact.email},${contact.phone},${"Ativo"},CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`);
      await tx.execute(sql`UPDATE "Taxpayer" SET "personId"=${ids.personId},"updatedAt"=CURRENT_TIMESTAMP WHERE id=${ids.taxpayerId}`);
      const [supplier] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "Supplier" WHERE "personId"=${ids.personId}`);
      if (supplier && supplier.id !== ids.supplierId) throw new Error("Identidade de ensaio vinculada a fornecedor inesperado.");
      await tx.execute(sql`INSERT INTO "Supplier" (id,"personId",status,notes,"updatedAt") VALUES (${ids.supplierId},${ids.personId},${"Ativo"},${"POC P1: pessoa e documento fictícios; uso exclusivo em ensaio."},CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`);
      const [creditor] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "Creditor" WHERE "personId"=${ids.personId}`);
      if (creditor && creditor.id !== ids.creditorId) throw new Error("Identidade de ensaio vinculada a credor inesperado.");
      await tx.execute(sql`INSERT INTO "Creditor" (id,"personId","supplierId",name,document,status,"updatedAt") VALUES (${ids.creditorId},${ids.personId},${ids.supplierId},${contact.name},${cpf},${"Ativo"},CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`);
      const [marker] = await queryRows<{ id: string }>(tx, sql`SELECT id FROM "FinancialAuditLog" WHERE action=${"POC_P1_IDENTITY_LINK"} AND "entityId"=${ids.taxpayerId} LIMIT 1`);
      if (!marker) await tx.insert(financialAuditLogs).values({ action: "POC_P1_IDENTITY_LINK", entityType: "Taxpayer", entityId: ids.taxpayerId, authorUsuarioId: actor.id, payload: { ...ids, synthetic: true, source: "POC_P0_CURRENT_V1", taxpayerIdPreserved: true } });
    }, { timeoutMs: 5_000, lockTimeoutMs: 5_000 });
    links.push(ids);
  }
  return { generatedAt: new Date().toISOString(), mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", nature: "FICTITIOUS_POC_ONLY", documentGeneration: "Deterministic synthetic CPF with checksum, prefix 980000; not verified against any official taxpayer registry.", links, conclusion: "IDs dos contribuintes, imóveis e inscrições preservados; PF compartilhada por contribuinte, fornecedor e credor de ensaio." };
}

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const apply = process.argv.includes("--apply");
  const connection = openCrossDomainDatabase(2_000);
  try {
    const evidence = await prepareP1IdentityLinks(connection, apply);
    if (apply) writeFileSync("docs/poc-p0/IDENTIDADES_ENSAIO_P1.json", `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ mode: evidence.mode, canonicalIdentityChains: evidence.links.length, synthetic: true }, null, 2));
  } finally { await connection.pool.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prepare-poc-p1-identities.ts")) {
  void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[URL omitida]") : "Falha nas identidades de ensaio P1."); process.exitCode = 1; });
}
