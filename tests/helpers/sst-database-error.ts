/** Match the actual PostgreSQL rejection, never SQL text or bound values in a query wrapper. */
export function sstDatabaseError(code: string, message: RegExp) {
  return (error: unknown): boolean => {
    const visited = new Set<unknown>();
    let current = error;
    while (current instanceof Error && !visited.has(current)) {
      visited.add(current);
      if ("code" in current && current.code === code && message.test(current.message)) return true;
      current = current.cause;
    }
    return false;
  };
}
