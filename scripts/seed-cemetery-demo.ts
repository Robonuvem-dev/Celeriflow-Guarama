import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { taxpayers } from "../src/db/schema/registry";
import { cemeteries, cemeteryEmployees, cemeterySectors, cemeteryChapels, cemeteryOssuaries, cemeteryLots, cemeteryGraves, cemeteryFuneralHomes, cemeteryDeathCauses } from "../src/db/schema/cemeteries";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Conexão municipal não configurada.");
const connection = createDatabaseConnection(connectionString);

async function main() {
  try {
    if (!process.argv.includes("--apply")) { console.log("Prévia: estrutura sintética de Cemitérios, duas pessoas/contribuintes demonstrativos, capela, funerária, causa, ossuário e lotes. Não cria óbitos, usuários, permissões, taxas nem guias. Execute com --apply para persistir."); return; }
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('CEMETERY_DEMO_SEED'))`);
      const persons = [
        { id: "cemetery-demo-owner", fullName: "Antônio Carlos Batista", cpf: "00000000272" },
        { id: "cemetery-demo-person", fullName: "Maria Helena Batista", cpf: "00000000353" },
      ];
      for (const person of persons) {
        await tx.insert(people).values(person).onConflictDoNothing({ target: people.id });
        await tx.insert(taxpayers).values({ id: `${person.id}-taxpayer`, taxpayerType: "PF", personId: person.id, fiscalNotes: "DEMONSTRAÇÃO — cadastro sintético sem obrigação fiscal oficial." }).onConflictDoNothing({ target: taxpayers.id });
      }
      const ownerId = "cemetery-demo-owner-taxpayer";
      for (const suffix of ["a", "b"]) {
        const cemeteryId = `cemetery-demo-${suffix}`;
        const name = suffix === "a" ? "Cemitério Municipal Jardim da Paz" : "Cemitério Municipal Parque das Veredas";
        const address = suffix === "a" ? "Rua dos Cedros, 240, Jardim das Acácias" : "Avenida das Palmeiras, 680, Parque das Veredas";
        await tx.insert(cemeteries).values({ id: cemeteryId, code: `DEMO-CEM-${suffix.toUpperCase()}`, name, address, observations: "Estrutura sintética para homologação. Não representa instalação municipal real." }).onConflictDoNothing({ target: cemeteries.id });
        await tx.insert(cemeteryEmployees).values({ id: `${cemeteryId}-employee`, cemeteryId, name: suffix === "a" ? "José Roberto Santana" : "Paulo Sérgio Moreira", role: "Coveiro" }).onConflictDoNothing({ target: cemeteryEmployees.id });
        await tx.insert(cemeterySectors).values({ id: `${cemeteryId}-sector`, cemeteryId, code: "Q-01", name: "Quadra das Acácias" }).onConflictDoNothing({ target: cemeterySectors.id });
        await tx.insert(cemeteryChapels).values({ id: `${cemeteryId}-chapel`, cemeteryId, name: suffix === "a" ? "Capela São Miguel" : "Capela Nossa Senhora da Paz", personTaxpayerId: ownerId, responsibleTaxpayerId: ownerId, address }).onConflictDoNothing({ target: cemeteryChapels.id });
        await tx.insert(cemeteryOssuaries).values({ id: `${cemeteryId}-ossuary`, cemeteryId, code: "O-01", address, capacity: 10 }).onConflictDoNothing({ target: cemeteryOssuaries.id });
        for (const number of [1, 2]) {
          const lotId = `${cemeteryId}-lot-${number}`;
          await tx.insert(cemeteryLots).values({ id: lotId, cemeteryId, identifier: `DEMO-L${number}`, ownerTaxpayerId: ownerId, graveLimit: 3 }).onConflictDoNothing({ target: [cemeteryLots.cemeteryId, cemeteryLots.identifier] });
          await tx.insert(cemeteryGraves).values({ id: `${cemeteryId}-grave-${number}`, cemeteryId, lotId, code: `DEMO-S${number}`, graveType: number === 2 ? "GAVETA" : "COVA", capacity: 2, ownerTaxpayerId: ownerId }).onConflictDoNothing({ target: [cemeteryGraves.cemeteryId, cemeteryGraves.code] });
        }
      }
      await tx.insert(cemeteryFuneralHomes).values({ id: "cemetery-demo-funeral", name: "Serviço Funerário Municipal de Aurora das Veredas", ownershipType: "PUBLICA" }).onConflictDoNothing({ target: cemeteryFuneralHomes.id });
      await tx.insert(cemeteryDeathCauses).values({ id: "cemetery-demo-cause", code: "CAUSA-NAO-INFORMADA", description: "Causa não informada; depende de documentação do declarante." }).onConflictDoNothing({ target: cemeteryDeathCauses.id });
      return { mode: "DEMONSTRATION", cemeteries: 2, people: 2, lots: 4, graves: 4, realPermissionsGranted: false, deathsCreated: false, feesIssued: false };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(() => { console.error("Seed demonstrativo não concluído; verifique conexão e colisões dos identificadores sintéticos."); process.exitCode = 1; });
