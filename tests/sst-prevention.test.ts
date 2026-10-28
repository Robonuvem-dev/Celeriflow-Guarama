import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { Decimal } from "../src/db/decimal";
import { createSstDrizzleFixture } from "./helpers/sst-drizzle-fixture";
import { sstTestContext } from "./helpers/sst-drizzle-context";
import { sstDatabaseError } from "./helpers/sst-database-error";
import { preventionInput, preventionPayload, exactCost, participationPercent } from "../src/lib/sst/prevention-policy";
import { createPrevention, voteCipa, registerCipaCandidate, getPrevention, updateMeeting, listPrevention, electionResults, extinguisherValidity, cipaCalendar } from "../src/lib/sst/prevention-service";
import { validateQuestionnaireAnswers } from "../src/lib/sst/questionnaire-policy";

test("routine schemas enforce operational scope, exact costs and chronological windows", () => {
  assert.equal(exactCost.parse("900719925474.09"), "900719925474.09");
  assert.equal(exactCost.safeParse(0.1 + 0.2).success, false);
  assert.equal(exactCost.safeParse("1.999").success, false);
  assert.equal(new Decimal("0.10").plus("0.20").toFixed(2), "0.30");
  const election = { kind: "ELECTION", cipaId: "cipa", registrationStartsAt: "2026-01-01T00:00:00Z", registrationEndsAt: "2026-01-02T00:00:00Z", startsAt: "2026-01-03T00:00:00Z", endsAt: "2026-01-04T00:00:00Z", commissionEmployeeIds: ["a"], minimumParticipation: 50 };
  assert.equal(preventionPayload.safeParse(election).success, true);
  assert.equal(preventionPayload.safeParse({ ...election, startsAt: election.registrationStartsAt }).success, false);
  assert.equal(preventionPayload.safeParse({ ...election, minimumParticipation: 101 }).success, false);
  assert.equal(participationPercent(1, 3), 33.33);
  assert.equal(participationPercent(0, 0), null);
  const inspection = { kind: "INSPECTION", at: "2026-01-01T00:00:00Z", location: "Oficina", responsiblePersonId: "p", formScope: "MEDICINE", formTitle: "Inspeção", questions: [{ key: "protecao", label: "Proteção instalada?", kind: "BOOLEAN", required: true, choices: [] }], answers: { protecao: true } };
  assert.equal(preventionPayload.safeParse(inspection).success, false);
  const parsed = preventionPayload.parse({ ...inspection, formScope: "SST_OPERATIONAL_INSPECTION" });
  if (parsed.kind !== "INSPECTION") throw new Error("unexpected kind");
  assert.deepEqual(validateQuestionnaireAnswers(parsed.questions, parsed.answers), { protecao: true });
  assert.throws(() => validateQuestionnaireAnswers(parsed.questions, { protecao: "sim" }));
  assert.throws(() => validateQuestionnaireAnswers(parsed.questions, { protecao: true, injected: "clinical" }));
  assert.equal(preventionInput.safeParse({ budgetUnitId: "ug", title: "Eleição", submissionKey: "unvalidated", payload: election }).success, false);
});

