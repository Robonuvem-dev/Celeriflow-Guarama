import "server-only";
import { createDatabaseConnection, type Database, type DatabaseConnection } from "./connection";

const globalDatabase = globalThis as typeof globalThis & {
  celeriflowDatabase?: DatabaseConnection;
};

let connection: DatabaseConnection | undefined;

function getConnection(): DatabaseConnection {
  if (connection) return connection;
  if (globalDatabase.celeriflowDatabase) {
    connection = globalDatabase.celeriflowDatabase;
    return connection;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  connection = createDatabaseConnection(connectionString);
  if (process.env.NODE_ENV !== "production") globalDatabase.celeriflowDatabase = connection;
  return connection;
}

// Permission helpers and other pure consumers can import the platform without
// configuring a database. Resolve the single real Drizzle client on first use,
// retaining its receiver for methods such as select/execute/transaction.
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const database = getConnection().db;
    const value: unknown = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export const databaseConnection: DatabaseConnection = {
  db,
  get pool() { return getConnection().pool; },
};
