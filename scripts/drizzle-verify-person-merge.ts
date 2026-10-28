import assert from "node:assert/strict";
import { config } from "dotenv";
import { getPersonMergeCandidates, loadPersonMergePage } from "../src/db/repositories/registry/person-merge";
import type { MergeCandidatePerson } from "../src/lib/cadastros/person-merge-policy";
import { expectedMergeRanking } from "./sql-oracle-policies";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  const expectedCandidates = async (id: string) => {
    const records = await connection.rows<MergeCandidatePerson>('SELECT id,"fullName",cpf,"birthDate",email,"phonePrimary",status FROM "Person" WHERE status<>$1 LIMIT 250', ["Arquivado por mesclagem"]);
    const source = records.find(row => row.id === id);
    if (!source) throw new Error("Pessoa de origem não encontrada.");
    return expectedMergeRanking(source, records);
  };
  let comparisons = 0;
  try {
    const expected = { people: await connection.rows('SELECT id,"fullName",cpf FROM "Person" WHERE status<>$1 ORDER BY "fullName" ASC LIMIT 250', ["Arquivado por mesclagem"]), requests: await connection.rows(`SELECT r.id,r.status,json_build_object('fullName',s."fullName") AS "sourcePerson",json_build_object('fullName',t."fullName") AS "targetPerson",json_build_object('nome',u.nome) AS "proposedByUsuario" FROM "PersonMergeRequest" r JOIN "Person" s ON s.id=r."sourcePersonId" JOIN "Person" t ON t.id=r."targetPersonId" JOIN "Usuario" u ON u.id=r."proposedByUsuarioId" ORDER BY r."createdAt" DESC LIMIT 50`) };
    assert.deepEqual(await loadPersonMergePage(connection.db), expected); comparisons++;
    const sources = await connection.rows<{ id: string }>('SELECT id FROM "Person" WHERE status<>$1 LIMIT 250', ["Arquivado por mesclagem"]);
    for (const source of [...sources.slice(0, 5), ...sources.slice(-5)]) {
      assert.deepEqual(await getPersonMergeCandidates(connection.db, source.id), await expectedCandidates(source.id)); comparisons++;
    }
    await assert.rejects(getPersonMergeCandidates(connection.db, "absent-drizzle-person"), /origem não encontrada/);
    await assert.rejects(expectedCandidates("absent-drizzle-person"), /origem não encontrada/); comparisons++;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, scope: "Person merge page DTO/ordering and independent candidate rankings for ten sources plus absent identity" }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