async function fixture(options: { seedElections?: boolean } = {}) {
  const local = await createSstDrizzleFixture(["BudgetUnit", "Person", "Employee", "Role", "Department", "ConfiguracaoModulo", "AuditEvent", "Supplier", "Company"]), db = local.database;
  try {
    await db.exec(`CREATE TABLE "Usuario" (id TEXT PRIMARY KEY); INSERT INTO "Usuario" VALUES ('actor'),('otheractor');
    INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','UG','Unidade','sec',now()),('other','OTHER','Outra','outside',now());
    INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('p1','Servidor um',now()),('p2','Servidor dois',now()),('p3','Servidor três',now());
    INSERT INTO "Employee" (id,name,"personId","secretariatId","updatedAt") VALUES ('e1','Servidor um','p1','sec',now()),('e2','Servidor dois','p2','sec',now()),('e3','Servidor três','p3','sec',now());
    CREATE TABLE "SstAccessGrant" ("usuarioId" TEXT,"budgetUnitId" TEXT,"isActive" BOOLEAN,"canReadClinical" BOOLEAN,"canAssess" BOOLEAN);
    CREATE TABLE "SstDisciplineGrant" ("usuarioId" TEXT,"budgetUnitId" TEXT,discipline TEXT,"isActive" BOOLEAN,"canRead" BOOLEAN,"canWrite" BOOLEAN);
    INSERT INTO "SstAccessGrant" VALUES ('actor','ug',true,true,true); INSERT INTO "SstDisciplineGrant" VALUES ('actor','ug','MEDICINE',true,true,true);
    CREATE TABLE "SstProfessionalRole" (id TEXT PRIMARY KEY,"personId" TEXT,"budgetUnitId" TEXT,discipline TEXT,council TEXT,"usuarioId" TEXT,"isActive" BOOLEAN,"startsAt" DATE,"endsAt" DATE); INSERT INTO "SstProfessionalRole" VALUES ('doctor','p1','ug','MEDICINE','CRM 123','actor',true,'2020-01-01','2100-01-01');
    INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('company','Empresa de manutenção','00000000000000',now());
    INSERT INTO "Supplier" (id,"companyId","updatedAt") VALUES ('supplier','company',now());`);
    await db.exec(await readFile(new URL("../prisma/migrations-ibema/20261011040000_add_sst_prevention/migration.sql", import.meta.url), "utf8"));
    const now = Date.now(), iso = (delta: number) => new Date(now + delta).toISOString();
    const election = { kind: "ELECTION", cipaId: "cipa", registrationStartsAt: iso(-600000), registrationEndsAt: iso(-300000), startsAt: iso(-100000), endsAt: iso(300000), commissionEmployeeIds: ["e3"], minimumParticipation: 50 };
    if (options.seedElections !== false) {
      await db.query(`INSERT INTO "SstPreventionRecord" (id,"budgetUnitId",kind,title,payload,"createdById","submissionKey") VALUES ('election','ug','ELECTION','Eleição',$1,'actor','key'), ('another','other','ELECTION','Outra',$1,'actor','key2')`, [election]);
      await db.exec(`INSERT INTO "SstElectionElector" VALUES ('election','e1','p1'),('election','e2','p2'),('election','e3','p3'),('another','e1','p1'); INSERT INTO "SstElectionCandidate" VALUES ('c1','election','e2','Candidato'),('cx','another','e1','Outra pessoa');`);
    }
    const context = sstTestContext(local.connection.db, { id: "actor", employeeId: "e1", profileCode: "STAFF", modulePermissions: [{ code: "SST", canView: true, canEdit: true }, { code: "PORTAL_SERVIDOR", canView: true, canEdit: true }], permissions: JSON.stringify({ modulosPermitidos: ["SST", "PORTAL_SERVIDOR"] }) });
    return { db, context, election, iso, close: local.close };
  } catch (error) { await local.close(); throw error; }
}

