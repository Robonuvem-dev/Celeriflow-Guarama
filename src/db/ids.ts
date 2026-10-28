import cuid from "@bugsnag/cuid";

// Preserve the existing cuid v1 contracts, including z.string().cuid().
export function createId(): string {
  return cuid();
}
