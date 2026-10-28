import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { withDatabaseTransaction, type DatabaseExecutor } from '../src/db/transaction';
import { recruitmentApplications, recruitmentRules } from '../src/db/schema/personnel-recruitment';
import { auditEvents } from '../src/db/schema/audit';
import type { RecruitmentContext, RecruitmentNoticePolicy } from '../src/lib/contracts/personnel-recruitment';

const policy: RecruitmentNoticePolicy = {
  origin: 'EDITAL_RECRUTAMENTO', kind: 'CONCURSO', number: '01/2026',
  budgetUnitId: 'recruitment-ug-a', documentVersionId: 'recruitment-final',
  instructions: 'Instruções integrais do edital de teste.',
  startsAt: '2000-01-01T00:00:00.000Z', endsAt: '2199-01-01T00:00:00.000Z',
  roles: [{ code: 'ANALISTA', name: 'Analista', requirements: 'Formação superior' }],
  acceptance: 'Aceito integralmente os termos publicados.',
};
function noticeInput(suffix: string, patch: Partial<RecruitmentNoticePolicy> = {}) {
  return { ruleSetId: 'recruitment-set', code: `PORTAL_EDITAL_TEST_${suffix}`, name: `Edital de teste ${suffix}`, isActive: true, value: { ...policy, ...patch } };
}
function applicationInput(noticeId: string) {
  return { noticeId, roleCode: 'ANALISTA', cpf: '529.982.247-25', fullName: ' Candidato externo ', birthDate: '2000-01-02', phone: ' (41) 99999-0000 ', accepted: true as const };
}
function context(db: RecruitmentContext['database'], id = 'recruitment-reviewer', units = ['recruitment-ug-a'], administrator = false, editor = true): RecruitmentContext {
  return { database: db, user: {
    id, firebaseUid: `fixture:${id}`, name: id, email: `${id}@example.test`, role: 'Fixture',
    profileCode: administrator ? 'SYSTEM_ADMINISTRATOR' : 'RECRUITMENT_TEST',
    allowedBudgetUnitIds: units, modulePermissions: editor ? [{ code: 'RH', canView: true, canEdit: true }] : [],
    employeeId: id === 'recruitment-candidate-2' ? 'recruitment-employee' : null, departmentId: null, secretariatId: null,
  } };
}
const status = (expected: number) => (error: unknown) => error instanceof Error && 'status' in error && error.status === expected;
function databaseCode(expected: string) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if ('code' in error && error.code === expected) return true;
      error = error.cause;
    }
    return false;
  };
}
function failureMessage(expected: string) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if (error.message.includes(expected)) return true;
      error = error.cause;
    }
    return false;
  };
}
async function fingerprint(db: DatabaseExecutor) {
  const result: Array<{ name: string; hash: string }> = [];
  for (const name of ['HrRecruitmentApplication', 'HrPayrollRule', 'HrPayrollRuleSet', 'Document', 'DocumentVersion', 'AuditEvent', 'Person', 'Employee', 'Usuario', 'ConfiguracaoPerfil']) {
    const [row] = (await db.execute<{ hash: string }>(sql`SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${sql.identifier(name)} r`)).rows;
    result.push({ name, hash: row.hash });
  }
  return result;
}
async function auditCount(db: DatabaseExecutor, targetId: string, targetType: string) {
  return (await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "AuditEvent" WHERE "targetId"=${targetId} AND "targetType"=${targetType}`)).rows[0].total;
}

// CENTRAL RUN ONLY: the fixture replays historical SQL and transports real
// Neon/Drizzle transactions over loopback PostgreSQL. No application schema DDL.
test('recruitment: six operations against independent historical SQL and real Neon/Drizzle', { timeout: 240_000 }, async t => {
  const { createSpecializedDrizzleFixture } = await import('./helpers/specialized-drizzle-fixture');
  const fixture = await createSpecializedDrizzleFixture();
  try {
    await fixture.database.exec(await readFile('tests/fixtures/personnel-recruitment.sql', 'utf8'));
    const connection = fixture.connection, db = connection.db;
    const service = await import('../src/lib/rh/recruitment-service');
    const { readPublicRecruitmentRules, readInstitutionalRecruitmentVersions } = await import('../src/db/repositories/personnel-recruitment/reads');
    const admin = context(db, 'recruitment-admin', [], true), reviewer = context(db);
    const candidate = context(db, 'recruitment-candidate', [], false, false);
    const employeeCandidate = context(db, 'recruitment-candidate-2', [], false, false);
    const faultActor = context(db, 'recruitment-audit-fail');
    const canonicalBefore = (await fingerprint(db)).filter(row => ['Person', 'Employee'].includes(row.name));

    await t.test('public notices require active effective configuration, valid policy and institutional FINAL/SIGNED GED; ordering and closed registration visibility stay exact', async () => {
      const before = await fingerprint(db);
      const notices = await service.listPublicRecruitmentNotices(db);
      assert.deepEqual(notices.map(row => row.id), ['ended', 'final', 'finite', 'signed', 'upcoming'].map(suffix => `recruitment-public-${suffix}`));
      assert.deepEqual(notices.find(row => row.id === 'recruitment-public-final')?.policy, policy);
      assert.deepEqual(await readInstitutionalRecruitmentVersions(db, []), []);
      assert.deepEqual((await readInstitutionalRecruitmentVersions(db, ['recruitment-final', 'recruitment-signed', 'recruitment-draft', 'recruitment-personal', 'recruitment-invalid', 'missing'])).map(row => row.id).sort(), ['recruitment-final', 'recruitment-signed']);
      for (const at of ['2000-01-01T00:00:00.000Z', '2199-01-01T00:00:00.000Z']) {
        assert.ok((await readPublicRecruitmentRules(db, new Date(at))).some(row => row.id === 'recruitment-public-finite'));
      }
      assert.ok(!(await readPublicRecruitmentRules(db, new Date('2199-01-01T00:00:00.001Z'))).some(row => row.id === 'recruitment-public-finite'));
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('notice schemas, create/update authorization, old/new UG scope, origins and GED validation precede atomic writes', async () => {
      const input = noticeInput('PUBLICATION'), before = await fingerprint(db);
      await assert.rejects(service.saveRecruitmentNotice(candidate, input, connection), status(403));
      await assert.rejects(service.saveRecruitmentNotice(context(db, 'recruitment-reviewer', ['recruitment-ug-b']), input, connection), status(403));
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...input, extra: true }, connection));
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...input, value: { ...policy, endsAt: '1999-01-01T00:00:00.000Z' } }, connection));
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...input, value: { ...policy, roles: [policy.roles[0], policy.roles[0]] } }, connection));
      for (const documentVersionId of ['missing', 'recruitment-personal', 'recruitment-invalid', 'recruitment-draft']) {
        await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...input, value: { ...policy, documentVersionId } }, connection), /GED institucional válida/);
      }
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...input, ruleSetId: 'recruitment-set-draft' }, connection), /Configuração RH ativa/);
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...input, ruleSetId: 'missing' }, connection), /Configuração RH não encontrada/);
      assert.deepEqual(await fingerprint(db), before);
      const id = await service.saveRecruitmentNotice(reviewer, input, connection);
      const revised = { ...input, id, name: 'Edital revisto antes das inscrições', value: { ...policy, kind: 'PSS' as const, documentVersionId: 'recruitment-signed' } };
      assert.equal(await service.saveRecruitmentNotice(reviewer, revised, connection), id);
      const [rule] = await db.select().from(recruitmentRules).where(eq(recruitmentRules.id, id));
      assert.deepEqual(rule.value, revised.value);
      assert.equal(rule.name, revised.name); assert.equal(rule.category, 'PORTAL'); assert.equal(rule.valueType, 'JSON');
      assert.ok(rule.updatedAt instanceof Date); assert.equal(await auditCount(db, id, 'RECRUITMENT_NOTICE'), 2);
      const applied = await fingerprint(db);
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...revised, code: 'PORTAL_EDITAL_ANOTHER' }, connection), /Preserve a origem/);
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...revised, ruleSetId: 'recruitment-set-finite' }, connection), /Preserve a origem/);
      await assert.rejects(service.saveRecruitmentNotice(context(db, 'recruitment-reviewer', ['recruitment-ug-b']), { ...revised, value: { ...revised.value, budgetUnitId: 'recruitment-ug-b' } }, connection), status(403));
      assert.deepEqual(await fingerprint(db), applied);
    });

    await t.test('late notice audit failure and duplicate code roll back creates/updates, including updatedAt', async () => {
      const input = noticeInput('AUDIT_NOTICE'), before = await fingerprint(db);
      await assert.rejects(service.saveRecruitmentNotice(faultActor, input, connection), failureMessage('recruitment fixture late audit failure'));
      assert.deepEqual(await fingerprint(db), before);
      const id = await service.saveRecruitmentNotice(reviewer, input, connection), applied = await fingerprint(db);
      await assert.rejects(service.saveRecruitmentNotice(faultActor, { ...input, id, name: 'Nome que deve sofrer rollback' }, connection), failureMessage('recruitment fixture late audit failure'));
      await assert.rejects(service.saveRecruitmentNotice(reviewer, input, connection), databaseCode('23505'));
      assert.deepEqual(await fingerprint(db), applied);
    });

    await t.test('normalized application hash/snapshot, native dates, per-notice numbering and replay preserve candidates without employee prerequisites', async () => {
      const input = noticeInput('REGISTRATION'), id = await service.saveRecruitmentNotice(reviewer, input, connection);
      const raw = applicationInput(id), applicationId = await service.submitRecruitmentApplication(candidate, raw, connection);
      const rows = await service.readOwnRecruitmentApplications(candidate), application = rows.find(row => row.id === applicationId);
      assert.ok(application);
      const normalized = { noticeId: id, roleCode: 'ANALISTA', cpf: '52998224725', fullName: 'Candidato externo', birthDate: '2000-01-02', phone: '(41) 99999-0000', accepted: true };
      assert.equal(application.requestHash, createHash('sha256').update(JSON.stringify(normalized)).digest('hex'));
      assert.equal(application.cpf, normalized.cpf); assert.equal(application.number, 1); assert.equal(application.status, 'RECEBIDA');
      assert.equal(application.decision, null); assert.equal(application.decidedAt, null); assert.equal(application.decidedById, null);
      assert.ok(application.createdAt instanceof Date);
      const snapshot = application.snapshot;
      assert.ok(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot));
      assert.equal(typeof snapshot.acceptedAt, 'string');
      assert.deepEqual(snapshot, { noticeName: input.name, policy, ...normalized, email: candidate.user.email, acceptedAt: snapshot.acceptedAt });
      assert.equal(new Date(String(snapshot.acceptedAt)).toISOString(), snapshot.acceptedAt);
      assert.equal(await auditCount(db, applicationId, 'RECRUITMENT_APPLICATION'), 1);
      const second = await service.submitRecruitmentApplication(employeeCandidate, { ...raw, cpf: '111.444.777-35', fullName: 'Servidor candidato' }, connection);
      assert.equal((await service.readOwnRecruitmentApplications(employeeCandidate)).find(row => row.id === second)?.number, 2);
      const registered = await fingerprint(db);
      assert.equal(await service.submitRecruitmentApplication(candidate, { ...raw, cpf: '52998224725', fullName: 'Candidato externo', phone: '(41) 99999-0000' }, connection), applicationId);
      await assert.rejects(service.submitRecruitmentApplication(candidate, { ...raw, phone: '(41) 99999-9999' }, connection), /registro anterior foi preservado/);
      await assert.rejects(service.submitRecruitmentApplication(employeeCandidate, raw, connection), /registro anterior foi preservado/);
      assert.deepEqual(await fingerprint(db), registered);
      // Original replay precedes current notice/account eligibility checks.
      await db.update(recruitmentRules).set({ isActive: false }).where(eq(recruitmentRules.id, id));
      await db.execute(sql`UPDATE "Usuario" SET ativo=false WHERE id=${candidate.user.id}`);
      const disabled = await fingerprint(db);
      assert.equal(await service.submitRecruitmentApplication(candidate, raw, connection), applicationId);
      assert.deepEqual(await fingerprint(db), disabled);
      await db.execute(sql`UPDATE "Usuario" SET ativo=true WHERE id=${candidate.user.id}`);
      await db.update(recruitmentRules).set({ isActive: true }).where(eq(recruitmentRules.id, id));
      const activeAgain = await fingerprint(db);
      await assert.rejects(service.saveRecruitmentNotice(reviewer, { ...input, id, value: { ...policy, acceptance: 'Outros termos não substituem o aceite original.' } }, connection), /novo código para retificação/);
      assert.deepEqual(await fingerprint(db), activeAgain);
      assert.equal(await service.saveRecruitmentNotice(reviewer, { ...input, id, name: 'Rótulo atualizado', isActive: false }, connection), id);
      const [preserved] = await db.select().from(recruitmentApplications).where(eq(recruitmentApplications.id, applicationId));
      assert.deepEqual(preserved, application);
    });

    await t.test('eligibility rejects invalid CPF/acceptance/birth, wrong role/window/configuration, inactive users and inactive profiles without writes', async () => {
      const before = await fingerprint(db), valid = applicationInput('recruitment-public-final');
      await assert.rejects(service.submitRecruitmentApplication(candidate, { ...valid, cpf: '111.111.111-11' }, connection), /CPF inválido/);
      await assert.rejects(service.submitRecruitmentApplication(candidate, { ...valid, accepted: false }, connection));
      await assert.rejects(service.submitRecruitmentApplication(candidate, { ...valid, birthDate: '2199-01-01' }, connection), /Nascimento fora de ordem/);
      await assert.rejects(service.submitRecruitmentApplication(candidate, { ...valid, extra: true }, connection));
      await assert.rejects(service.submitRecruitmentApplication(candidate, { ...valid, roleCode: 'INEXISTENTE' }, connection), /Edital, janela ou cargo indisponível/);
      for (const suffix of ['inactive', 'category', 'draftset', 'futureset', 'expiredset', 'ended', 'upcoming']) {
        await assert.rejects(service.submitRecruitmentApplication(candidate, applicationInput(`recruitment-public-${suffix}`), connection), /Edital, janela ou cargo indisponível/);
      }
      await assert.rejects(service.submitRecruitmentApplication(candidate, applicationInput('missing'), connection), /Edital não encontrado/);
      for (const suffix of ['malformed', 'jsonnull']) await assert.rejects(service.submitRecruitmentApplication(candidate, applicationInput(`recruitment-public-${suffix}`), connection));
      for (const user of ['recruitment-inactive-user', 'recruitment-inactive-profile-user', 'missing-user']) {
        await assert.rejects(service.submitRecruitmentApplication(context(db, user, [], false, false), valid, connection), status(403));
      }
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('application audit failure rolls back insertion and numbering; a later valid submission still starts at one', async () => {
      const noticeId = await service.saveRecruitmentNotice(reviewer, noticeInput('AUDIT_APPLICATION'), connection), before = await fingerprint(db);
      await assert.rejects(service.submitRecruitmentApplication(faultActor, applicationInput(noticeId), connection), failureMessage('recruitment fixture late audit failure'));
      assert.deepEqual(await fingerprint(db), before);
      const id = await service.submitRecruitmentApplication(candidate, applicationInput(noticeId), connection);
      assert.equal((await service.readOwnRecruitmentApplications(candidate)).find(row => row.id === id)?.number, 1);
    });

    await t.test('individual reads isolate applicant IDs, retain JSON null/text and decode timestamp(3) as UTC with stable tie ordering', async () => {
      const before = await fingerprint(db), first = await service.readOwnRecruitmentApplications(context(db, 'recruitment-page-1'));
      assert.deepEqual(first.map(row => row.id), ['recruitment-page-application-01']);
      assert.equal(first[0].createdAt.toISOString(), '2099-10-20T12:34:56.789Z');
      assert.equal(first[0].decidedAt?.toISOString(), '2099-10-21T12:34:56.789Z');
      assert.deepEqual(first[0].snapshot, { policy: { budgetUnitId: 'recruitment-page-ug-a' }, birthDate: '2000-01-02', decimalText: '90071992547409.93', optional: null });
      assert.equal((await service.readOwnRecruitmentApplications(context(db, 'recruitment-page-25')))[0].snapshot, null);
      assert.equal((await service.readOwnRecruitmentApplications(context(db, 'recruitment-page-2')))[0].decidedAt, null);
      assert.deepEqual(await service.readOwnRecruitmentApplications(context(db, 'unknown-applicant')), []);
      const own = await service.readOwnRecruitmentApplications(candidate);
      assert.ok(own.every(row => row.applicantUserId === candidate.user.id));
      const ordered = [...own].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
      assert.deepEqual(own.map(row => row.id), ordered.map(row => row.id));
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('review permissions, JSON text UG scope and pagination preserve count/order/clamping and parameterized IDs', async () => {
      const before = await fingerprint(db), scoped = context(db, 'recruitment-reviewer', ['recruitment-page-ug-a']);
      const first = await service.listRecruitmentApplicationsForReview(scoped);
      assert.equal(first.total, 21); assert.equal(first.page, 1);
      assert.deepEqual(first.rows.map(row => row.id), Array.from({ length: 20 }, (_, i) => `recruitment-page-application-${String(i + 1).padStart(2, '0')}`));
      const last = await service.listRecruitmentApplicationsForReview(scoped, 999);
      assert.equal(last.page, 2); assert.equal(last.total, 21); assert.deepEqual(last.rows.map(row => row.id), ['recruitment-page-application-21']);
      for (const requested of [0, -1, NaN, 1.5]) assert.equal((await service.listRecruitmentApplicationsForReview(scoped, requested)).page, 1);
      assert.equal((await service.listRecruitmentApplicationsForReview(context(db, 'recruitment-reviewer', ['recruitment-page-ug-b']))).total, 2);
      assert.deepEqual((await service.listRecruitmentApplicationsForReview(context(db, 'recruitment-reviewer', ['1']))).rows.map(row => row.id), ['recruitment-page-application-24']);
      assert.deepEqual(await service.listRecruitmentApplicationsForReview(context(db, 'recruitment-reviewer', [])), { rows: [], page: 1, total: 0 });
      assert.equal((await service.listRecruitmentApplicationsForReview(context(db, 'recruitment-reviewer', ["x') OR true --"]))).total, 0);
      const all = await service.listRecruitmentApplicationsForReview(admin);
      const [count] = (await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "HrRecruitmentApplication"`)).rows;
      assert.equal(all.total, count.total);
      await assert.rejects(service.listRecruitmentApplicationsForReview(candidate), status(403));
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('decisions enforce RH/UG scope, self-review prohibition, row-lock replay and immutable reason/status with atomic audit', async () => {
      const noticeId = await service.saveRecruitmentNotice(reviewer, noticeInput('DECISION'), connection);
      const id = await service.submitRecruitmentApplication(candidate, applicationInput(noticeId), connection);
      const input = { id, status: 'DEFERIDA' as const, decision: 'Documentação analisada e inscrição deferida.' }, before = await fingerprint(db);
      await assert.rejects(service.decideRecruitmentApplication(candidate, input, connection), status(403));
      await assert.rejects(service.decideRecruitmentApplication(context(db, candidate.user.id), input, connection), /não pode decidir a própria inscrição/);
      await assert.rejects(service.decideRecruitmentApplication(context(db, 'recruitment-reviewer', ['recruitment-ug-b']), input, connection), status(403));
      await assert.rejects(service.decideRecruitmentApplication(reviewer, { ...input, id: 'missing' }, connection), status(404));
      await assert.rejects(service.decideRecruitmentApplication(reviewer, { ...input, decision: 'curto' }, connection));
      assert.deepEqual(await fingerprint(db), before);
      // now() is fixed at BEGIN and cast into a UTC timestamp(3). Retain the
      // original application-clock interval, and independently prove the DB
      // interval, decoder and same-transaction audit with no extra tolerance.
      const [start] = (await db.execute<{ ms: number; zone: string }>(sql`SELECT (extract(epoch FROM clock_timestamp()::timestamp(3))*1000)::float8 AS ms, current_setting('TimeZone') AS zone`)).rows;
      assert.equal(start.zone, 'UTC', 'now() implicit timestamp cast and typed timestamp decoding must share the same UTC convention');
      const nodeStart = Date.now();
      assert.equal(await service.decideRecruitmentApplication(reviewer, input, connection), id);
      const nodeEnd = Date.now();
      const [end] = (await db.execute<{ ms: number }>(sql`SELECT (extract(epoch FROM clock_timestamp()::timestamp(3))*1000)::float8 AS ms`)).rows;
      const [decided] = await db.select().from(recruitmentApplications).where(eq(recruitmentApplications.id, id));
      assert.equal(decided.status, input.status); assert.equal(decided.decision, input.decision); assert.equal(decided.decidedById, reviewer.user.id);
      assert.ok(decided.decidedAt instanceof Date);
      const [stored] = (await db.execute<{ ms: number }>(sql`SELECT (extract(epoch FROM "decidedAt")*1000)::float8 AS ms FROM "HrRecruitmentApplication" WHERE id=${id}`)).rows;
      assert.equal(decided.decidedAt.getTime(), stored.ms, 'typed timestamp decoder must preserve the exact physical UTC wall time');
      assert.ok(decided.decidedAt.getTime() >= nodeStart && decided.decidedAt.getTime() <= nodeEnd, JSON.stringify({ databaseStart: start, databaseEnd: end, decidedMs: stored.ms, nodeStart, nodeEnd }));
      assert.ok(stored.ms >= start.ms && stored.ms <= end.ms, JSON.stringify({ databaseStart: start, databaseEnd: end, decidedMs: stored.ms, nodeStart, nodeEnd }));
      assert.equal(await auditCount(db, id, 'RECRUITMENT_APPLICATION_DECISION'), 1);
      const [audit] = await db.select({ createdAt: auditEvents.createdAt }).from(auditEvents).where(and(eq(auditEvents.targetId, id), eq(auditEvents.targetType, 'RECRUITMENT_APPLICATION_DECISION')));
      assert.equal(decided.decidedAt.getTime(), audit.createdAt.getTime(), 'decision and audit default now() must have exactly the same transaction timestamp');
      const committed = await fingerprint(db);
      assert.equal(await service.decideRecruitmentApplication(context(db, 'recruitment-reviewer-2'), input, connection), id);
      await assert.rejects(service.decideRecruitmentApplication(reviewer, { ...input, status: 'INDEFERIDA' }, connection), /já decidida com outros dados/);
      await assert.rejects(service.decideRecruitmentApplication(reviewer, { ...input, decision: 'Outra motivação não substitui a original.' }, connection), /já decidida com outros dados/);
      assert.deepEqual(await fingerprint(db), committed);
    });

    await t.test('late decision audit failure restores RECEBIDA; historical source/decision/check/unique guards stay enabled', async () => {
      const noticeId = await service.saveRecruitmentNotice(reviewer, noticeInput('AUDIT_DECISION'), connection);
      const id = await service.submitRecruitmentApplication(employeeCandidate, applicationInput(noticeId), connection);
      const input = { id, status: 'INDEFERIDA' as const, decision: 'Requisitos obrigatórios não foram comprovados.' }, before = await fingerprint(db);
      await assert.rejects(service.decideRecruitmentApplication(faultActor, input, connection), failureMessage('recruitment fixture late audit failure'));
      assert.deepEqual(await fingerprint(db), before);
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`UPDATE "HrRecruitmentApplication" SET cpf='11144477735' WHERE id=${id}`)), databaseCode('P0001'));
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`UPDATE "HrRecruitmentApplication" SET status='DEFERIDA' WHERE id=${id}`)), databaseCode('P0001'));
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`UPDATE "HrRecruitmentApplication" SET status='INDEFERIDA',decision=${input.decision},"decidedById"=${reviewer.user.id},"decidedAt"=now()+interval '1 day' WHERE id=${id}`)), failureMessage('recruitment fixture decision must use transaction time'));
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`INSERT INTO "HrRecruitmentApplication" (id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,status,snapshot,"requestHash") VALUES ('bad-recruitment-status',${noticeId},'recruitment-reviewer','11144477735','ANALISTA',2,'INVALID','{}'::jsonb,'fixture')`)), databaseCode('23514'));
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`INSERT INTO "HrRecruitmentApplication" (id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,snapshot,"requestHash") VALUES ('duplicate-recruitment-number',${noticeId},'recruitment-reviewer','11144477735','ANALISTA',1,'{}'::jsonb,'fixture')`)), databaseCode('23505'));
      assert.deepEqual(await fingerprint(db), before);
      assert.equal(await service.decideRecruitmentApplication(reviewer, input, connection), id);
      const decided = await fingerprint(db);
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`UPDATE "HrRecruitmentApplication" SET decision='Alteração posterior indevida' WHERE id=${id}`)), databaseCode('P0001'));
      assert.deepEqual(await fingerprint(db), decided);
    });

    await t.test('explicit fixture connection prevents global fallback; executor reads observe uncommitted GED state on the same transaction', async () => {
      const before = await fingerprint(db);
      // Omission must reject on identity BEFORE resolving/acquiring the lazy
      // global pool. All positive mutations above pass this fixture connection.
      await assert.rejects(service.saveRecruitmentNotice(reviewer, noticeInput('CONNECTION')), /deve corresponder ao banco do contexto/);
      await assert.rejects(service.submitRecruitmentApplication(candidate, applicationInput('recruitment-public-final')), /deve corresponder ao banco do contexto/);
      await assert.rejects(service.decideRecruitmentApplication(reviewer, { id: 'unused', status: 'DEFERIDA', decision: 'Decisão que não deve alcançar outro banco.' }), /deve corresponder ao banco do contexto/);
      const rollback = new Error('recruitment GED transaction rollback');
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`UPDATE "Document" SET status='Inválido' WHERE id='recruitment-document'`);
        assert.deepEqual(await readInstitutionalRecruitmentVersions(tx, ['recruitment-final', 'recruitment-signed']), []);
        assert.equal((await service.listPublicRecruitmentNotices(tx)).length, 0);
        throw rollback;
      }), error => error === rollback);
      assert.deepEqual(await fingerprint(db), before);
    });

    assert.deepEqual((await fingerprint(db)).filter(row => ['Person', 'Employee'].includes(row.name)), canonicalBefore, 'recruitment preserves canonical person/employee identities');
  } finally { await fixture.close(); }
});