test("authenticated identity, wrong election candidate, duplicate turnout and anonymous ballots", async () => {
  const { db, context, close } = await fixture();
  try {
    assert.deepEqual((await db.query(`SELECT id,"budgetUnitId",kind,clinical FROM "SstPreventionRecord" ORDER BY id`)).rows, [
      { id: "another", budgetUnitId: "other", kind: "ELECTION", clinical: false },
      { id: "election", budgetUnitId: "ug", kind: "ELECTION", clinical: false },
    ]);
    await assert.rejects(voteCipa(context, { electionId: "election", candidateId: "cx" }), /Candidato não pertence/);
    assert.equal((await db.query<{ total: number }>(`SELECT count(*)::int total FROM "SstElectionTurnout"`)).rows[0].total, 0);
    const competing = await Promise.allSettled([voteCipa(context, { electionId: "election", candidateId: "c1", employeeId: "e2" }), voteCipa(context, { electionId: "election", candidateId: null })]);
    assert.equal(competing.filter(v => v.status === "fulfilled").length, 1);
    assert.equal(competing.filter(v => v.status === "rejected").length, 1);
    const ledger = (await db.query<{ employeeId: string }>(`SELECT "employeeId" FROM "SstElectionTurnout"`)).rows;
    assert.deepEqual(ledger, [{ employeeId: "e1" }]);
    await assert.rejects(voteCipa(context, { electionId: "election", candidateId: null }), /já votou/);
    const ballots = (await db.query<{ id: string; electionId: string; candidateId: string }>(`SELECT * FROM "SstElectionBallot"`)).rows;
    assert.equal(ballots.length, 1);
    assert.deepEqual(Object.keys(ballots[0]).sort(), ["candidateId", "electionId", "id"]);
    const noIdentity = { ...context, user: { ...context.user, employeeId: null } };
    await assert.rejects(voteCipa(noIdentity, { electionId: "election", candidateId: "c1" }), /Vínculo autenticado/);
    const outsider = { ...context, user: { ...context.user, employeeId: "e999" } };
    await assert.rejects(voteCipa(outsider, { electionId: "election", candidateId: "c1" }), /não integra o eleitorado/);
    await assert.rejects(getPrevention(context, "another"), /Acesso negado/);
  } finally { await close(); }
});

test("election windows, turnout percentage and tally are derived from actual secret ballots", async () => {
  const { db, context, election, iso, close } = await fixture();
  try {
    await voteCipa(context, { electionId: "election", candidateId: "c1" });
    const open = await electionResults(context, "election");
    assert.equal(open.percent, 33.33); assert.equal(open.closed, false); assert.deepEqual(open.tally, []);
    await db.query(`UPDATE "SstPreventionRecord" SET payload=$1 WHERE id='election'`, [{ ...election, endsAt: iso(-1000) }]);
    const closed = await electionResults(context, "election");
    assert.equal(closed.closed, true); assert.equal(closed.valid, false);
    assert.deepEqual(closed.tally, [{ candidateId: "c1", name: "Candidato", votes: 1 }, { candidateId: null, name: "Em branco", votes: 0 }]);
    await assert.rejects(voteCipa({ ...context, user: { ...context.user, employeeId: "e2" } }, { electionId: "election", candidateId: null }), /fora do período/);
  } finally { await close(); }
});

test("ballot failure rolls back turnout and registration never accepts another employee", async () => {
  const { db, context, election, iso, close } = await fixture();
  try {
    await db.exec(`CREATE FUNCTION reject_ballot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ballot unavailable'; END $$; CREATE TRIGGER reject_ballot BEFORE INSERT ON "SstElectionBallot" FOR EACH ROW EXECUTE FUNCTION reject_ballot();`);
    const auditBefore = (await db.query(`SELECT * FROM "AuditEvent" ORDER BY id`)).rows;
    await assert.rejects(voteCipa(context, { electionId: "election", candidateId: "c1" }), sstDatabaseError("P0001", /ballot unavailable/));
    assert.equal((await db.query<{ total: number }>(`SELECT count(*)::int total FROM "SstElectionTurnout"`)).rows[0].total, 0);
    assert.equal((await db.query<{ total: number }>(`SELECT count(*)::int total FROM "SstElectionBallot"`)).rows[0].total, 0);
    assert.deepEqual((await db.query(`SELECT * FROM "AuditEvent" ORDER BY id`)).rows, auditBefore);
    const registration = { ...election, registrationEndsAt: iso(100000), startsAt: iso(200000) };
    await db.query(`UPDATE "SstPreventionRecord" SET payload=$1 WHERE id='election'`, [registration]);
    await registerCipaCandidate(context, "election");
    await registerCipaCandidate(context, "election");
    const own = (await db.query(`SELECT "employeeId" FROM "SstElectionCandidate" WHERE "electionId"='election' ORDER BY "employeeId"`)).rows;
    assert.deepEqual(own, [{ employeeId: "e1" }, { employeeId: "e2" }]);
    const commission = { ...context, user: { ...context.user, employeeId: "e3" } };
    await assert.rejects(registerCipaCandidate(commission, "election"), /comissão eleitoral/);
  } finally { await close(); }
});

