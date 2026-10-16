import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
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
export async function functionalSourceManifestIsCurrent(db: PrismaClient, raw: unknown) {
  const manifest = functionalSourceManifestSchema.parse(raw);
  for (const source of manifest.statements) {
    const statement = await db.hrPayrollStatement.findFirst({ where: { id: source.id, revokedAt: null, run: { status: "FECHADA", mode: "OFICIAL" } } });
    if (!statement || payrollSnapshotHash(statement) !== source.hash) return false;
  }
  for (const proof of manifest.proofs) if (!await db.documentVersion.findFirst({ where: { id: proof.id, hashSha256: proof.hash, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] } } }, select: { id: true } })) return false;
  for (const expected of manifest.payments) {
    const payment = await db.payment.findUnique({ where: { id: expected.id } });
    if (!payment || payment.status !== "Paga" || payment.date.toISOString() !== expected.date || (payment.netValueDecimal?.toString() || null) !== expected.net) return false;
  }
  for (const source of manifest.periods) {
    const [period] = await db.$queryRaw<unknown[]>`SELECT p.* FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=${source.id} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`;
    if (!period || hash(period) !== source.hash) return false;
  }
  for (const id of manifest.events) if (!await db.hrIntegrationEvent.findFirst({ where: { id, status: "PROCESSADO" }, select: { id: true } })) return false;
  for (const responsibility of manifest.responsibilities) {
    const [row] = await db.$queryRaw<{ effectiveEndsAt: Date }[]>`SELECT LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt")) AS "effectiveEndsAt" FROM "SstTechnicalResponsibility" r LEFT JOIN "SstFoundationalRevocation" v ON v."responsibilityId"=r.id WHERE r.id=${responsibility.id}`;
    if (!row || row.effectiveEndsAt.toISOString() !== responsibility.effectiveEndsAt) return false;
  }
  for (const source of manifest.groups) {
    const group = await db.sstProgramExposureGroup.findFirst({ where: { id: source.id, program: { version: source.version } }, select: { groupSnapshot: true, risks: true } });
    if (!group || hash({ group: group.groupSnapshot, risks: group.risks }) !== source.hash) return false;
  }
  if (manifest.margin) {
    const margin = manifest.margin;
    const current = await db.hrConsignmentEntry.aggregate({ where: { installment: { competenceAt: new Date(margin.competence), agreement: { scope: margin.scope, contract: { employeeId: margin.employeeId } } } }, _sum: { amount: true } });
    if ((current._sum.amount?.toString() || "0") !== margin.reserved) return false;
  }
  return true;
}
