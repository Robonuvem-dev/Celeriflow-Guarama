import { randomUUID } from "node:crypto";
import { Client } from "pg";

/** Only the disposable local server started by verify-planning-postgres.mjs is accepted. */
export async function createPlanningPostgresBackend(connectionString: string) {
  const url = new URL(connectionString);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/planning_s2") throw new Error("Os cenários PostgreSQL exigem o servidor local isolado planning_s2.");
  const schema = `planning_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return {
    schema,
    connectionString: url.toString(),
    exec: (sql: string) => client.query(sql),
    query: (sql: string, parameters?: unknown[]) => client.query(sql, parameters),
    close: async () => { try { await client.query(`DROP SCHEMA "${schema}" CASCADE`); } finally { await client.end(); } },
  };
}