test("meeting snapshots preserve original dates, require justifications and complete presence", async () => {
  const { db, context, iso, close } = await fixture();
  try {
    const cipa = { kind: "CIPA", startsAt: iso(-900000), endsAt: iso(900000), members: [{ employeeId: "e1", function: "Presidente", representation: "EMPLOYEE", alternate: false }] };
    const meeting = { kind: "MEETING", cipaId: "cipa", at: iso(-600000), type: "ORDINARY", location: "Sala", agenda: "Segurança" };
    await db.query(`INSERT INTO "SstPreventionRecord" (id,"budgetUnitId",kind,title,payload,"createdById","submissionKey") VALUES ('cipa','ug','CIPA','CIPA',$1,'actor','cipa'),('meeting','ug','MEETING','Reunião',$2,'actor','meeting')`, [cipa, meeting]);
    const artifact = { originalAt: meeting.at, at: meeting.at, participants: [{ employeeId: "e1", personId: "p1", name: "Nome original", function: "Presidente", present: null }], postponements: [], minutes: null };
    await db.query(`INSERT INTO "SstPreventionRevision" (id,"recordId",version,artifact,"actorId") VALUES ('rev','meeting',1,$1,'actor')`, [artifact]);
    await assert.rejects(updateMeeting(context, { id: "meeting", at: iso(-300000), reason: "" }, "postpone"));
    await updateMeeting(context, { id: "meeting", at: iso(-300000), reason: "Falta de energia" }, "postpone");
    await assert.rejects(updateMeeting(context, { id: "meeting", minutes: "Ata real", presence: [{ employeeId: "e2", present: true }] }, "minutes"), /comissão original/);
    await updateMeeting(context, { id: "meeting", minutes: "Ata real", presence: [{ employeeId: "e1", present: true }] }, "minutes");
    const versions = (await db.query<{ artifact: typeof artifact }>(`SELECT artifact FROM "SstPreventionRevision" WHERE "recordId"='meeting' ORDER BY version`)).rows;
    assert.equal(versions.length, 3);
    assert.equal(versions[2].artifact.originalAt, meeting.at);
    assert.equal(versions[2].artifact.participants[0].name, "Nome original");
    assert.equal(versions[2].artifact.participants[0].present, true);
    assert.equal(versions[0].artifact.minutes, null);
    const year = Number(new Date(meeting.at).toLocaleString("en-US", { year: "numeric", timeZone: "America/Sao_Paulo" }));
    const calendar = await cipaCalendar(context, "ug", year);
    assert.equal(calendar.length, 1); assert.equal(calendar[0].originalAt, meeting.at); assert.equal(calendar[0].at, versions[2].artifact.at);
    await assert.rejects(updateMeeting(context, { id: "meeting", at: iso(100000), reason: "Depois da ata" }, "postpone"), /encerrada/);
  } finally { await close(); }
});

