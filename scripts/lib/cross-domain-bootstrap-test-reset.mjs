import { migrationLock, MigrationBlockedError } from "../database-migrate-core.mjs";
import { resolveBootstrapTestTarget } from "./cross-domain-bootstrap-test-target.ts";

const quotedRole = name => {
  if (typeof name !== "string" || !name || name.includes("\0")) throw new Error("Invalid role in test schema catalog.");
  return `"${name.replaceAll('"', '""')}"`;
};
const granteeSql = row => row.is_public ? "PUBLIC" : quotedRole(row.grantee);

/** The connection must have been opened from the explicit TEST target. Only
 * public is reset; server/database roles and schema ownership/grants survive.
 * Replay is a separate transaction owned by runDatabaseMigrations. */
export async function resetBootstrapTestSchema(connection, environment = process.env) {
  const target = resolveBootstrapTestTarget(environment);
  let began = false, committing = false;
  try {
    await connection.exec("BEGIN");
    began = true;
    await connection.query("SELECT set_config('statement_timeout','300000',true),set_config('lock_timeout','10000',true),set_config('search_path','public, pg_catalog',true)");
    const [database] = (await connection.query("SELECT current_database() AS name")).rows;
    if (database?.name !== target.databaseName) throw new Error("Connected database differs from the explicit TEST_DATABASE_URL.");
    const [lock] = (await connection.query("SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS acquired", migrationLock)).rows;
    if (!lock?.acquired) throw new Error("Another SQL migration/bootstrap holds the database lock.");
    // CASCADE cannot be allowed to remove dependants from another user schema.
    // The SQL executor also requires an empty, public-only database for replay.
    const outside = (await connection.query(`SELECT 'schema' AS kind,nspname AS name FROM pg_namespace
      WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_'
      UNION ALL SELECT 'extension',extname FROM pg_extension WHERE extname <> 'plpgsql'`)).rows;
    if (outside.length) throw new Error("Dedicated test reset requires public-only application objects and no additional extensions.");
    const [schema] = (await connection.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='public'")).rows;
    const permissions = (await connection.query(`SELECT a.grantee=0 AS is_public,pg_get_userbyid(a.grantee) AS grantee,a.privilege_type,a.is_grantable
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public'`)).rows;
    await connection.exec("DROP SCHEMA IF EXISTS public CASCADE");
    await connection.exec(schema ? `CREATE SCHEMA public AUTHORIZATION ${quotedRole(schema.owner)}` : "CREATE SCHEMA public");
    if (schema) {
      const createdPermissions = (await connection.query(`SELECT DISTINCT a.grantee=0 AS is_public,pg_get_userbyid(a.grantee) AS grantee
        FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public'`)).rows;
      await connection.exec("REVOKE ALL ON SCHEMA public FROM PUBLIC");
      for (const permission of createdPermissions) await connection.exec(`REVOKE ALL ON SCHEMA public FROM ${granteeSql(permission)}`);
      for (const permission of permissions) {
        if (!["USAGE", "CREATE"].includes(permission.privilege_type)) throw new Error("Unknown schema privilege in test catalog.");
        await connection.exec(`GRANT ${permission.privilege_type} ON SCHEMA public TO ${granteeSql(permission)}${permission.is_grantable ? " WITH GRANT OPTION" : ""}`);
      }
    }
    committing = true;
    await connection.exec("COMMIT");
    began = false;
  } catch (error) {
    if (began) {
      try { await connection.exec("ROLLBACK"); }
      catch { throw new MigrationBlockedError("Connection lost during test schema reset/rollback; inspect the dedicated test database before retrying", { result: "OUTCOME_UNKNOWN" }); }
    }
    if (committing) throw new MigrationBlockedError("Test schema reset COMMIT was not acknowledged; inspect the dedicated test database before retrying", { result: "OUTCOME_UNKNOWN" });
    throw error;
  }
}
