import { getPostgresError } from "../../src/db/errors";

/** Match the PostgreSQL cause without mistaking SQL text/bound values for a guard failure. */
export function financeDatabaseError(message: RegExp) {
  return (error: unknown) => {
    let current: unknown = error;
    const visited = new Set<unknown>();
    while (current instanceof Error && !visited.has(current)) {
      visited.add(current);
      if ("code" in current && current.code === getPostgresError(current)?.code && typeof current.code === "string" && message.test(current.message)) return true;
      current = current.cause;
    }
    return false;
  };
}