test("server pagination counts only authorized UG and hides clinical records before counting", async () => {
  const { db, context, close } = await fixture({ seedElections: false });
  try {
    // The default election seed contains `election` in ug. It would add one to
    // both totals below (47/46); this scenario starts with no prevention rows.
    assert.deepEqual((await db.query(`SELECT id FROM "SstPreventionRecord"`)).rows, []);
    const visit = { kind: "VISIT", type: "Rotina", at: "2026-01-01T00:00:00Z", location: "Sala", responsiblePersonId: "p1", details: "Inspeção real" };
    for (let i = 0; i < 45; i++) await db.query(`INSERT INTO "SstPreventionRecord" (id,"budgetUnitId",kind,title,payload,"createdById","submissionKey") VALUES ($1,'ug','VISIT',$1,$2,'actor',$1)`, [`visit-${i.toString().padStart(2, "0")}`, visit]);
    const audiometry = { kind: "AUDIOMETRY", pcaId: "pca", employeeId: "e1", professionalRoleId: "role", at: "2026-01-01T00:00:00Z", nextAt: "2027-01-01T00:00:00Z", technique: "Tonal", conclusion: "Restrita", right: [{ hz: 1000, db: 20 }], left: [{ hz: 1000, db: 20 }], attachments: [] };
    await db.query(`INSERT INTO "SstPreventionRecord" (id,"budgetUnitId",kind,title,payload,clinical,"createdById","submissionKey") VALUES ('clinical','ug','AUDIOMETRY','Restrito',$1,true,'actor','clinical')`, [audiometry]);
    await db.query(`INSERT INTO "SstPreventionRecord" (id,"budgetUnitId",kind,title,payload,clinical,"createdById","submissionKey")
      VALUES ('foreign-visit','other','VISIT','visit-foreign',$1,false,'actor','foreign-visit'),
        ('foreign-clinical','other','AUDIOMETRY','Restrito de outra UG',$2,true,'actor','foreign-clinical')`, [visit, audiometry]);
    // A clinical grant on an unauthorized UG must not widen the user's scope.
    await db.exec(`INSERT INTO "SstAccessGrant" VALUES ('actor','other',true,true,true);
      INSERT INTO "SstDisciplineGrant" VALUES ('actor','other','MEDICINE',true,true,true);`);
    assert.deepEqual((await db.query(`SELECT "budgetUnitId",clinical,count(*)::int AS total FROM "SstPreventionRecord" GROUP BY "budgetUnitId",clinical ORDER BY "budgetUnitId",clinical`)).rows, [
      { budgetUnitId: "other", clinical: false, total: 1 }, { budgetUnitId: "other", clinical: true, total: 1 },
      { budgetUnitId: "ug", clinical: false, total: 45 }, { budgetUnitId: "ug", clinical: true, total: 1 },
    ]);
    const auditBefore = (await db.query(`SELECT * FROM "AuditEvent" ORDER BY id`)).rows;
    const first = await listPrevention(context, { kind: "VISIT", page: 1 });
    const second = await listPrevention(context, { kind: "VISIT", page: 2 });
    const last = await listPrevention(context, { kind: "VISIT", page: 999 });
    assert.equal(first.total, 45); assert.equal(first.rows.length, 20); assert.equal(second.rows.length, 20); assert.equal(last.rows.length, 5); assert.equal(last.page, 3);
    assert.equal(new Set([...first.rows, ...second.rows, ...last.rows].map(r => r.id)).size, 45);
    const all = await listPrevention(context, { page: 1 }); assert.equal(all.total, 46);
    assert.equal((await listPrevention(context, { kind: "AUDIOMETRY", page: 1 })).total, 1);
    assert.ok([...first.rows, ...second.rows, ...last.rows, ...all.rows].every(row => row.budgetUnitId === "ug" && !Object.hasOwn(row, "payload")));
    const bothUnits = { ...context, user: { ...context.user, allowedBudgetUnitIds: ["ug", "other"] } };
    assert.equal((await listPrevention(bothUnits, { page: 1 })).total, 48);
    const selectedIds: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const selected = await listPrevention(bothUnits, { budgetUnitId: "ug", page });
      assert.equal(selected.total, 46);
      assert.ok(selected.rows.every(row => row.budgetUnitId === "ug"));
      selectedIds.push(...selected.rows.map(row => row.id));
    }
    assert.deepEqual(selectedIds.sort(), ["clinical", ...[...first.rows, ...second.rows, ...last.rows].map(row => row.id)].sort());
    const emptyScope = { ...context, user: { ...context.user, allowedBudgetUnitIds: [] } };
    const empty = await listPrevention(emptyScope, { page: 999 });
    assert.equal(empty.total, 0); assert.equal(empty.page, 1); assert.deepEqual(empty.rows, []);
    await db.exec('UPDATE "SstAccessGrant" SET "canReadClinical"=false');
    assert.equal((await listPrevention(context, { kind: "AUDIOMETRY", page: 1 })).total, 0);
    assert.equal((await listPrevention(context, { page: 1 })).total, 45);
    const hidden = await listPrevention(context, { q: "Restrito", page: 1 });
    assert.equal(hidden.total, 0); assert.deepEqual(hidden.rows, []);
    await assert.rejects(listPrevention(context, { budgetUnitId: "other", page: 1 }), /Acesso negado/);
    assert.deepEqual((await db.query(`SELECT * FROM "AuditEvent" ORDER BY id`)).rows, auditBefore);
  } finally { await close(); }
});

