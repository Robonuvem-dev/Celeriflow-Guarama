// One physical PostgreSQL connection for BEGIN, advisory lock, SQL, receipts and
// COMMIT. Neon HTTP transactions cannot provide this interactive contract.
export async function openMigrationConnection(connectionString, driver = "neon") {
  const target = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("DATABASE_MIGRATION_URL must be a PostgreSQL URL");
  let Client;
  if (driver === "neon") {
    const neon = await import("@neondatabase/serverless");
    const { default: ws } = await import("ws");
    neon.neonConfig.webSocketConstructor = ws;
    Client = neon.Client;
  } else if (driver === "pg") {
    // Explicit TCP driver, installed as a direct project dependency. Never rely
    // on an ORM adapter's transitive dependencies for the migration authority.
    const pg = await import("pg");
    Client = pg.Client ?? pg.default.Client;
  } else throw new Error("DATABASE_MIGRATION_DRIVER must be neon or pg");
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, application_name: "celeriflow-explicit-sql-v1" });
  // Record socket errors without echoing driver messages (which may contain
  // connection details). A broken connection must not be reused/reconnected.
  let socketError = false;
  client.on("error", () => { socketError = true; });
  try { await client.connect(); }
  catch (error) { await client.end().catch(() => {}); throw error; }
  const query = (sql, parameters) => {
    if (socketError) throw new Error("Migration PostgreSQL connection is no longer usable");
    return client.query(sql, parameters);
  };
  return { query, exec: sql => query(sql), close: () => client.end() };
}
