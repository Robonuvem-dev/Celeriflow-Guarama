import { randomUUID } from "node:crypto";
import { asc, desc, eq, and, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { sstPreventionRecords } from "@/db/schema/sst-prevention";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { findSstEmployee, findSstPerson, findSstUnit, listSstUnits, sstParameters } from "@/db/repositories/sst/scope";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sstDatabase, sstContextConnection } from "./database";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, canViewModule, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertDisciplineAccess } from "./clinical-access";
import { preventionInput, preventionPayload, postponeInput, minutesInput, electionChoiceInput, participationPercent, type PreventionPayload } from "./prevention-policy";
import { validateQuestionnaireAnswers } from "./questionnaire-policy";
import { SstValidationError } from "./errors";

type Db = DatabaseExecutor;
export type PreventionRow = { id: string; budgetUnitId: string; kind: PreventionPayload["kind"]; title: string; payload: PreventionPayload; clinical: boolean; createdById: string; createdAt: Date };
export type MeetingArtifact = { originalAt: string; at: string; participants: { employeeId: string; personId: string; name: string; function: string; present: boolean | null }[]; postponements: { from: string; to: string; reason: string; actorId: string }[]; minutes: string | null };
type Revision = { version: number; artifact: MeetingArtifact | { names: Record<string, string>; canonicalPersonIds?: Record<string, string>; secretariatIdSnapshot?: string }; createdAt: Date; actorId: string };
function operation(context: AppContext, op: "create" | "update" | "issueReports") {
  if (!canViewModule(context.user, "SST") || !canPerformModuleOperation(context.user, "SST", op)) throw new AccessError("Operação SST não autorizada.", 403);
}
async function record(db: Db, id: string) {
  const rows = await db.select().from(sstPreventionRecords).where(eq(sstPreventionRecords.id, id));
  if (!rows[0]) throw new AccessError("Registro de prevenção não encontrado.", 404);
  return { ...rows[0], payload: preventionPayload.parse(rows[0].payload) };
}
async function scope(context: AppContext, row: PreventionRow, write = false) {
  if (!canViewModule(context.user, "SST")) throw new AccessError("Acesso SST não autorizado.", 403);
  assertBudgetUnitAccess(context.user, row.budgetUnitId);
  if (row.clinical) await assertDisciplineAccess(context, row.budgetUnitId, "MEDICINE", write);
}
async function parent(db: Db, child: { budgetUnitId: string }, id: string, kind: PreventionPayload["kind"]) {
  const row = await record(db, id);
  if (row.budgetUnitId !== child.budgetUnitId || row.kind !== kind) throw new SstValidationError("Vínculo de origem inválido para esta UG e rotina.");
  return row;
}
async function employee(db: Db, id: string, secretariatId: string | null) {
  const e = await findSstEmployee(db, id);
  if (!e?.isActive || !e.person || e.person.status !== "Ativo" || !secretariatId || e.secretariatId !== secretariatId) throw new SstValidationError("Servidor sem Pessoa canônica ativa ou fora da lotação da UG.");
  return e;
}
async function person(db: Db, id: string) {
  const p = await findSstPerson(db, id);
  if (!p || p.status !== "Ativo") throw new SstValidationError("Pessoa responsável inexistente ou inativa.");
  return { id: p.id, name: p.fullName };
}
async function revision(db: Db, rowId: string, actorId: string, version: number, artifact: MeetingArtifact) {
  await db.execute(sql`INSERT INTO "SstPreventionRevision" ("id","recordId","version","artifact","actorId") VALUES (${randomUUID()},${rowId},${version},${JSON.stringify(artifact)}::jsonb,${actorId})`);
}
export async function createPrevention(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  operation(context, "create");
  const input = preventionInput.parse(raw), p = input.payload;
  if (p.kind === "INSPECTION") p.answers = validateQuestionnaireAnswers(p.questions, p.answers);
  if ("attachments" in p) for (const a of p.attachments) {
    const b = Buffer.from(a.base64, "base64");
    const valid = a.mime === "application/pdf" ? b.subarray(0, 5).toString() === "%PDF-" : a.mime === "image/png" ? b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : b[0] === 255 && b[1] === 216 && b[2] === 255;
    if (!valid || b.length > 2 * 1024 * 1024) throw new SstValidationError("Anexo inválido ou maior que 2 MB.");
  }
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  const clinical = p.kind === "AUDIOMETRY" || (p.kind === "ERGONOMICS" && p.clinical);
  if (clinical) await assertDisciplineAccess(context, input.budgetUnitId, "MEDICINE", true);
  return withDatabaseTransaction(connection, async db => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${context.user.id + input.submissionKey}))`);
    const duplicate = await db.select().from(sstPreventionRecords).where(and(eq(sstPreventionRecords.createdById, context.user.id), eq(sstPreventionRecords.submissionKey, input.submissionKey)));
    if (duplicate[0]) {
      if (duplicate[0].budgetUnitId !== input.budgetUnitId || duplicate[0].title !== input.title || JSON.stringify(preventionPayload.parse(duplicate[0].payload)) !== JSON.stringify(p)) throw new SstValidationError("Chave de envio já utilizada com outros dados.");
      return duplicate[0].id;
    }
    const unit = await findSstUnit(db, input.budgetUnitId);
    if (!unit) throw new SstValidationError("UG não encontrada.");
    const names: Record<string, string> = {};
    const canonicalPersonIds: Record<string, string> = {};
    const addPerson = async (id: string) => { const v = await person(db, id); names[id] = v.name; canonicalPersonIds[id] = id; };
    const addEmployee = async (id: string) => { const e = await employee(db, id, unit.secretariatId); names[id] = e.person!.fullName; canonicalPersonIds[id] = e.person!.id; return e; };
    let meeting: MeetingArtifact | null = null;
    if ("cipaId" in p && p.cipaId) {
      const cipa = await parent(db, input, p.cipaId, "CIPA");
      names[p.cipaId] = cipa.title;
      if (cipa.payload.kind !== "CIPA") throw new SstValidationError("Mandato inválido.");
      const cp = cipa.payload;
      const dates = p.kind === "PLAN" ? p.activities.flatMap(a => [a.startsAt, a.endsAt]) : "at" in p ? [p.at] : [];
      if (dates.some(at => at < cp.startsAt || at > cp.endsAt)) throw new SstValidationError("Atividade fora da vigência do mandato.");
      if (p.kind === "MEETING") {
        const participants = [];
        for (const m of cp.members) { const e = await addEmployee(m.employeeId); participants.push({ employeeId: e.id, personId: e.person!.id, name: e.person!.fullName, function: m.function, present: null }); }
        meeting = { originalAt: p.at, at: p.at, participants, postponements: [], minutes: null };
      }
    }
    if (p.kind === "CIPA") for (const m of p.members) await addEmployee(m.employeeId);
    if (p.kind === "PLAN" || p.kind === "PCA") for (const a of p.activities) for (const id of a.responsiblePersonIds) await addPerson(id);
    if ("responsiblePersonId" in p) await addPerson(p.responsiblePersonId);
    if (p.kind === "INSPECTION") p.answers = validateQuestionnaireAnswers(p.questions, p.answers);
    if (p.kind === "SIPAT") { for (const id of p.organizerPersonIds) await addPerson(id); for (const a of p.activities) for (const id of a.responsiblePersonIds) await addPerson(id); }
    if (p.kind === "ELECTION") for (const id of p.commissionEmployeeIds) await addEmployee(id);
    if (p.kind === "BRIGADE") {
      for (const id of p.memberEmployeeIds) await addEmployee(id);
      for (const t of p.trainings) { await addPerson(t.instructorPersonId); for (const id of t.participantEmployeeIds) { if (!p.memberEmployeeIds.includes(id)) throw new SstValidationError("Participante não pertence à brigada."); await addEmployee(id); } }
      for (const a of p.actionPlan) { if (a.startsAt >= a.endsAt) throw new SstValidationError("Período inválido no plano da brigada."); for (const id of a.responsiblePersonIds) await addPerson(id); }
      for (const m of p.meetings) for (const id of m.participantEmployeeIds) { if (!p.memberEmployeeIds.includes(id)) throw new SstValidationError("Participante não pertence à brigada."); await addEmployee(id); }
    }
    if ((p.kind === "ERGONOMICS" && p.employeeId) || p.kind === "AUDIOMETRY") await addEmployee(p.employeeId!);
    if ((p.kind === "EXTINGUISHER" || p.kind === "MAINTENANCE") && p.supplierId) {
      const [supplier] = await sstRows<{ id: string; status: string; corporateName: string | null; fullName: string | null }>(db, sql`SELECT s.id,s.status,c."corporateName",p."fullName" FROM "Supplier" s LEFT JOIN "Company" c ON c.id=s."companyId" LEFT JOIN "Person" p ON p.id=s."personId" WHERE s.id=${p.supplierId}`);
      if (!supplier || supplier.status !== "Ativo") throw new SstValidationError("Fornecedor inexistente ou inativo.");
      names[p.supplierId] = supplier.corporateName || supplier.fullName || p.supplierId;
    }
    if (p.kind === "EXTINGUISHER" && p.assetId) {
      const assets = await sstRows<{ id: string; name: string; patrimonyNumber: string }>(db, sql`SELECT a."id",a."name",a."patrimonyNumber" FROM "Asset" a JOIN "Department" d ON d."id"=a."departmentId" WHERE a."id"=${p.assetId} AND d."secretariatId"=${unit.secretariatId}`);
      if (!assets.length) throw new SstValidationError("Patrimônio fora da UG.");
      names[p.assetId] = `${assets[0].patrimonyNumber} — ${assets[0].name}`;
    }
    if (p.kind === "MAINTENANCE") { const ext = await parent(db, input, p.extinguisherId, "EXTINGUISHER"); names[p.extinguisherId] = ext.title; if (ext.payload.kind === "EXTINGUISHER" && p.at < ext.payload.installedAt) throw new SstValidationError("Manutenção anterior à instalação."); await addPerson(p.technicalResponsiblePersonId); }
    if (p.kind === "AUDIOMETRY") {
      const pca = await parent(db, input, p.pcaId, "PCA");
      names[p.pcaId] = pca.title;
      if (pca.payload.kind === "PCA" && (p.at < pca.payload.startsAt || p.at > pca.payload.endsAt)) throw new SstValidationError("Exame fora da vigência do PCA.");
    }
    if (p.kind === "AUDIOMETRY" || (p.kind === "ERGONOMICS" && p.clinical)) {
      const roles = await sstRows<{ personId: string; council: string }>(db, sql`SELECT "personId","council" FROM "SstProfessionalRole" WHERE "id"=${p.professionalRoleId} AND "budgetUnitId"=${input.budgetUnitId} AND "discipline"='MEDICINE' AND "usuarioId"=${context.user.id} AND "isActive"=true AND "startsAt"<=${new Date(p.at)}::date AND "endsAt">=${new Date(p.at)}::date`);
      if (!roles[0]) throw new SstValidationError("Médico autor sem vínculo vigente com o usuário e a UG.");
      await addPerson(roles[0].personId);
      names[p.professionalRoleId!] = `${names[roles[0].personId]} — ${roles[0].council}`;
    }
    const id = randomUUID();
    await db.execute(sql`INSERT INTO "SstPreventionRecord" ("id","budgetUnitId","kind","title","payload","clinical","createdById","submissionKey") VALUES (${id},${input.budgetUnitId},${p.kind},${input.title},${JSON.stringify(p)}::jsonb,${clinical},${context.user.id},${input.submissionKey})`);
    // Snapshot of canonical identities for later print/history without exposing clinical content in general logs.
    if (meeting) await revision(db, id, context.user.id, 1, meeting);
    else await db.execute(sql`INSERT INTO "SstPreventionRevision" ("id","recordId","version","artifact","actorId") VALUES (${randomUUID()},${id},1,${JSON.stringify({ names, canonicalPersonIds, secretariatIdSnapshot: unit.secretariatId })}::jsonb,${context.user.id})`);
    if (p.kind === "ELECTION") {
      await db.execute(sql`INSERT INTO "SstElectionElector" ("electionId","employeeId","personId") SELECT ${id},e."id",e."personId" FROM "Employee" e JOIN "Person" p ON p."id"=e."personId" WHERE e."isActive"=true AND p."status"='Ativo' AND e."secretariatId"=${unit.secretariatId}`);
    }
    await writeAuditEvent(db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_PREVENTION", targetId: id });
    return id;
  });
}
export async function getPrevention(context: AppContext, id: string, report = false) {
  if (report) operation(context, "issueReports");
  const row = await record(sstDatabase(context), id); await scope(context, row);
  const history: Revision[] = (await sstRows<Omit<Revision, "createdAt"> & { createdAt: string }>(sstDatabase(context), sql`SELECT "version","artifact","createdAt","actorId" FROM "SstPreventionRevision" WHERE "recordId"=${id} ORDER BY "version"`)).map(row => ({ ...row, createdAt: sstTimestamp(row.createdAt) }));
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: report ? auditEventTypes.reportIssued : auditEventTypes.pageView, targetType: "SST_PREVENTION", targetId: id });
  return { ...row, history };
}
export async function preventionLinks(context: AppContext, id: string, requestedPage = 1) {
  const row = await record(sstDatabase(context), id); await scope(context, row);
  const clinicalAllowed = (await listSstUnits(sstDatabase(context), context, "MEDICINE")).some(unit => unit.id === row.budgetUnitId);
  const where = sql`"budgetUnitId"=${row.budgetUnitId} AND ("clinical"=false OR ${clinicalAllowed}) AND ("payload"->>'cipaId'=${id} OR "payload"->>'extinguisherId'=${id} OR "payload"->>'pcaId'=${id})`;
  const counts = await sstRows<{ total: string }>(sstDatabase(context), sql`SELECT count(*) AS total FROM "SstPreventionRecord" WHERE ${where}`);
  const total = Number(counts[0].total), page = Math.min(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const rows = await sstDatabase(context).select({ id: sstPreventionRecords.id, title: sstPreventionRecords.title, kind: sstPreventionRecords.kind }).from(sstPreventionRecords).where(where).orderBy(desc(sstPreventionRecords.createdAt), desc(sstPreventionRecords.id)).limit(20).offset((page - 1) * 20);
  return { rows, total, page };
}
export async function extinguisherValidity(context: AppContext, id: string) {
  const row = await record(sstDatabase(context), id); await scope(context, row);
  if (row.payload.kind !== "EXTINGUISHER") throw new SstValidationError("Registro não é um extintor.");
  const maintenance = await sstRows<{ id: string; type: string; at: string; validUntil: string }>(sstDatabase(context), sql`SELECT DISTINCT ON ("payload"->>'type') "id","payload"->>'type' AS type,"payload"->>'at' AS at,"payload"->>'validUntil' AS "validUntil" FROM "SstPreventionRecord" WHERE "budgetUnitId"=${row.budgetUnitId} AND "kind"='MAINTENANCE' AND "payload"->>'extinguisherId'=${id} AND ("payload"->>'at')::timestamptz <= CURRENT_TIMESTAMP ORDER BY "payload"->>'type',("payload"->>'at')::timestamptz DESC,"id" DESC`);
  return { recharge: maintenance.find(m => m.type === "RECHARGE")?.validUntil || row.payload.validUntil, hydrostatic: maintenance.find(m => m.type === "HYDROSTATIC_TEST")?.validUntil || null };
}
export async function listPrevention(context: AppContext, raw: unknown) {
  if (!canViewModule(context.user, "SST")) throw new AccessError("Acesso SST negado.", 403);
  const filter = z.object({ kind: z.string().max(30).default(""), q: z.string().max(200).default(""), budgetUnitId: z.string().max(100).default(""), page: z.coerce.number().int().min(1).catch(1) }).parse(raw);
  if (filter.budgetUnitId) assertBudgetUnitAccess(context.user, filter.budgetUnitId);
  const clinicalUnits = await listSstUnits(sstDatabase(context), context, "MEDICINE");
  const scopeSql = isSystemAdministrator(context.user) ? sql`true` : sql`"budgetUnitId" IN (${sstParameters(context.user.allowedBudgetUnitIds)})`;
  const clinicalSql = sql`("clinical"=false OR "budgetUnitId" IN (${sstParameters(clinicalUnits.map(u => u.id))}))`;
  const where = sql`${scopeSql} AND ${clinicalSql} AND (${filter.kind}='' OR "kind"=${filter.kind}) AND (${filter.budgetUnitId}='' OR "budgetUnitId"=${filter.budgetUnitId}) AND "title" ILIKE ${`%${filter.q}%`}`;
  const counts = await sstRows<{ total: string }>(sstDatabase(context), sql`SELECT count(*) AS total FROM "SstPreventionRecord" WHERE ${where}`);
  const total = Number(counts[0].total), page = Math.min(filter.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await sstDatabase(context).select({ id: sstPreventionRecords.id, title: sstPreventionRecords.title, kind: sstPreventionRecords.kind, createdAt: sstPreventionRecords.createdAt, budgetUnitId: sstPreventionRecords.budgetUnitId }).from(sstPreventionRecords).where(where).orderBy(desc(sstPreventionRecords.createdAt), desc(sstPreventionRecords.id)).limit(20).offset((page - 1) * 20);
  return { rows, page, total, filter };
}
export async function updateMeeting(context: AppContext, raw: unknown, mode: "postpone" | "minutes", connection: DatabaseConnection = sstContextConnection(context)) {
  operation(context, "update");
  const input = mode === "postpone" ? postponeInput.parse(raw) : minutesInput.parse(raw);
  return withDatabaseTransaction(connection, async db => {
    await db.execute(sql`SELECT "id" FROM "SstPreventionRecord" WHERE "id"=${input.id} FOR UPDATE`);
    const row = await record(db, input.id); await scope(context, row, true);
    if (row.payload.kind !== "MEETING") throw new SstValidationError("Registro não é uma reunião.");
    const revisions = await sstRows<Omit<Revision, "createdAt"> & { createdAt: string }>(db, sql`SELECT * FROM "SstPreventionRevision" WHERE "recordId"=${input.id} ORDER BY "version" DESC LIMIT 1`);
    const latest = revisions[0], artifact = latest.artifact;
    if (!("participants" in artifact)) throw new SstValidationError("Snapshot original de participantes indisponível.");
    if (artifact.minutes) throw new SstValidationError("Reunião encerrada; ata e presenças preservadas.");
    if ("reason" in input) {
      const cp = (await parent(db, row, row.payload.cipaId, "CIPA")).payload;
      if (input.at <= artifact.at || cp.kind !== "CIPA" || input.at > cp.endsAt || input.at < cp.startsAt) throw new SstValidationError("Nova data deve ser posterior à atual e dentro do mandato.");
      artifact.postponements.push({ from: artifact.at, to: input.at, reason: input.reason, actorId: context.user.id }); artifact.at = input.at;
    } else {
      if (new Date(artifact.at) > new Date()) throw new SstValidationError("Reunião ainda não realizada.");
      if (input.presence.length !== artifact.participants.length || new Set(input.presence.map(p => p.employeeId)).size !== input.presence.length || input.presence.some(p => !artifact.participants.some(m => m.employeeId === p.employeeId))) throw new SstValidationError("Informe presença de todos os participantes da comissão original.");
      artifact.minutes = input.minutes;
      artifact.participants = artifact.participants.map(p => ({ ...p, present: input.presence.find(v => v.employeeId === p.employeeId)!.present }));
    }
    await revision(db, input.id, context.user.id, latest.version + 1, artifact);
    await writeAuditEvent(db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CIPA_MEETING", targetId: input.id });
    return input.id;
  });
}
export async function cipaCalendar(context: AppContext, budgetUnitId: string, year: number) {
  assertBudgetUnitAccess(context.user, budgetUnitId);
  if (!canViewModule(context.user, "SST")) throw new AccessError("Acesso SST negado.", 403);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new SstValidationError("Ano inválido.");
  return sstRows<{ id: string; title: string; at: string; originalAt: string; type: string }>(sstDatabase(context), sql`SELECT r."id",r."title",v."artifact"->>'at' AS at,v."artifact"->>'originalAt' AS "originalAt",r."payload"->>'type' AS type FROM "SstPreventionRecord" r JOIN LATERAL (SELECT "artifact" FROM "SstPreventionRevision" WHERE "recordId"=r."id" ORDER BY "version" DESC LIMIT 1) v ON true WHERE r."kind"='MEETING' AND r."budgetUnitId"=${budgetUnitId} AND extract(year FROM (v."artifact"->>'at')::timestamptz AT TIME ZONE 'America/Sao_Paulo')=${year} ORDER BY at,r."id"`);
}
async function portalElection(context: AppContext, db: Db, electionId: string) {
  if (!canViewModule(context.user, "PORTAL_SERVIDOR") || !context.user.employeeId) throw new AccessError("Vínculo autenticado obrigatório.", 403);
  const active = await findModuleActivation(db, "SST");
  if (active?.ativo === false) throw new AccessError("SST inativo.", 423);
  const e = await findSstEmployee(db, context.user.employeeId);
  const eligible = await sstRows<{ employeeId: string }>(db, sql`SELECT "employeeId" FROM "SstElectionElector" WHERE "electionId"=${electionId} AND "employeeId"=${context.user.employeeId}`);
  if (!e?.isActive || !eligible.length) throw new AccessError("Servidor não integra o eleitorado desta eleição.", 403);
  const row = await record(db, electionId);
  if (row.payload.kind !== "ELECTION") throw new SstValidationError("Eleição inválida.");
  return { row, payload: row.payload, employee: e };
}
export async function registerCipaCandidate(context: AppContext, electionId: string, connection: DatabaseConnection = sstContextConnection(context)) {
  return withDatabaseTransaction(connection, async db => {
    const { payload, employee } = await portalElection(context, db, electionId);
    const now = new Date().toISOString();
    if (now < payload.registrationStartsAt || now >= payload.registrationEndsAt) throw new SstValidationError("Inscrições encerradas ou ainda não abertas.");
    if (payload.commissionEmployeeIds.includes(employee.id)) throw new SstValidationError("Integrante da comissão eleitoral não pode se candidatar.");
    const id = randomUUID();
    const p = await findSstPerson(db, employee.personId!);
    if (!p) throw new SstValidationError("Pessoa canônica não encontrada.");
    await db.execute(sql`INSERT INTO "SstElectionCandidate" ("id","electionId","employeeId","nameSnapshot") VALUES (${id},${electionId},${employee.id},${p.fullName}) ON CONFLICT ("electionId","employeeId") DO NOTHING`);
    await writeAuditEvent(db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CIPA_CANDIDACY", targetId: electionId });
    return electionId;
  });
}
export async function voteCipa(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = electionChoiceInput.parse(raw);
  return withDatabaseTransaction(connection, async db => {
    const { payload, employee } = await portalElection(context, db, input.electionId);
    const now = new Date().toISOString();
    if (now < payload.startsAt || now >= payload.endsAt) throw new SstValidationError("Votação fora do período válido.");
    if (input.candidateId) {
      const candidate = await sstRows<{ id: string }>(db, sql`SELECT "id" FROM "SstElectionCandidate" WHERE "electionId"=${input.electionId} AND "id"=${input.candidateId}`);
      if (!candidate.length) throw new SstValidationError("Candidato não pertence à eleição.");
    }
    const accepted = await db.execute(sql`INSERT INTO "SstElectionTurnout" ("electionId","employeeId") VALUES (${input.electionId},${employee.id}) ON CONFLICT DO NOTHING`);
    if (!accepted.rowCount) throw new SstValidationError("O servidor já votou nesta eleição.");
    await db.execute(sql`INSERT INTO "SstElectionBallot" ("id","electionId","candidateId") VALUES (${randomUUID()},${input.electionId},${input.candidateId})`);
    // No actor audit for the ballot: turnout is its own auditable ledger and cannot identify the choice.
    return input.electionId;
  });
}
export async function electionResults(context: AppContext, id: string) {
  const row = await record(sstDatabase(context), id); await scope(context, row);
  if (row.payload.kind !== "ELECTION") throw new SstValidationError("Eleição inválida.");
  const counts = await sstRows<{ eligible: string; turnout: string }>(sstDatabase(context), sql`SELECT (SELECT count(*) FROM "SstElectionElector" WHERE "electionId"=${id}) AS eligible,(SELECT count(*) FROM "SstElectionTurnout" WHERE "electionId"=${id}) AS turnout`);
  const eligible = Number(counts[0].eligible), turnout = Number(counts[0].turnout), percent = participationPercent(turnout, eligible);
  const closed = new Date().toISOString() >= row.payload.endsAt;
  const tally = closed ? await sstRows<{ candidateId: string | null; name: string; votes: string }>(sstDatabase(context), sql`SELECT c."id" AS "candidateId",c."nameSnapshot" AS name,count(b."id") AS votes FROM "SstElectionCandidate" c LEFT JOIN "SstElectionBallot" b ON b."candidateId"=c."id" AND b."electionId"=c."electionId" WHERE c."electionId"=${id} GROUP BY c."id",c."nameSnapshot" UNION ALL SELECT null,'Em branco',count(*) FROM "SstElectionBallot" WHERE "electionId"=${id} AND "candidateId" IS NULL ORDER BY votes DESC,name`) : [];
  return { eligible, turnout, percent, closed, valid: closed && percent !== null && percent >= row.payload.minimumParticipation, tally: tally.map(v => ({ ...v, votes: Number(v.votes) })) };
}
export async function portalElections(context: AppContext, requestedPage = 1) {
  if (!context.user.employeeId || !canViewModule(context.user, "PORTAL_SERVIDOR")) throw new AccessError("Vínculo autenticado obrigatório.", 403);
  const counts = await sstRows<{ total: string }>(sstDatabase(context), sql`SELECT count(*) AS total FROM "SstPreventionRecord" r JOIN "SstElectionElector" e ON e."electionId"=r."id" WHERE e."employeeId"=${context.user.employeeId} AND r."kind"='ELECTION' AND (r."payload"->>'endsAt')::timestamptz >= CURRENT_TIMESTAMP`);
  const total = Number(counts[0].total), page = Math.min(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const rows = await sstDatabase(context).select().from(sstPreventionRecords).where(sql`EXISTS (SELECT 1 FROM "SstElectionElector" e WHERE e."electionId"=${sstPreventionRecords.id} AND e."employeeId"=${context.user.employeeId}) AND "kind"='ELECTION' AND ("payload"->>'endsAt')::timestamptz >= CURRENT_TIMESTAMP`).orderBy(desc(sstPreventionRecords.createdAt), asc(sstPreventionRecords.id)).limit(20).offset((page - 1) * 20);
  const elections = await Promise.all(rows.map(async row => {
    const { payload } = await portalElection(context, sstDatabase(context), row.id);
    const candidates = await sstRows<{ id: string; nameSnapshot: string }>(sstDatabase(context), sql`SELECT "id","nameSnapshot" FROM "SstElectionCandidate" WHERE "electionId"=${row.id} ORDER BY "nameSnapshot","id"`);
    const votes = await sstRows<{ employeeId: string }>(sstDatabase(context), sql`SELECT "employeeId" FROM "SstElectionTurnout" WHERE "electionId"=${row.id} AND "employeeId"=${context.user.employeeId}`);
    return { id: row.id, title: row.title, payload, candidates, voted: votes.length > 0 };
  }));
  return { elections, total, page };
}