test("persisted CIPA plans, inspection version, SIPAT, brigade, ergonomics and PCA workflows", async () => {
  const { db, context, iso, close } = await fixture();
  try {
    let sequence = 0;
    const save = (payload: unknown, submissionKey = `00000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}`) => createPrevention(context, { budgetUnitId: "ug", title: "Registro demonstrável", submissionKey, payload });
    const startsAt = iso(-900000), endsAt = iso(900000), at = iso(-600000);
    const cipaId = await save({ kind: "CIPA", startsAt, endsAt, members: [{ employeeId: "e1", function: "Presidente", representation: "EMPLOYEE", alternate: false }] });
    const electionId = await save({ kind: "ELECTION", cipaId, registrationStartsAt: iso(-700000), registrationEndsAt: iso(-500000), startsAt: iso(-400000), endsAt: iso(500000), commissionEmployeeIds: ["e3"], minimumParticipation: 50 });
    assert.equal((await db.query<{ total: number }>(`SELECT count(*)::int total FROM "SstElectionElector" WHERE "electionId"=$1`, [electionId])).rows[0].total, 3);
    const activity = { title: "Orientação", actions: "Treinar equipe", goals: "Prevenir acidentes", location: "Oficina", strategy: "Demonstração prática", startsAt, endsAt, responsiblePersonIds: ["p1"] };
    const planId = await save({ kind: "PLAN", cipaId, activities: [activity] });
    assert.equal((await getPrevention(context, planId)).payload.kind, "PLAN");
    await assert.rejects(save({ kind: "PLAN", cipaId: "another", activities: [activity] }), /Vínculo de origem inválido/);
    await assert.rejects(save({ kind: "CIPA", startsAt, endsAt, members: [{ employeeId: "missing", function: "Presidente", representation: "EMPLOYEE", alternate: false }] }), /Servidor sem Pessoa/);
    const inspectionId = await save({ kind: "INSPECTION", cipaId, at, location: "Oficina", responsiblePersonId: "p1", formScope: "SST_OPERATIONAL_INSPECTION", formTitle: "Roteiro de prevenção", questions: [{ key: "protecao", label: "Proteção instalada?", section: "Máquinas", kind: "BOOLEAN", required: true, choices: [] }], answers: { protecao: false } });
    const inspection = await getPrevention(context, inspectionId);
    assert.equal(inspection.payload.kind, "INSPECTION");
    if (inspection.payload.kind === "INSPECTION") assert.deepEqual(inspection.payload.answers, { protecao: false });
    const sipatId = await save({ kind: "SIPAT", startsAt, endsAt, organizerPersonIds: ["p2"], activities: ["0.10", "0.20"].map(cost => ({ title: "Palestra", location: "Sala", at, cost, responsiblePersonIds: ["p1"] })) });
    const sipat = await getPrevention(context, sipatId);
    if (sipat.payload.kind === "SIPAT") assert.equal(sipat.payload.activities.reduce((sum, v) => sum.plus(v.cost), new Decimal(0)).toFixed(2), "0.30");
    await save({ kind: "BRIGADE", building: "Prefeitura", floors: ["Térreo", "Primeiro"], memberEmployeeIds: ["e1"], trainings: [{ title: "Combate a incêndio", at, instructorPersonId: "p2", participantEmployeeIds: ["e1"] }], requiredExams: ["Aptidão ocupacional"], actionPlan: [activity], meetings: [{ at, agenda: "Rotas de fuga", minutes: "Treino aprovado", participantEmployeeIds: ["e1"] }] });
    const pcaId = await save({ kind: "PCA", startsAt, endsAt, responsiblePersonId: "p1", goals: "Conservar audição", noiseAssessment: "Dosimetria ocupacional", controls: "Proteção coletiva", monitoring: "Audiometria periódica", activities: [activity] });
    const audiometryId = await save({ kind: "AUDIOMETRY", pcaId, employeeId: "e2", professionalRoleId: "doctor", at, nextAt: iso(300000), technique: "Tonal", conclusion: "Resultado ocupacional", right: [{ hz: 1000, db: 20 }], left: [{ hz: 1000, db: 15 }], attachments: [] });
    const exam = await getPrevention(context, audiometryId); assert.equal(exam.clinical, true);
    const ergonomic = { kind: "ERGONOMICS", scope: "INDIVIDUAL", clinical: false, employeeId: "e1", responsiblePersonId: "p2", at, location: "Sala", machines: "Computador", furniture: "Mesa regulável", equipment: "Apoio de pés", lighting: "Medição 500 lux", temperature: "Medição 23 graus", noise: "Medição 45 dB", recommendations: "Ajustar cadeira", attachments: [] };
    const ergonomicId = await save(ergonomic); assert.equal((await getPrevention(context, ergonomicId)).clinical, false);
    await assert.rejects(save({ ...ergonomic, clinical: true }), /autoria médica/);
    await db.exec('UPDATE "SstAccessGrant" SET "canReadClinical"=false');
    await assert.rejects(getPrevention(context, audiometryId), /autorização clínica/);
    await db.exec('UPDATE "SstAccessGrant" SET "canReadClinical"=true');
    const extinguisherId = await save({ kind: "EXTINGUISHER", serial: "EXT-01", type: "Pó químico", location: "Térreo", installedAt: startsAt, validUntil: endsAt, responsiblePersonId: "p1", supplierId: "supplier" });
    for (const type of ["RECHARGE", "HYDROSTATIC_TEST"]) await save({ kind: "MAINTENANCE", extinguisherId, type, at, validUntil: endsAt, supplierId: "supplier", technicalResponsiblePersonId: "p2", certificateNumber: "CERT-123" });
    assert.deepEqual(await extinguisherValidity(context, extinguisherId), { recharge: endsAt, hydrostatic: endsAt });
    await assert.rejects(save({ kind: "MAINTENANCE", extinguisherId: "another", type: "RECHARGE", at, validUntil: endsAt, supplierId: "supplier", technicalResponsiblePersonId: "p2", certificateNumber: "CERT-123" }), /Vínculo de origem inválido/);
    const visit = { kind: "VISIT", type: "Inspeção", at, location: "Oficina", responsiblePersonId: "p2", details: "Visita de segurança" };
    const retryKey = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    assert.equal(await save(visit, retryKey), await save(visit, retryKey));
    await assert.rejects(save({ ...visit, details: "Dados alterados" }, retryKey), /Chave de envio/);
    const meetingId = await save({ kind: "MEETING", cipaId, at, type: "ORDINARY", location: "Sala", agenda: "Prevenção" });
    const meeting = await getPrevention(context, meetingId);
    assert.equal("participants" in meeting.history[0].artifact && meeting.history[0].artifact.participants[0].name, "Servidor um");
    assert.ok((await db.query<{ total: number }>(`SELECT count(*)::int total FROM "SstPreventionRevision"`)).rows[0].total >= 9);
  } finally { await close(); }
});
