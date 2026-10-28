type Environment = Readonly<Record<string, string | undefined>>;
export type BootstrapTestTarget = { connectionString: string; databaseName: string };

function parseTarget(value: string, variable: string): { key: string; databaseName: string } {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`${variable} must be a PostgreSQL URL.`); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error(`${variable} must identify a PostgreSQL host and database.`);
  }
  // The driver may apply routing parameters over the URL components. Refuse
  // those overrides so destination comparison cannot inspect a different DB.
  for (const [name, parameter] of url.searchParams) {
    if (["host", "hostaddr", "port", "database", "dbname", "service", "servicefile", "connectionstring"].includes(name.toLowerCase())) {
      throw new Error(`${variable} must specify its destination in the URL, without routing overrides.`);
    }
    if (name.toLowerCase() === "schema" && parameter !== "public") throw new Error("Test bootstrap resets only the public schema.");
  }
  let databaseName: string;
  try { databaseName = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw new Error(`${variable} has an invalid database name.`); }
  if (!databaseName || databaseName.includes("\0")) throw new Error(`${variable} has an invalid database name.`);
  let hostname = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) hostname = "loopback";
  return { key: JSON.stringify([hostname, url.port || "5432", databaseName]), databaseName };
}

/** TEST_DATABASE_URL is mandatory even when its unpooled companion is present.
 * Runtime/DDL URLs are only compared to reject an alias, never selected. */
export function resolveBootstrapTestTarget(environment: Environment = process.env): BootstrapTestTarget {
  const pooled = environment.TEST_DATABASE_URL?.trim();
  if (!pooled) throw new Error("TEST_DATABASE_URL is required; refusing to reset or seed any other database.");
  const expected = parseTarget(pooled, "TEST_DATABASE_URL");
  const connectionString = environment.TEST_DATABASE_URL_UNPOOLED?.trim() || pooled;
  const selected = parseTarget(connectionString, "TEST_DATABASE_URL_UNPOOLED");
  if (selected.key !== expected.key) throw new Error("TEST_DATABASE_URL and TEST_DATABASE_URL_UNPOOLED must identify the same dedicated test database.");
  for (const variable of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATABASE_MIGRATION_URL"]) {
    const value = environment[variable]?.trim();
    if (value && parseTarget(value, variable).key === selected.key) {
      throw new Error(`Dedicated TEST_DATABASE_URL must differ from ${variable}.`);
    }
  }
  return { connectionString, databaseName: selected.databaseName };
}
