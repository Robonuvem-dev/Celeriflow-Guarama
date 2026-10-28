import { randomUUID } from "node:crypto";
import type { AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { eq, and, sql } from "drizzle-orm";
import { sstCatEvidence } from "@/db/schema/sst-accidents";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { findSstEmployee } from "@/db/repositories/sst/scope";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { sstContextConnection, sstDatabase } from "./database";
import { readCat, assertAccidentOperation, assertAccidentPhysician, accidentHash } from "./accident-service";
import { assertDisciplineAccess } from "./clinical-access";
import { assertRetry } from "./accident-policy";
import { catLayoutInput, catLayoutProvenance, validateCatLayoutFields } from "./accident-layout-policy";
import { SstValidationError } from "./errors";

export type CatLayoutRow = { id: string; catId: string; version: number; mode: "DRAFT" | "COMPLETE"; layoutVersion: string; templateSha256: string; fields: Record<string,string>; canonicalSnapshot: Record<string,unknown>; originalReceipt: string | null; requestHash: string; createdById: string; createdAt: Date };
export async function readLatestCatLayout(context: AppContext, catId: string, clinical = false) {
  const cat = await readCat(context, catId);
  if (clinical) await assertDisciplineAccess(context, cat.budgetUnitId, "MEDICINE");
  const [wire] = await sstRows<Omit<CatLayoutRow, "createdAt"> & { createdAt: string }>(sstDatabase(context), sql`SELECT * FROM "SstCatLayoutVersion" WHERE "catId"=${catId} ORDER BY "version" DESC LIMIT 1`);
  if (!wire) return null;
  const layout: CatLayoutRow = { ...wire, createdAt: sstTimestamp(wire.createdAt) };
  const medical = clinical ? (await sstRows<{ fields: Record<string,string>; medicalEvidenceId: string }>(sstDatabase(context), sql`SELECT "fields","medicalEvidenceId" FROM "SstCatLayoutMedical" WHERE "layoutVersionId"=${layout.id}`))[0] || null : null;
  if (clinical) await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CAT_LAYOUT_CLINICAL_READ", targetId: layout.id });
  return { layout, medical };
}
export async function catLayoutCanonicalDefaults(context: AppContext, catId: string, database: DatabaseExecutor = sstDatabase(context)) {
  const cat = await readCat(context, catId, database);
  const employee = await findSstEmployee(database, cat.employeeId);
  if (!employee) throw new SstValidationError("Servidor não encontrado.");
  const person = employee.person;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(cat.occurredAt);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(cat.occurredAt);
  const fields: Record<string,string> = { employeeName: cat.snapshot.employeeName || employee.name, accidentDate: date, accidentTime: time, accidentType: cat.kind, catType: String(cat.data.generatingStatus || "INITIAL"), accidentLocation: String(cat.data.location || ""), bodyParts: Array.isArray(cat.data.bodyParts) ? cat.data.bodyParts.join("; ") : "", agent: String(cat.data.agent || "") };
  // The snapshot of identity/lotation is canonical; employer and fiscal facts are not guessed.
  if (person?.motherName) fields.motherName = person.motherName;
  if (person?.birthDate) fields.birthDate = person.birthDate.toISOString().slice(0,10);
  if (person?.educationLevel) fields.education = person.educationLevel;
  if (person?.rg) fields.identity = `${person.rg}${person.rgIssuer ? ` / ${person.rgIssuer}` : ""}`;
  if (person?.phonePrimary || employee.phone) fields.employeePhone = person?.phonePrimary || employee.phone!;
  return { fields, snapshot: { personId: person?.id || null, cpf: person?.cpf || employee.cpf, employeeId: employee.id, registration: cat.snapshot.registration, budgetUnitId: cat.budgetUnitId, recordedBy: context.user.id } };
}
export async function saveCatLayout(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertAccidentOperation(context);
  const input = catLayoutInput.parse(raw), cat = await readCat(context, input.catId);
  if (cat.kind === "INCIDENT") throw new SstValidationError("Incidente sem CAT não usa o formulário INSS.");
  if (input.medicalEvidenceId) await assertDisciplineAccess(context, cat.budgetUnitId, "MEDICINE", true);
  if (input.mode === "COMPLETE" && !input.medicalEvidenceId) throw new SstValidationError("Formulário completo exige atendimento médico ocupacional vinculado.");
  const suppliedFields = validateCatLayoutFields(input.fields, false);
  const requestHash = accidentHash({ ...input, fields: suppliedFields });
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT "id" FROM "SstCat" WHERE "id"=${cat.id} FOR UPDATE`);
    const [old] = await sstRows<{ requestHash: string; createdById: string }>(tx, sql`SELECT "requestHash","createdById" FROM "SstCatLayoutVersion" WHERE "submissionKey"=${input.submissionKey}`);
    if (old) { assertRetry(old, requestHash, context.user.id); return cat.id; }
    const [latest] = await sstRows<{ version: number }>(tx, sql`SELECT COALESCE(MAX("version"),0)::int version FROM "SstCatLayoutVersion" WHERE "catId"=${cat.id}`);
    if (latest.version !== input.expectedVersion) throw new SstValidationError("Layout revisado por outro usuário. Atualize a ficha.");
    const canonical = await catLayoutCanonicalDefaults(context, cat.id, tx);
    const fields = validateCatLayoutFields({ ...suppliedFields, ...canonical.fields }, false, input.mode === "COMPLETE");
    if (["REOPENING","DEATH"].includes(fields.catType) && !input.originalReceipt) throw new SstValidationError("Reabertura/comunicação de óbito exige referência da CAT original comprovada.");
    let medical: Record<string,string> | null = null;
    if (input.medicalEvidenceId) {
      const [attendance] = await tx.select().from(sstCatEvidence).where(and(eq(sstCatEvidence.id, input.medicalEvidenceId), eq(sstCatEvidence.catId, cat.id), eq(sstCatEvidence.kind, "ATTENDANCE"), eq(sstCatEvidence.clinical, true)));
      if (!attendance?.professionalRoleId) throw new SstValidationError("Atendimento médico não pertence à CAT.");
      const when = new Date(String(attendance.data.attendedAt)), physician = await assertAccidentPhysician(tx, context, attendance.professionalRoleId, cat.budgetUnitId, when);
      const author = attendance.data.authorSnapshot as { council?: string } | undefined;
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
      const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(when);
      medical = validateCatLayoutFields({ ...validateCatLayoutFields(input.medicalFields, true), attendanceDate: day, attendanceTime: time, injury: String(attendance.data.injury), cidCodes: (attendance.data.cidCodes as string[]).join("; "), medicalObservations: [attendance.data.probableDiagnosis, attendance.data.observations].filter(Boolean).join(" — "), crm: author?.council || physician.council }, true, input.mode === "COMPLETE");
    } else if (Object.values(input.medicalFields as Record<string,unknown>).some(Boolean)) throw new SstValidationError("Dados médicos exigem atendimento e autorização clínica.");
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO "SstCatLayoutVersion" ("id","catId","version","mode","layoutVersion","templateSha256","provenance","fields","canonicalSnapshot","originalReceipt","createdById","submissionKey","requestHash") VALUES (${id},${cat.id},${latest.version + 1},${input.mode},${catLayoutProvenance.version},${catLayoutProvenance.sha256},${JSON.stringify(catLayoutProvenance)}::jsonb,${JSON.stringify(fields)}::jsonb,${JSON.stringify(canonical.snapshot)}::jsonb,${input.originalReceipt || null},${context.user.id},${input.submissionKey},${requestHash})`);
    if (medical) await tx.execute(sql`INSERT INTO "SstCatLayoutMedical" ("layoutVersionId","medicalEvidenceId","fields","createdById") VALUES (${id},${input.medicalEvidenceId},${JSON.stringify(medical)}::jsonb,${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CAT_LAYOUT", targetId: id });
    return cat.id;
  });
}
/** Main eSocial source adapter can include this envelope; its hash binds the printed layout. */
export async function readCatLayoutForEsocial(context: AppContext, catId: string) {
  assertAccidentOperation(context, "issueReports");
  return readLatestCatLayout(context, catId, true);
}
export async function readCatLayoutRegistration(context: AppContext, layout: CatLayoutRow) {
  const cat = await readCat(context, layout.catId);
  const [exists] = await sstRows<{ available: boolean }>(sstDatabase(context), sql`SELECT to_regclass('"SstEsocialEvidence"') IS NOT NULL AS available`);
  if (!exists.available) return null;
  // Only accepted production evidence, with the exact layout snapshot, can supply a number.
  const [accepted] = await sstRows<{ receipt: string; processedAt: string }>(sstDatabase(context), sql`SELECT v."receipt",v."processedAt" FROM "SstEsocialEvidence" v JOIN "SstEsocialEvent" e ON e."id"=v."eventId" WHERE e."sourceId"=${cat.id} AND e."budgetUnitId"=${cat.budgetUnitId} AND e."kind"='S2210' AND e."environment"='PRODUCTION' AND v."environment"='PRODUCTION' AND v."status"='ACCEPTED' AND e."sourceSnapshot"->'catLayout'->'layout'->>'requestHash'=${layout.requestHash} ORDER BY v."receivedAt" DESC,v."id" DESC LIMIT 1`);
  return accepted ? { ...accepted, processedAt: sstTimestamp(accepted.processedAt) } : null;
}
