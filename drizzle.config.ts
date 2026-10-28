import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.DRIZZLE_INTROSPECTION_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Configure DATABASE_URL antes de executar a introspecção.");

// Introspection is an untracked reference, not the authority for production DDL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/**/*.ts",
  out: "./.agent/drizzle/introspection",
  dbCredentials: { url },
  schemaFilter: ["public"],
  introspect: { casing: "preserve" },
  strict: true,
});
