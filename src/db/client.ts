import "server-only";
import { createDatabaseConnection, type DatabaseConnection } from "./connection";

const globalDatabase = globalThis as typeof globalThis & {
  celeriflowDatabase?: DatabaseConnection;
};

function connect(): DatabaseConnection {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  return createDatabaseConnection(connectionString);
}

export const databaseConnection = globalDatabase.celeriflowDatabase ?? connect();
export const db = databaseConnection.db;

if (process.env.NODE_ENV !== "production") globalDatabase.celeriflowDatabase = databaseConnection;
