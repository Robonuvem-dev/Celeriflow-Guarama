import assert from "node:assert/strict";
import { getPostgresError } from "../../src/db/errors";

/** Match the server error itself, never Drizzle's SQL/parameter wrapper. */
export function postgresError(code: string, message: string): (error: unknown) => boolean {
  return error => {
    assert.equal(getPostgresError(error)?.code, code, "PostgreSQL SQLSTATE");
    const seen = new Set<unknown>();
    let current = error;
    while (current && typeof current === "object" && !seen.has(current)) {
      seen.add(current);
      if ("code" in current && current.code === code) {
        assert.ok("message" in current, "PostgreSQL error must contain its server message");
        assert.equal(current.message, message);
        return true;
      }
      current = "cause" in current ? current.cause : null;
    }
    return false;
  };
}
