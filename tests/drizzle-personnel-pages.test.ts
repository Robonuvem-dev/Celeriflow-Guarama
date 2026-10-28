import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { createSpecializedDrizzleFixture } from './helpers/specialized-drizzle-fixture';
import { withDatabaseTransaction, type DatabaseTransaction } from '../src/db/transaction';
import { Decimal } from '../src/db/decimal';
import type { PermissionUser } from '../src/lib/contracts/identity';
import { accessProfiles, users } from '../src/db/schema/identity';
import { employees, roles, secretariats, departments } from '../src/db/schema/administration';
import { people } from '../src/db/schema/people';
import { documents } from '../src/db/schema/registry';
import { systemInstances } from '../src/db/schema/instance-configuration';
import { planningBudgetUnits, planningEntityUnits } from '../src/db/schema/planning-budget';
import { governmentEntities, legalTexts, legalTextVersions } from '../src/db/schema/master-data';
import { financialYears } from '../src/db/schema/finance-years';
import { hrPayrollRuleSets, hrPayrollRules, hrEmploymentRegimes, hrPayrollRubrics, hrPayrollRubricIncidences, hrSocialSecuritySchemes, hrSocialSecurityBands } from '../src/db/schema/personnel-configuration';
import { hrEmploymentContracts, hrEmploymentRevisions, hrPayrollRuns, hrPayrollStatements, hrPortalRequests, hrIntegrationEvents, hrRightEntries, payrolls } from '../src/db/schema/personnel-workforce';
import { attendanceRecords, dependents } from '../src/db/schema/personnel-records';
import { hrConsignmentAgreements, hrConsignmentInstallments, hrConsignmentEntries } from '../src/db/schema/personnel-consignment';
import { documentVersions } from '../src/db/schema/document-workflow';
import { healthStandardDocuments } from '../src/db/schema/health-documents';
import { hrRoleLegalHistory } from '../src/db/schema/personnel-legal';
import { processTypes, processSubjects } from '../src/db/schema/processes';
import { readEmployeesPage, readDependentsPage, readAttendancePage, readEmployeeFormData } from '../src/db/repositories/personnel-pages/records';
import { readAdvancesPage, readTravelAllowancesPage, readGeneralRequestsPage, readFunctionalRequestsPage, readOccurrencesPage, readFunctionalPublicationsPage, readRecruitmentApplicationReview } from '../src/db/repositories/personnel-pages/requests';
import { readWorkforceOperations, readConsignmentsPage, readPublishedPayrollPage, readContractTimeline, readRunStatementsPage } from '../src/db/repositories/personnel-pages/workforce';
import { readFolderEmployee, readFolderPage } from '../src/db/repositories/personnel-pages/folder';
import { readRoleLegalYears, readRoleLegalHistoryPage } from '../src/db/repositories/personnel-pages/legal-history';
import { readInstanceRuleSets, readPayrollSettingsRuleSet, readPersonnelExternalReadiness } from '../src/db/repositories/personnel-pages/catalog';

const at = new Date('2099-10-20T12:34:56.789Z');
function actor(units: string[], administrator = false): PermissionUser {
  return { id: 'pages-user', firebaseUid: 'pages-user', email: 'pages@example.test', name: 'Fixture RH', role: 'RH', profileCode: administrator ? 'SYSTEM_ADMINISTRATOR' : 'RH', modulePermissions: [{ code: 'RH', canView: true, canEdit: true }], allowedBudgetUnitIds: units, employeeId: null, departmentId: null, secretariatId: null };
}

