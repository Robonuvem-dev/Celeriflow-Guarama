export type DatabaseErrorCode = "unique" | "foreign-key" | "not-null" | "check" | "serialization" | "deadlock" | "timeout" | "not-found";

export class PersistenceError extends Error {
  constructor(
    readonly kind: DatabaseErrorCode,
    message: string,
    readonly constraint?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PersistenceError";
  }
}

const codes: Readonly<Record<string, DatabaseErrorCode>> = {
  "23505": "unique", "23503": "foreign-key", "23001": "foreign-key", "23502": "not-null", "23514": "check",
  "40001": "serialization", "40P01": "deadlock", "57014": "timeout", "25P03": "timeout", "25P04": "timeout", "55P03": "timeout",
};

export function getPostgresError(error: unknown): { code: string; constraint?: string } | null {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) {
      return { code: current.code, constraint: "constraint" in current && typeof current.constraint === "string" ? current.constraint : undefined };
    }
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

export function translateDatabaseError(error: unknown): unknown {
  if (error instanceof PersistenceError) return error;
  const postgres = getPostgresError(error);
  const kind = postgres && codes[postgres.code];
  if (!postgres || !kind) return error;
  // SQL and bound parameter values are retained only in the server-side cause.
  return new PersistenceError(kind, "Não foi possível concluir a operação no banco de dados.", postgres.constraint, { cause: error });
}
