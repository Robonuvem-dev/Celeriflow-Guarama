import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { sstCats, sstCatEvidence } from "@/db/schema/sst-accidents";
import { findSstEmployee, findSstPerson, findSstUnit, countSstSecretariatUnits, listSstUnits, sstParameters } from "@/db/repositories/sst/scope";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sstContextConnection, sstDatabase } from "./database";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertDisciplineAccess } from "./clinical-access";
import { accidentInput, investigationInput, medicalAttendanceInput, assertRetry, assertHomologation, exactDecimal } from "./accident-policy";
import { SstValidationError } from "./errors";

export type CatRow = { id: string; budgetUnitId: string; employeeId: string; occurredAt: Date; kind: string; source: string; data: Record<string, unknown>; snapshot: Record<string, string | null>; requestHash: string; createdById: string; createdAt: Date };
export type CatEvidence = { id: string; catId: string; kind: string; version: number; clinical: boolean; approved: boolean; personId: string | null; professionalRoleId: string | null; data: Record<string, unknown>; createdAt: Date; createdById: string; requestHash: string };
export const accidentHash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export function assertAccidentOperation(context: AppContext, operation: "create" | "issueReports" = "create") {
  if (!canPerformModuleOperation(context.user, "SST", operation)) throw new AccessError("Operação SST não autorizada.", 403);
}
export async function readCat(context: AppContext, id: string, database: DatabaseExecutor = sstDatabase(context)): Promise<CatRow> {
  const [row] = await database.select().from(sstCats).where(eq(sstCats.id, id)).limit(1);
  if (!row) throw new SstValidationError("CAT não encontrada.");
  assertBudgetUnitAccess(context.user, row.budgetUnitId);
  return row;
}
export async function registerAccident(context: AppContext, raw: unknown, portal = false, connection: DatabaseConnection = sstContextConnection(context)) {
  if (!portal) assertAccidentOperation(context);
  const input = accidentInput.parse(raw);
  if (portal && input.employeeId !== context.user.employeeId) throw new AccessError("Servidor diferente do vínculo autenticado.", 403);
  if (!portal) assertBudgetUnitAccess(context.user, input.budgetUnitId);
  if (input.occurredAt > new Date()) throw new SstValidationError("Ocorrência não pode estar no futuro.");
  const requestHash = accidentHash({ ...input, portal });
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CAT:${input.budgetUnitId}:${input.submissionKey}`}))`);
    const [unit, employee] = await Promise.all([findSstUnit(tx, input.budgetUnitId), findSstEmployee(tx, input.employeeId)]);
    if (!unit || !employee?.isActive || !employee.secretariatId || employee.secretariatId !== unit.secretariatId) throw new SstValidationError("Vínculo funcional incompatível com a UG.");
    // Fail closed when current canonical lotation cannot distinguish two UGs.
    if (await countSstSecretariatUnits(tx, employee.secretariatId) !== 1) throw new SstValidationError("Lotação ambígua entre UGs; regularize o vínculo antes de comunicar.");
    const [existing] = await tx.select().from(sstCats).where(and(eq(sstCats.budgetUnitId, unit.id), eq(sstCats.submissionKey, input.submissionKey)));
    if (existing) { assertRetry(existing, requestHash, context.user.id); return existing.id; }
    const id = randomUUID();
    const snapshot = { employeeName: employee.name, registration: employee.registration, roleName: employee.role?.name ?? null, roleId: employee.roleId, unitName: unit.name };
    await tx.execute(sql`INSERT INTO "SstCat" ("id","budgetUnitId","employeeId","submissionKey","requestHash","createdById","occurredAt","kind","source","data","snapshot") VALUES (${id},${unit.id},${employee.id},${input.submissionKey},${requestHash},${context.user.id},${input.occurredAt},${input.kind},${portal ? "PORTAL" : "SST"},${JSON.stringify(input)}::jsonb,${JSON.stringify(snapshot)}::jsonb)`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CAT", targetId: id });
    return id;
  });
}
export async function listAccidents(context: AppContext, requestedPage = 1, kind = "", employeeId?: string) {
  const database = sstDatabase(context);
  const units = employeeId ? [] : await listSstUnits(database, context);
  if (employeeId && employeeId !== context.user.employeeId) throw new AccessError("Servidor diferente do vínculo autenticado.", 403);
  const scope = employeeId ? sql`"employeeId"=${employeeId}` : sql`"budgetUnitId" IN (${sstParameters(units.map(u => u.id))})`;
  const where = sql`${scope} AND (${kind}='' OR "kind"=${kind})`;
  const [count] = (await database.execute<{ total: string }>(sql`SELECT COUNT(*) AS total FROM "SstCat" WHERE ${where}`)).rows;
  const total = Number(count.total), page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / 20)));
  const rows: CatRow[] = await database.select().from(sstCats).where(where).orderBy(desc(sstCats.occurredAt), desc(sstCats.id)).limit(20).offset((page - 1) * 20);
  return { rows, total, page };
}
export async function readAccidentEvidence(context: AppContext, id: string, clinical = false) {
  const cat = await readCat(context, id);
  if (clinical) await assertDisciplineAccess(context, cat.budgetUnitId, "MEDICINE");
  const rows: CatEvidence[] = await sstDatabase(context).select().from(sstCatEvidence).where(sql`"catId"=${id} AND (NOT "clinical" OR ${clinical})`).orderBy(desc(sstCatEvidence.version), desc(sstCatEvidence.createdAt), desc(sstCatEvidence.id));
  if (clinical) await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CAT_CLINICAL_READ", targetId: id });
  return rows;
}
export async function readAccidentState(context: AppContext, id: string) {
  await readCat(context, id);
  const [state] = (await sstDatabase(context).execute<{ version: number; homologated: boolean }>(sql`SELECT COALESCE(MAX("version") FILTER (WHERE "kind"='INVESTIGATION'),0)::int AS version, COALESCE(bool_or("kind"='HOMOLOGATION'),false) AS homologated FROM "SstCatEvidence" WHERE "catId"=${id}`)).rows;
  return state;
}
export async function listAccidentEvidence(context: AppContext, id: string, requestedPage = 1, clinical = false) {
  const cat = await readCat(context, id);
  if (clinical) await assertDisciplineAccess(context, cat.budgetUnitId, "MEDICINE");
  const [count] = (await sstDatabase(context).execute<{ total: string }>(sql`SELECT COUNT(*) total FROM "SstCatEvidence" WHERE "catId"=${id} AND (NOT "clinical" OR ${clinical})`)).rows;
  const total = Number(count.total), page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / 20)));
  const rows: CatEvidence[] = await sstDatabase(context).select().from(sstCatEvidence).where(sql`"catId"=${id} AND (NOT "clinical" OR ${clinical})`).orderBy(desc(sstCatEvidence.version), desc(sstCatEvidence.createdAt), desc(sstCatEvidence.id)).limit(20).offset((page - 1) * 20);
  if (clinical) await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CAT_CLINICAL_READ", targetId: id });
  return { rows, total, page };
}
/** Validates active canonical medicine credentials and actor binding; never consults SUS. */
export async function assertAccidentPhysician(tx: DatabaseExecutor, context: AppContext, roleId: string, budgetUnitId: string, when: Date) {
  const date = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(when)}T00:00:00Z`);
  const roles = (await tx.execute<{ personId: string; council: string; usuarioId: string | null }>(sql`SELECT "personId","council","usuarioId" FROM "SstProfessionalRole" WHERE "id"=${roleId} AND "budgetUnitId"=${budgetUnitId} AND "discipline"='MEDICINE' AND "isActive" AND "startsAt"<=${date} AND "endsAt">=${date} FOR SHARE`)).rows;
  const role = roles[0];
  if (!role || !role.council || (!isSystemAdministrator(context.user) && role.usuarioId !== context.user.id)) throw new AccessError("Médico não habilitado para o usuário, UG e data.", 403);
  return role;
}
export async function addAccidentEvidence(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertAccidentOperation(context);
  const input = z.object({ catId: z.string().min(1), submissionKey: z.uuid(), expectedVersion: z.coerce.number().int().min(0).default(0), kind: z.enum(["INVESTIGATION", "TECHNICAL", "MEDICAL", "ATTENDANCE", "HOMOLOGATION"]), personId: z.string().default(""), professionalRoleId: z.string().default(""), approved: z.boolean().default(false), data: z.unknown() }).parse(raw);
  const cat = await readCat(context, input.catId);
  const clinical = ["INVESTIGATION", "MEDICAL", "ATTENDANCE"].includes(input.kind);
  if (clinical) await assertDisciplineAccess(context, cat.budgetUnitId, "MEDICINE", true);
  const data = input.kind === "INVESTIGATION" ? investigationInput.parse(input.data) : input.kind === "ATTENDANCE" ? medicalAttendanceInput.parse(input.data) : z.object({ opinion: z.string().trim().min(10).max(10000) }).parse(input.data);
  const requestHash = accidentHash({ ...input, data });
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT "id" FROM "SstCat" WHERE "id"=${cat.id} FOR UPDATE`);
    const [existing] = await tx.select().from(sstCatEvidence).where(eq(sstCatEvidence.submissionKey, input.submissionKey));
    if (existing) { assertRetry(existing, requestHash, context.user.id); return cat.id; }
    const evidence = await tx.select({ kind: sstCatEvidence.kind, version: sstCatEvidence.version, approved: sstCatEvidence.approved }).from(sstCatEvidence).where(eq(sstCatEvidence.catId, cat.id));
    if (evidence.some(e => e.kind === "HOMOLOGATION")) throw new SstValidationError("CAT homologada: evidências encerradas e preservadas.");
    const latest = Math.max(0, ...evidence.filter(e => e.kind === "INVESTIGATION").map(e => e.version));
    const version = input.kind === "INVESTIGATION" ? latest + 1 : Math.max(1, latest);
    if (input.kind !== "ATTENDANCE" && input.expectedVersion !== latest) throw new SstValidationError("A investigação foi revisada. Atualize a ficha antes de registrar o parecer ou homologação.");
    if (["TECHNICAL", "MEDICAL", "HOMOLOGATION"].includes(input.kind) && latest === 0) throw new SstValidationError("Registre a investigação antes dos pareceres.");
    if (input.kind === "HOMOLOGATION") assertHomologation(version, evidence);
    if (input.kind !== "INVESTIGATION" && input.kind !== "ATTENDANCE" && evidence.some(e => e.kind === input.kind && e.version === version)) throw new SstValidationError("Já existe este parecer na revisão. Uma correção exige nova revisão da investigação.");
    let personId: string | null = null, roleId: string | null = null;
    let authorSnapshot: Record<string, string> = { recordedBy: context.user.name };
    if (input.kind === "TECHNICAL") {
      const person = await findSstPerson(tx, input.personId);
      if (!person) throw new SstValidationError("Responsável técnico deve pertencer ao Cadastro Único.");
      personId = person.id;
      authorSnapshot = { ...authorSnapshot, name: person.fullName };
    }
    if (input.kind === "MEDICAL" || input.kind === "ATTENDANCE") {
      roleId = input.kind === "ATTENDANCE" ? medicalAttendanceInput.parse(data).professionalRoleId : input.professionalRoleId;
      const when = input.kind === "ATTENDANCE" ? medicalAttendanceInput.parse(data).attendedAt : new Date();
      if (when > new Date() || when < cat.occurredAt) throw new SstValidationError("Data do atendimento incompatível com a ocorrência.");
      const physician = await assertAccidentPhysician(tx, context, roleId, cat.budgetUnitId, when);
      personId = physician.personId;
      const person = await findSstPerson(tx, personId);
      if (!person) throw new SstValidationError("Responsável não encontrado no Cadastro Único.");
      authorSnapshot = { ...authorSnapshot, name: person.fullName, council: physician.council };
    }
    await tx.execute(sql`INSERT INTO "SstCatEvidence" ("id","catId","kind","version","clinical","approved","personId","professionalRoleId","data","createdById","submissionKey","requestHash") VALUES (${randomUUID()},${cat.id},${input.kind},${version},${clinical},${input.approved},${personId},${roleId},${JSON.stringify({ ...data, authorSnapshot })}::jsonb,${context.user.id},${input.submissionKey},${requestHash})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CAT_EVIDENCE", targetId: cat.id });
    return cat.id;
  });
}
export async function addAccidentLedger(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertAccidentOperation(context);
  const input = z.object({ catId: z.string().min(1), submissionKey: z.uuid(), kind: z.enum(["EXPENSE", "REIMBURSEMENT"]), amount: z.string(), description: z.string().trim().min(1).max(1000), expenseId: z.string().default("") }).parse(raw);
  await readCat(context, input.catId);
  const amount = exactDecimal(input.amount), requestHash = accidentHash(input);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT "id" FROM "SstCat" WHERE "id"=${input.catId} FOR UPDATE`);
    const [old] = (await tx.execute<{ requestHash: string; createdById: string }>(sql`SELECT "requestHash","createdById" FROM "SstCatLedger" WHERE "submissionKey"=${input.submissionKey}`)).rows;
    if (old) { assertRetry(old, requestHash, context.user.id); return input.catId; }
    if (input.kind === "REIMBURSEMENT") {
      const [expense] = (await tx.execute<{ sufficient: boolean }>(sql`SELECT (e."amount" >= ${amount}::numeric + COALESCE((SELECT SUM(r."amount") FROM "SstCatLedger" r WHERE r."expenseId"=e."id"),0)) AS sufficient FROM "SstCatLedger" e WHERE e."id"=${input.expenseId} AND e."catId"=${input.catId} AND e."kind"='EXPENSE' FOR UPDATE`)).rows;
      if (!expense?.sufficient) throw new SstValidationError("Despesa de origem inválida ou reembolso excede o saldo registrado.");
    }
    await tx.execute(sql`INSERT INTO "SstCatLedger" ("id","catId","kind","amount","description","expenseId","createdById","submissionKey","requestHash") VALUES (${randomUUID()},${input.catId},${input.kind},${amount}::numeric,${input.description},${input.expenseId || null},${context.user.id},${input.submissionKey},${requestHash})`);
    return input.catId;
  });
}
export async function readAccidentLedger(context: AppContext, id: string) {
  await readCat(context, id);
  return (await sstDatabase(context).execute<{ id: string; kind: string; amount: string; description: string; expenseId: string | null }>(sql`SELECT "id","kind","amount"::text,"description","expenseId" FROM "SstCatLedger" WHERE "catId"=${id} ORDER BY "createdAt","id"`)).rows;
}
/** Read-only authorized source adapter for S-2210. ID and immutable source hash are stable. */
export async function readCatForEsocial(context: AppContext, id: string) {
  assertAccidentOperation(context, "issueReports");
  const cat = await readCat(context, id);
  if (cat.kind === "INCIDENT") throw new SstValidationError("Incidente sem CAT não é origem de S-2210.");
  const evidence = await readAccidentEvidence(context, id, true);
  if (!evidence.some(e => e.kind === "HOMOLOGATION")) throw new SstValidationError("CAT ainda não homologada.");
  return { cat, evidence };
}