// Prepared for the parent's central run only. Full historical SQL, no ORM
// compatibility fixture, no DATABASE_URL and no remote persistence.
test('RH pages: golden scenarios through real Neon/Drizzle and historical PostgreSQL', { timeout: 180_000 }, async t => {
  const fixture = await createSpecializedDrizzleFixture();
  const rollback = new Error('personnel pages fixture rollback');
  try {
    await assert.rejects(withDatabaseTransaction(fixture.connection, async db => {
      await db.insert(accessProfiles).values({ id: 'pages-profile', codigo: 'PAGES_TEST', nome: 'Fixture RH', permissoes: '{}' });
      await db.insert(users).values({ id: 'pages-user', nome: 'Fixture RH', email: 'pages@example.test', perfilId: 'pages-profile' });
      await db.insert(secretariats).values([{ id: 's-a', name: 'Secretaria A' }, { id: 's-b', name: 'Secretaria B' }]);
      await db.insert(departments).values([{ id: 'd-a', name: 'Departamento A', secretariatId: 's-a' }, { id: 'd-b', name: 'Departamento B', secretariatId: 's-b' }]);
      await db.insert(planningBudgetUnits).values([{ id: 'u-a', code: '01', name: 'UG A', secretariatId: 's-a' }, { id: 'u-b', code: '02', name: 'UG B', secretariatId: 's-b' }]);
      await db.insert(governmentEntities).values([{ id: 'g-a', code: 'GA', name: 'Ente A', type: 'MUNICIPIO' }, { id: 'g-b', code: 'GB', name: 'Ente B', type: 'MUNICIPIO' }]);
      await db.insert(planningEntityUnits).values([{ budgetUnitId: 'u-a', governmentEntityId: 'g-a' }, { budgetUnitId: 'u-b', governmentEntityId: 'g-b' }]);
      await db.insert(roles).values({ id: 'role', name: 'Analista' });
      await db.insert(people).values({ id: 'person', fullName: 'Nome civil preservado' });
      await db.insert(employees).values([
        { id: 'e-a', name: 'Ana', registration: 'A-01', personId: 'person', secretariatId: 's-a', roleId: 'role', departmentId: 'd-a', createdAt: at },
        { id: 'e-b', name: 'Bia', registration: 'B-02', secretariatId: 's-b', isActive: false, createdAt: at },
        { id: 'e-c', name: 'Caio', registration: 'C-03', secretariatId: 's-a', createdAt: at },
      ]);
      await db.insert(systemInstances).values({ id: 'instance', nomePrefeitura: 'Fixture', municipio: 'Fixture', uf: 'PR' });
      await db.insert(hrPayrollRuleSets).values({ id: 'set', configuracaoInstanciaId: 'instance', code: 'TEST', name: 'Conjunto', status: 'ATIVA', effectiveFrom: at, scope: 'PRODUCAO', isDemo: false });
      await db.insert(hrEmploymentRegimes).values({ id: 'regime', ruleSetId: 'set', code: 'EFETIVO', name: 'Efetivo', employmentNature: 'EFETIVO' });
      const contract = { regimeId: 'regime', roleId: 'role', workLocation: 'Sede', admittedAt: at, salary: new Decimal('90071992547409.93'), createdAt: at, updatedAt: at };
      await db.insert(hrEmploymentContracts).values([
        { ...contract, id: 'c-a', employeeId: 'e-a', registration: 'C-A', details: { customFields: { FLAG: true, LABEL: 'A' } } },
        { ...contract, id: 'c-b', employeeId: 'e-b', registration: 'C-B', details: { customFields: { FLAG: 'true' } } },
      ]);
      await db.insert(payrolls).values([{ id: 'pay-legacy', competence: '10/2099' }, { id: 'pay-a', competence: '10/2099' }, { id: 'pay-b', competence: '10/2099' }]);
      await db.execute(sql`INSERT INTO "HrBudgetUnitEntityMapping" (id,"budgetUnitId","governmentEntityId","sourceReference","createdById") VALUES ('m-a','u-a','g-a','Fixture documented mapping','pages-user'),('m-b','u-b','g-b','Fixture documented mapping','pages-user')`);
      await db.execute(sql`INSERT INTO "SstBenefitPayrollScope" ("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES ('pay-a','u-a','g-a','10/2099','pages-user'),('pay-b','u-b','g-b','10/2099','pages-user')`);
      await db.insert(hrPayrollRuns).values(['legacy', 'a', 'b'].map(suffix => ({ id: `r-${suffix}`, payrollId: `pay-${suffix}`, requestKey: `run-${suffix}`, mode: 'OFICIAL', scope: 'PRODUCAO', status: 'FECHADA', ruleSetId: 'set', snapshot: { sourceDate: '2099-10-20' }, gross: new Decimal('90071992547409.93'), deductions: new Decimal(0), net: new Decimal('90071992547409.93'), employer: new Decimal(0), actorId: 'pages-user', createdAt: at })));

      // Roll back a failed scenario before node:test records its rejection. A
      // PostgreSQL error must not leave the shared outer transaction aborted.
      const scenario = (name: string, operation: (tx: DatabaseTransaction) => Promise<void>) => t.test(name, () => db.transaction(operation));

      await scenario('filters, count/page bounds, optional relations and native Date remain intact', async db => {
        const filtered = await readEmployeesPage(db, { q: 'a', status: 'active', departmentId: 'all', page: '999' });
        assert.deepEqual(filtered.employees.map(row => row.id), ['e-a', 'e-c']);
        assert.equal(filtered.total, 2); assert.equal(filtered.pagination.page, 1);
        assert.equal(filtered.employees[0].role?.name, 'Analista');
        assert.equal(filtered.employees[1].role, null); assert.equal(filtered.employees[1].department, null);
        assert.equal(filtered.employees[0].createdAt.toISOString(), at.toISOString());
        await db.insert(dependents).values({ id: 'dependent', employeeId: 'e-a', name: 'Filha', relationship: 'FILHA', birthDate: at });
        const found = await readDependentsPage(db, { q: 'ana' });
        assert.deepEqual(found.dependents.map(row => [row.id, row.employee.name]), [['dependent', 'Ana']]);
        assert.equal((await readEmployeeFormData(db, 'e-a'))?.dependents[0].birthDate?.toISOString(), at.toISOString());
        const first = new Date(2099, 9, 1), end = new Date(2099, 10, 0);
        await db.insert(attendanceRecords).values([{ id: 'first', employeeId: 'e-a', date: first }, { id: 'last', employeeId: 'e-a', date: end }, { id: 'after', employeeId: 'e-a', date: new Date(end.getTime() + 1) }]);
        assert.deepEqual((await readAttendancePage(db, { month: '2099-10' })).records.map(row => row.id), ['last', 'first']);
      });

      await scenario('JSON scope, empty units, ascending queues and kind exclusions match SSR', async db => {
        await db.insert(hrPortalRequests).values([
          { id: 'advance-a', employeeId: 'e-a', requestKey: 'aa', kind: 'ADIANTAMENTO', payload: { input: { budgetUnitId: 'u-a' } }, actorId: 'pages-user', createdAt: at },
          { id: 'advance-b', employeeId: 'e-b', requestKey: 'ab', kind: 'ADIANTAMENTO', payload: { input: { budgetUnitId: 'u-b' } }, actorId: 'pages-user', createdAt: at },
          { id: 'advance-null', employeeId: 'e-a', requestKey: 'an', kind: 'ADIANTAMENTO', payload: { input: { budgetUnitId: null } }, actorId: 'pages-user', createdAt: at },
          { id: 'hidden-kind', employeeId: 'e-a', requestKey: 'hk', kind: 'ACESSO_PORTAL', payload: {}, actorId: 'pages-user', createdAt: at },
          { id: 'functional', employeeId: 'e-a', requestKey: 'fr', kind: 'FUNCIONAL_SOLICITACAO_RH', payload: { origin: 'REQUERIMENTO_FUNCIONAL', configuration: { budgetUnitId: 'u-a' } }, actorId: 'pages-user', createdAt: at },
        ]);
        assert.deepEqual((await readAdvancesPage(db, actor(['u-a']))).rows.map(row => row.id), ['advance-a']);
        assert.equal((await readAdvancesPage(db, actor([]))).total, 0);
        assert.equal((await readAdvancesPage(db, actor([], true))).total, 3);
        assert.deepEqual((await readGeneralRequestsPage(db, actor(['u-a']), 'EM_ANALISE')).rows.map(row => row.id), ['advance-a', 'advance-null']);
        assert.deepEqual((await readFunctionalRequestsPage(db, actor(['u-a']), 'EM_ANALISE')).rows.map(row => row.id), ['functional']);
        assert.equal((await readFunctionalRequestsPage(db, actor([]), 'EM_ANALISE')).total, 0);
        await db.insert(hrPortalRequests).values(Array.from({ length: 23 }, (_, index) => ({ id: `queue-${String(index).padStart(2, '0')}`, employeeId: 'e-a', requestKey: `queue-${index}`, kind: 'GERAL', status: 'DEFERIDA', payload: {}, actorId: 'pages-user', createdAt: at })));
        const last = await readGeneralRequestsPage(db, actor(['u-a']), 'DEFERIDA', '999');
        assert.equal(last.total, 23); assert.equal(last.page, 2);
        assert.deepEqual(last.rows.map(row => row.id), ['queue-20', 'queue-21', 'queue-22']);
        await db.insert(hrIntegrationEvents).values({ id: 'publication', sourceKey: 'pub', domain: 'PORTAL', environment: 'PRODUCAO', eventType: 'DOCUMENTO_FUNCIONAL_DISPONIBILIZADO', payload: { budgetUnitId: 'u-a' }, payloadHash: 'a'.repeat(64), createdAt: at });
        assert.equal((await readFunctionalPublicationsPage(db, actor(['u-a']))).events[0].createdAt.toISOString(), at.toISOString());
        assert.equal((await readFunctionalPublicationsPage(db, actor([]))).total, 0);
      });

      await scenario('published workflow some/every and active ordered subjects preserve empty-stage case', async db => {
        await db.insert(processTypes).values(['allowed', 'mixed', 'empty', 'draft'].map(id => ({ id, name: id, genericWorkflowEnabled: true })));
        await db.execute(sql`INSERT INTO "GenericProcessWorkflowDefinition" (id,"processTypeId",version,status,"updatedAt") VALUES ('w-allowed','allowed',1,'DRAFT',CURRENT_TIMESTAMP),('w-mixed','mixed',1,'DRAFT',CURRENT_TIMESTAMP),('w-empty','empty',1,'DRAFT',CURRENT_TIMESTAMP),('w-draft','draft',1,'DRAFT',CURRENT_TIMESTAMP)`);
        await db.execute(sql`INSERT INTO "GenericProcessWorkflowStage" (id,"definitionId",position,label,"departmentId","slaCalendarDays") VALUES ('wa','w-allowed',1,'A','d-a',1),('wm1','w-mixed',1,'A','d-a',1),('wm2','w-mixed',2,'B','d-b',1)`);
        await db.execute(sql`UPDATE "GenericProcessWorkflowDefinition" SET status='PUBLISHED',"publishedAt"=CURRENT_TIMESTAMP,"publishedByUsuarioId"='pages-user',"updatedAt"=CURRENT_TIMESTAMP WHERE id IN ('w-allowed','w-mixed','w-empty')`);
        await db.insert(processSubjects).values([{ id: 'subject-z', name: 'Z', processTypeId: 'allowed' }, { id: 'subject-a', name: 'A', processTypeId: 'allowed' }, { id: 'subject-off', name: 'Inativo', processTypeId: 'allowed', isActive: false }]);
        const result = await readTravelAllowancesPage(db, actor(['u-a']));
        assert.deepEqual(result.processTypes.map(row => row.id), ['allowed', 'empty']);
        assert.deepEqual(result.processTypes[0].subjects.map(row => row.id), ['subject-a', 'subject-z']);
        assert.deepEqual((await readTravelAllowancesPage(db, actor([]))).processTypes.map(row => row.id), ['empty']);
      });

      await scenario('typed custom JSON, exact numeric, legacy payroll visibility and published statements', async db => {
        const input = { tab: 'contratos', q: '', customCode: 'FLAG', customValue: 'true', customType: 'BOOLEANO', customFilterError: '', payrollId: '', id: '', page: '1' };
        const boolean = await readWorkforceOperations(db, actor(['u-a']), input);
        assert.deepEqual(boolean.contracts.map(row => row.id), ['c-a']);
        assert.equal(boolean.contracts[0].salary.toFixed(2), '90071992547409.93');
        assert.equal(boolean.contracts[0].admittedAt.toISOString(), at.toISOString());
        assert.deepEqual((await readWorkforceOperations(db, actor(['u-a']), { ...input, customType: 'TEXTO' })).contracts.map(row => row.id), ['c-b']);
        assert.equal((await readWorkforceOperations(db, actor(['u-a']), { ...input, customFilterError: 'Inválido' })).total, 0);
        assert.deepEqual((await readWorkforceOperations(db, actor(['u-a']), { ...input, tab: 'calculos' })).runs.map(row => row.id), ['r-a', 'r-legacy']);
        assert.deepEqual((await readWorkforceOperations(db, actor([]), { ...input, tab: 'calculos' })).runs.map(row => row.id), ['r-legacy']);
        await db.insert(hrPayrollStatements).values(['legacy', 'a', 'b'].map(suffix => ({ id: `statement-${suffix}`, runId: `r-${suffix}`, contractId: 'c-a', snapshot: sql`'null'::jsonb`, gross: new Decimal('90071992547409.93'), deductions: new Decimal(0), net: new Decimal('90071992547409.93'), employer: new Decimal(0), releaseAt: at })));
        const published = await readPublishedPayrollPage(db, actor(['u-a']));
        assert.deepEqual(published.statements.map(row => row.id), ['statement-a', 'statement-legacy']);
        assert.equal(published.statements[0].releaseAt?.toISOString(), at.toISOString());
        assert.equal(published.statements[0].contract.employee.name, 'Ana');
        const run = await readRunStatementsPage(db, 'r-a');
        assert.equal(run.statements[0].net.toFixed(2), '90071992547409.93');
        assert.equal(run.statements[0].snapshot, null);
        await db.insert(hrEmploymentRevisions).values({ id: 'rev', contractId: 'c-a', version: 1, effectiveFrom: at, snapshot: { salary: '90071992547409.93', date: '2099-10-20' }, actorId: 'pages-user', reason: 'Inicial' });
        assert.equal((await readContractTimeline(db, 'c-a')).revisions[0].effectiveFrom.toISOString(), at.toISOString());
      });

      await scenario('installment/entry joins preserve order, compensatory history, exact values and Date', async db => {
        await db.execute(sql`INSERT INTO "Supplier" (id,"updatedAt") VALUES ('supplier',CURRENT_TIMESTAMP)`);
        await db.insert(hrConsignmentAgreements).values({ id: 'agreement', sourceKey: 'agreement', contractId: 'c-a', supplierId: 'supplier', sourceRunId: 'r-a', scope: 'PRODUCAO', number: 'CON-01', rubricCode: 'CONS', snapshot: {}, actorId: 'pages-user' });
        await db.insert(hrConsignmentInstallments).values([{ id: 'inst-2', agreementId: 'agreement', sequence: 2, competenceAt: new Date('2099-11-01T00:00:00Z'), amount: new Decimal('90071992547409.93') }, { id: 'inst-1', agreementId: 'agreement', sequence: 1, competenceAt: new Date('2099-10-01T00:00:00Z'), amount: new Decimal('0.01') }]);
        await db.insert(hrConsignmentEntries).values([{ id: 'reserve', installmentId: 'inst-1', sourceKey: 'reserve', kind: 'RESERVA', amount: new Decimal('0.01'), reason: 'Reserva', actorId: 'pages-user', createdAt: at }, { id: 'cancel', installmentId: 'inst-1', sourceKey: 'cancel', kind: 'CANCELAMENTO', amount: new Decimal('-0.01'), reason: 'Cancelamento', actorId: 'pages-user', createdAt: at }]);
        const result = await readConsignmentsPage(db, actor(['u-a']), 'ana');
        assert.equal(result.total, 1); assert.equal(result.rows[0].contract.employee.name, 'Ana');
        assert.deepEqual(result.rows[0].installments.map(row => row.sequence), [1, 2]);
        assert.equal(result.rows[0].installments[1].amount.toFixed(2), '90071992547409.93');
        assert.equal(result.rows[0].installments[0].competenceAt.toISOString(), '2099-10-01T00:00:00.000Z');
        assert.deepEqual(result.rows[0].installments[0].entries.map(row => row.kind).sort(), ['CANCELAMENTO', 'RESERVA']);
        assert.equal(result.rows[0].installments[0].entries[0].createdAt.toISOString(), at.toISOString());
        assert.equal((await readConsignmentsPage(db, actor([]), '')).total, 0);
      });

      await scenario('functional folder preserves person name, permission gate, clinical exclusions and cancellation', async db => {
        await db.insert(documents).values([{ id: 'doc-visible', title: 'Cadastro', documentType: 'Cadastro', fileUrl: '/fixture', personId: 'person', status: 'Válido', validUntil: at }, { id: 'doc-standard', title: 'Modelo clínico', documentType: 'Modelo', fileUrl: '/fixture', personId: 'person', status: 'Válido' }]);
        await db.insert(healthStandardDocuments).values({ id: 'standard', documentId: 'doc-standard', category: 'FIXTURE', moduleCode: 'SAUDE', addedByUsuarioId: 'pages-user' });
        assert.equal((await readFolderEmployee(db, 'e-a')).person?.fullName, 'Nome civil preservado');
        const filter = { id: 'e-a', personId: 'person', tab: 'documentos', q: '', documentsAllowed: true };
        const result = await readFolderPage(db, filter);
        assert.deepEqual(result.documents.map(row => row.id), ['doc-visible']);
        assert.equal(result.documents[0].validUntil?.toISOString(), at.toISOString());
        assert.equal((await readFolderPage(db, { ...filter, documentsAllowed: false })).total, 0);
        await db.insert(hrRightEntries).values({ id: 'right', contractId: 'c-a', sourceKey: 'right', kind: 'FERIAS', periodStart: at, periodEnd: at, quantity: new Decimal('-1.1234'), amount: new Decimal('0.01'), details: sql`'null'::jsonb`, actorId: 'pages-user' });
        assert.equal((await readFolderPage(db, { ...filter, tab: 'direitos' })).rights[0].quantity.toFixed(4), '-1.1234');
        await db.insert(hrIntegrationEvents).values([{ id: 'occurrence', sourceKey: 'occurrence', domain: 'RH', environment: 'PRODUCAO', eventType: 'OCORRENCIA_FUNCIONAL_REGISTRADA', payload: { employeeId: 'e-a', input: { contractId: 'c-a', type: 'ELOGIO' } }, payloadHash: 'a'.repeat(64), createdAt: at }, { id: 'cancellation', sourceKey: 'OCORRENCIA:CANCELAMENTO:occurrence', domain: 'RH', environment: 'PRODUCAO', eventType: 'CANCELAMENTO', payload: { reason: 'Fundamentação' }, payloadHash: 'b'.repeat(64), createdAt: at }]);
        const occurrences = await readOccurrencesPage(db, { contractId: 'c-a', type: 'ELOGIO' });
        assert.equal(occurrences.rows[0].createdAt.toISOString(), at.toISOString());
        assert.equal(occurrences.cancellations[0].sourceKey, 'OCORRENCIA:CANCELAMENTO:occurrence');
        assert.equal((await readFolderPage(db, { ...filter, tab: 'ocorrencias' })).occurrences[0].id, 'occurrence');
      });

      await scenario('legal entity/year scope, final document versions, immutable event ordering and max-version groups', async db => {
        await db.insert(financialYears).values([{ id: 'year-a', year: 2099, governmentEntityId: 'g-a', startDate: at, endDate: at }, { id: 'year-b', year: 2099, governmentEntityId: 'g-b', startDate: at, endDate: at }]);
        await db.insert(documents).values({ id: 'legal-doc', title: 'Ato', documentType: 'Ato', fileUrl: '/legal', status: 'Válido' });
        await db.insert(documentVersions).values([{ id: 'legal-v1', documentId: 'legal-doc', versionNumber: 1, fileUrl: '/legal', hashSha256: 'a'.repeat(64), status: 'FINAL' }, { id: 'legal-v2', documentId: 'legal-doc', versionNumber: 2, fileUrl: '/legal2', hashSha256: 'b'.repeat(64), status: 'SIGNED' }]);
        await db.insert(legalTexts).values({ id: 'legal', type: 'ATO', number: '01', summary: 'Fixture', governmentLevel: 'MUNICIPAL', issuingBody: 'Fixture', governmentEntityId: 'g-a' });
        await db.insert(legalTextVersions).values({ id: 'legal-text-v1', legalTextId: 'legal', versionNumber: 1, content: 'Fixture', documentId: 'legal-doc' });
        const base = { governmentEntityId: 'g-a', roleId: 'role', state: 'EXISTING', designation: 'Analista', authorizedSeats: 2, legalReference: 'Ato 01', legalTextVersionId: 'legal-text-v1', documentId: 'legal-doc', documentVersionId: 'legal-v1', documentHash: 'a'.repeat(64), documentFileUrl: '/legal', reason: 'Registro inicial', actorUsuarioId: 'pages-user', requestHash: 'c'.repeat(64) };
        await db.insert(hrRoleLegalHistory).values({ ...base, id: 'history-1', effectiveFrom: at, version: 1, idempotencyKey: 'legal-1' });
        await db.insert(hrRoleLegalHistory).values({ ...base, id: 'history-2', effectiveFrom: new Date('2099-10-21T12:34:56.789Z'), version: 2, previousEventId: 'history-1', idempotencyKey: 'legal-2' });
        assert.deepEqual((await readRoleLegalYears(db, actor(['u-a']))).map(row => row.id), ['year-a']);
        assert.equal((await readRoleLegalYears(db, actor([]))).length, 0);
        const result = await readRoleLegalHistoryPage(db, 'g-a', undefined, 1);
        assert.deepEqual(result.history.map(row => row.id), ['history-2', 'history-1']);
        assert.equal(result.history[1].effectiveFrom.toISOString(), at.toISOString());
        assert.equal(result.count, 2); assert.deepEqual(result.latest, [{ roleId: 'role', _max: { version: 2 } }]);
        assert.deepEqual(result.acts[0].document?.versions.map(row => row.id), ['legal-v2', 'legal-v1']);
        assert.equal((await readRoleLegalHistoryPage(db, 'g-b', undefined, 1)).count, 0);
      });

      await scenario('settings nested ordering, decimal rates/nulls, oldest instance and readiness fallbacks', async db => {
        await db.insert(hrPayrollRubrics).values({ id: 'rubric', ruleSetId: 'set', code: '01', name: 'Base', type: 'PROVENTO', fixedValue: new Decimal('90071992547409.93'), percentageRate: new Decimal('1.123456') });
        await db.insert(hrPayrollRubricIncidences).values([{ rubricId: 'rubric', incidenceType: 'Z' }, { rubricId: 'rubric', incidenceType: 'A' }]);
        await db.insert(hrSocialSecuritySchemes).values({ id: 'scheme', ruleSetId: 'set', code: 'RGPS', name: 'RGPS', regime: 'RGPS', ceilingValue: new Decimal('1.01') });
        await db.insert(hrSocialSecurityBands).values([{ socialSecuritySchemeId: 'scheme', sequence: 2, lowerLimit: new Decimal('2.00'), employeeRate: new Decimal('9.000001') }, { socialSecuritySchemeId: 'scheme', sequence: 1, lowerLimit: new Decimal('0.00'), employeeRate: new Decimal('7.500000') }]);
        await db.insert(hrPayrollRules).values({ ruleSetId: 'set', code: 'NULL', name: 'JSON null', category: 'TEST', valueType: 'JSON', value: sql`'null'::jsonb` });
        assert.equal((await readInstanceRuleSets(db)).instance?.id, 'instance');
        const settings = await readPayrollSettingsRuleSet(db, 'set', 'instance');
        assert.ok(settings); assert.equal(settings.calculationPolicy, null);
        assert.equal(settings.rules.find(rule => rule.code === 'NULL')?.value, null);
        assert.equal(settings.rubrics[0].fixedValue?.toFixed(2), '90071992547409.93');
        assert.equal(settings.rubrics[0].percentageRate?.toFixed(6), '1.123456');
        assert.deepEqual(settings.rubrics[0].incidences.map(row => row.incidenceType), ['A', 'Z']);
        assert.deepEqual(settings.socialSecuritySchemes[0].bands.map(row => row.sequence), [1, 2]);
        assert.equal(settings.socialSecuritySchemes[0].bands[0].upperLimit, null);
        assert.deepEqual((await readPersonnelExternalReadiness(db)).map(row => [row.environment, row.status, row.configured, row.transmissionAvailable]), [['PRODUCAO_RESTRITA', 'NAO_CONFIGURADO', false, false], ['PRODUCAO', 'NAO_CONFIGURADO', false, false]]);
      });
      await scenario('raw recruitment dates decode as UTC, while snapshot dates stay textual and scope/auth stay exact', async db => {
        await db.insert(hrPayrollRules).values(['a', 'b', 'numeric'].map(suffix => ({ id: `notice-${suffix}`, ruleSetId: 'set', code: `PORTAL_EDITAL_${suffix.toUpperCase()}`, name: `Edital ${suffix}`, category: 'PORTAL', valueType: 'JSON', value: {} })));
        await db.execute(sql`INSERT INTO "HrRecruitmentApplication" (id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,snapshot,"requestHash","createdAt","decidedAt") VALUES ('application-a','notice-a','pages-user','12345678901','ROLE',1,${JSON.stringify({ policy: { budgetUnitId: 'u-a', startsAt: '2099-10-20T12:34:56.789Z' }, birthDate: '2000-01-01' })}::jsonb,'fixture','2099-10-20 12:34:56.789'::timestamp,'2099-10-21 12:34:56.789'::timestamp),('application-b','notice-b','pages-user','12345678901','ROLE',1,'{"policy":{"budgetUnitId":"u-b"}}'::jsonb,'fixture','2099-10-20 12:34:56.789'::timestamp,NULL),('application-numeric','notice-numeric','pages-user','12345678901','ROLE',1,'{"policy":{"budgetUnitId":1}}'::jsonb,'fixture','2099-10-20 12:34:56.789'::timestamp,NULL)`);
        const result = await readRecruitmentApplicationReview(db, actor(['u-a']), 99);
        assert.equal(result.total, 1); assert.equal(result.page, 1);
        assert.equal(result.rows[0].createdAt.toISOString(), '2099-10-20T12:34:56.789Z');
        assert.equal(result.rows[0].decidedAt?.toISOString(), '2099-10-21T12:34:56.789Z');
        assert.deepEqual(result.rows[0].snapshot, { policy: { budgetUnitId: 'u-a', startsAt: '2099-10-20T12:34:56.789Z' }, birthDate: '2000-01-01' });
        assert.deepEqual((await readRecruitmentApplicationReview(db, actor(['1']))).rows.map(row => row.id), ['application-numeric']);
        assert.equal((await readRecruitmentApplicationReview(db, actor([]))).total, 0);
        assert.equal((await readRecruitmentApplicationReview(db, actor([], true))).total, 3);
        assert.equal((await readRecruitmentApplicationReview(db, actor(['u-b']))).rows[0].decidedAt, null);
        await assert.rejects(readRecruitmentApplicationReview(db, { ...actor(['u-a']), modulePermissions: [] }), /Sem autorização para analisar inscrições/);
      });
      throw rollback;
    }, { isolationLevel: 'repeatable read', timeoutMs: 120_000 }), error => error === rollback);
    assert.equal((await fixture.connection.db.select().from(employees).where(eq(employees.id, 'e-a'))).length, 0);
  } finally {
    await fixture.close();
  }
});
