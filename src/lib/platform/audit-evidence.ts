export { auditEventTypes } from "@/lib/contracts/audit";
export type { AuditEventType, AuditEventInput } from "@/lib/contracts/audit";

// Keep the public platform entrypoint on the same executor as its caller.
// The shared writer persists only stable identifiers and never acquires a pool.
export { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
