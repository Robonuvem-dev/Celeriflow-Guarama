import { z } from "zod";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { portalFirst } from "@/db/repositories/portal-servidor/records";
import { portalStatements } from "@/db/repositories/portal-servidor/payroll";
import type { JsonValue } from "@/db/json";
import { createHash } from "node:crypto";
import { payrollSnapshotHash } from "./payroll-publication";
const hash = (value: unknown) => { const order = (item: unknown): unknown => Array.isArray(item) ? item.map(order) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, order(child)])) : item; return createHash("sha256").update(JSON.stringify(order(JSON.parse(JSON.stringify(value))))).digest("hex"); };
export const functionalSourceManifestSchema = z.object({ statements: z.array(z.object({ id: z.string(), hash: z.string() })), proofs: z.array(z.object({ id: z.string(), hash: z.string() })), payments: z.array(z.object({ id: z.string(), date: z.string(), status: z.string(), net: z.string().nullable() })), periods: z.array(z.object({ id: z.string(), hash: z.string() })), events: z.array(z.string()), groups: z.array(z.object({ id: z.string(), version: z.number(), hash: z.string() })), responsibilities: z.array(z.object({ id: z.string(), effectiveEndsAt: z.string() })).default([]), margin: z.object({ employeeId: z.string(), scope: z.string(), competence: z.string(), reserved: z.string() }).optional() });
export function makeFunctionalSourceManifest(snapshot: unknown) {
  const manifest: z.infer<typeof functionalSourceManifestSchema> = { statements: [], proofs: [], payments: [], periods: [], events: [], groups: [], responsibilities: [] };
  const visit = (raw: unknown) => {
    if (Array.isArray(raw)) { raw.forEach(visit); return; }
    if (!raw || typeof raw !== "object") return;
    const value = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    if (typeof value.statementId === "string" && typeof value.statementHash === "string") manifest.statements.push({ id: value.statementId, hash: value.statementHash });
    if (typeof value.proofVersionId === "string" && typeof value.proofHash === "string") manifest.proofs.push({ id: value.proofVersionId, hash: value.proofHash });
    if (typeof value.sourceEventId === "string") manifest.events.push(value.sourceEventId);
    if (typeof value.technicalSourceId === "string") manifest.events.push(value.technicalSourceId);
    if (typeof value.finalitySourceId === "string") manifest.events.push(value.finalitySourceId);
    if (Array.isArray(value.periods)) for (const period of value.periods as { id: string }[]) manifest.periods.push({ id: period.id, hash: hash(period) });
    if (Array.isArray(value.payments)) for (const payment of value.payments as { id: string; date: string; status: string; net: string | null }[]) manifest.payments.push(payment);
    if (Array.isArray(value.responsibilities)) for (const responsibility of value.responsibilities as { id: string; effectiveEndsAt: string }[]) manifest.responsibilities.push({ id: responsibility.id, effectiveEndsAt: responsibility.effectiveEndsAt });
    if (Array.isArray(value.exposures)) for (const exposure of value.exposures as { programGroupId: string; version: number; group: unknown; risks: unknown }[]) manifest.groups.push({ id: exposure.programGroupId, version: exposure.version, hash: hash({ group: exposure.group, risks: exposure.risks }) });
    if (value.margin && typeof value.employeeId === "string" && typeof value.scope === "string" && typeof value.nextCompetence === "string" && typeof value.reserved === "string") manifest.margin = { employeeId: value.employeeId, scope: value.scope, competence: value.nextCompetence, reserved: value.reserved };
    Object.values(value).forEach(visit);
  };
  visit(snapshot);
  return manifest;
}
export async function functionalSourceManifestIsCurrent(db: DatabaseExecutor, raw: unknown) {
  const manifest = functionalSourceManifestSchema.parse(raw);
  for (const source of manifest.statements) {
    const statement = (await portalStatements(db, sql`s.id=${source.id} AND s."revokedAt" IS NULL AND r.status='FECHADA' AND r.mode='OFICIAL'`))[0];
    if (!statement || payrollSnapshotHash(statement) !== source.hash) return false;
  }
  for (const proof of manifest.proofs) if (!await portalFirst<{ id: string }>(db, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${proof.id} AND v."hashSha256"=${proof.hash} AND v.status IN ('FINAL','SIGNED') AND d.status IN ('Válido','Assinado') LIMIT 1`)) return false;
  for (const expected of manifest.payments) {
    const payment = await portalFirst<{ status: string; date: Date; netValueDecimal: string | null }>(db, sql`SELECT status,date,"netValueDecimal" FROM "Payment" WHERE id=${expected.id}`);
    if (!payment || payment.status !== "Paga" || payment.date.toISOString() !== expected.date || (payment.netValueDecimal === null ? null : new Decimal(payment.netValueDecimal).toString()) !== expected.net) return false;
  }
  for (const source of manifest.periods) {
    const period = await portalFirst<Record<string, unknown>>(db, sql`SELECT p.* FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=${source.id} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`);
    if (!period || hash(period) !== source.hash) return false;
  }
  for (const id of manifest.events) if (!await portalFirst<{ id: string }>(db, sql`SELECT id FROM "HrIntegrationEvent" WHERE id=${id} AND status='PROCESSADO'`)) return false;
  for (const responsibility of manifest.responsibilities) {
    const row = await portalFirst<{ effectiveEndsAt: Date }>(db, sql`SELECT LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt")) AS "effectiveEndsAt" FROM "SstTechnicalResponsibility" r LEFT JOIN "SstFoundationalRevocation" v ON v."responsibilityId"=r.id WHERE r.id=${responsibility.id}`);
    if (!row || row.effectiveEndsAt.toISOString() !== responsibility.effectiveEndsAt) return false;
  }
  for (const source of manifest.groups) {
    const group = await portalFirst<{ groupSnapshot: JsonValue; risks: JsonValue }>(db, sql`SELECT g."groupSnapshot",g.risks FROM "SstProgramExposureGroup" g JOIN "SstOccupationalProgram" p ON p.id=g."programId" WHERE g.id=${source.id} AND p.version=${source.version} LIMIT 1`);
    if (!group || hash({ group: group.groupSnapshot, risks: group.risks }) !== source.hash) return false;
  }
  if (manifest.margin) {
    const margin = manifest.margin;
    const current = await portalFirst<{ amount: string | null }>(db, sql`SELECT sum(e.amount) AS amount FROM "HrConsignmentEntry" e JOIN "HrConsignmentInstallment" i ON i.id=e."installmentId" JOIN "HrConsignmentAgreement" a ON a.id=i."agreementId" JOIN "HrEmploymentContract" c ON c.id=a."contractId" WHERE i."competenceAt"=${new Date(margin.competence)} AND a.scope=${margin.scope} AND c."employeeId"=${margin.employeeId}`);
    if (new Decimal(current?.amount || "0").toString() !== margin.reserved) return false;
  }
  return true;
}
