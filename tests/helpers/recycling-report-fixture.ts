import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";
import { withDatabaseTransaction } from "../../src/db/transaction";
import { saveRecyclingCatalogEntry } from "../../src/db/repositories/environment/recycling-catalog";
import { recordRecyclingMovement } from "../../src/db/repositories/environment/recycling-stock";
import { normalizeRecyclingMovementInput } from "../../src/lib/environment/recycling-stock";
import type { RecyclingEntry } from "../../src/lib/environment/recycling-catalog";

export async function createRecyclingReportFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    await fixture.database.exec(`
      CREATE TABLE "Usuario" (id text PRIMARY KEY); INSERT INTO "Usuario" VALUES ('actor');
      CREATE TABLE "ConfiguracaoInstancia" (id text PRIMARY KEY,"nomePrefeitura" text NOT NULL,cnpj text,municipio text NOT NULL,uf text NOT NULL,dominio text,status text DEFAULT 'Ativa',"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now());
      INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"createdAt") VALUES ('one','Prefeitura fixture','Município fixture','MG','2020-01-01'),('two','Outra instância','Outro município','MG','2021-01-01'),('paging','Paginação','Fixture','MG','2022-01-01');
      CREATE TABLE "ConfiguracaoParametroInstancia" (id text PRIMARY KEY,"configuracaoInstanciaId" text NOT NULL REFERENCES "ConfiguracaoInstancia"(id),chave text NOT NULL,valor jsonb NOT NULL,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now(),UNIQUE("configuracaoInstanciaId",chave));
      CREATE TABLE "AuditEvent" (id text PRIMARY KEY,"eventType" text NOT NULL,"targetType" text NOT NULL,"targetId" text NOT NULL,"actorUsuarioId" text NOT NULL REFERENCES "Usuario"(id),"createdAt" timestamp DEFAULT now());
    `);
    await fixture.database.exec(await readFile("db/migrations/20261101120000_cf10_recycling_stock/migration.sql", "utf8"));
    const values: [RecyclingEntry["kind"], string, string][] = [["types", "T1", "Recicláveis"], ["types", "T2", "Vidro"], ["units", "KG", "kg"], ["units", "L", "litro"], ["materials", "M1", "Zinco"], ["materials", "M2", "Alumínio"], ["depots", "D1", "Central"], ["depots", "D2", "Norte"], ["depots", "D0", "Vazio"], ["centers", "C1", "Centro"]];
    for (const instanceId of ["one", "two", "paging"]) await withDatabaseTransaction(fixture.connection, async tx => {
      for (const [kind, code, name] of values) await saveRecyclingCatalogEntry(tx, { instanceId, actorUsuarioId: "actor", mode: "create", entry: { kind, code, name: instanceId === "two" ? `PRIVADO ${name}` : name, active: true, address: "Rua fixture", description: "" } });
    });
    async function movement(overrides: Record<string, unknown>, instanceId = "one") {
      const input = normalizeRecyclingMovementInput({ kind: "ENTRY", materialCode: "M1", depotCode: "D1", typeCode: "T1", unitCode: "KG", quantity: "1", amount: "0", occurredOn: "2026-01-01", origin: "Coleta fixture", notes: "", idempotencyKey: randomUUID(), ...overrides }, new Date("2026-11-02T15:00:00Z"));
      return withDatabaseTransaction(fixture.connection, tx => recordRecyclingMovement(tx, instanceId, "actor", input));
    }
    await movement({ occurredOn: "2025-12-01", quantity: "10.125" });
    await movement({ occurredOn: "2026-01-01", quantity: "4" });
    await movement({ kind: "EXIT", occurredOn: "2026-01-31", quantity: "3.025", amount: "0.10", origin: "", destinationCode: "C1" });
    await movement({ depotCode: "D2", occurredOn: "2026-01-03", quantity: "2" });
    await movement({ kind: "EXIT", depotCode: "D2", occurredOn: "2026-03-01", quantity: "1", amount: "0.20", origin: "", destinationCode: "C1" });
    await movement({ materialCode: "M2", typeCode: "T2", unitCode: "L", occurredOn: "2026-01-10", quantity: "100.500" });
    await movement({ kind: "EXIT", materialCode: "M2", typeCode: "T2", unitCode: "L", occurredOn: "2026-03-31", quantity: "2.500", amount: "9007199254740993.01", origin: "", destinationCode: "C1" });
    await movement({ quantity: "999" }, "two");
    await movement({ kind: "EXIT", quantity: "1", amount: "100", origin: "", destinationCode: "C1" }, "two");
    return { ...fixture, movement };
  } catch (error) { await fixture.close(); throw error; }
}
