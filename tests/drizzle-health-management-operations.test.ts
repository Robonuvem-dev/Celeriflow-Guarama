import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import originalReportFingerprints from "./fixtures/health-management-original-report-fingerprints.json";

const serviceFiles = ["health-merge-service", "health-report-extra", "health-report-service", "vigilance-service"].map(name => `src/lib/saude/${name}.ts`);
const runtimeFiles = [...serviceFiles, "src/lib/contracts/health-management-operations.ts", "src/db/schema/health-management-operations.ts", ...readdirSync("src/db/repositories/health-management-operations").filter(f => f.endsWith(".ts")).map(f => `src/db/repositories/health-management-operations/${f}`)];

test("AST: quatro serviços sem client legado e saídas de relatórios idênticas ao original", () => {
  for (const file of runtimeFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /@prisma|\bPrisma\b|\bprisma\b|\$transaction|\$queryRaw|\$executeRaw|as unknown as|as any|new Proxy/);
    const parsed = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } });
    assert.deepEqual(parsed.diagnostics, [], file);
  }
  const expected = originalReportFingerprints.reports;
  for (const [name, baseline] of Object.entries(expected)) {
    const ast = ts.createSourceFile(name, readFileSync(`src/lib/saude/${name}.ts`, "utf8"), ts.ScriptTarget.Latest, true);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }), returns: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isReturnStatement(node)) {
        const result = ts.transform(node, [context => {
          const strip: ts.Visitor = n => ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) ? ts.visitNode(n.expression, strip) : ts.visitEachChild(n, strip, context);
          return n => ts.visitNode(n, strip, ts.isReturnStatement)!;
        }]);
        returns.push(printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], ast));
        result.dispose();
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(returns.length, baseline.count);
    assert.equal(createHash("sha256").update(JSON.stringify(returns)).digest("hex"), baseline.hash);
  }
});

test("Saúde gestão: histórico integral, relatórios, merge e vigilância no transporte Neon/Drizzle", { timeout: 240_000 }, async t => {
  const { createHealthManagementOperationsFixture, managementPatientLinkTables, managementChangedTables, managementProtectedTables } = await import("./helpers/health-management-operations-fixture");
  const fixture = await createHealthManagementOperationsFixture();
  const { db, context, connection } = fixture;
  try {
    const { eq, sql } = await import("drizzle-orm");
    const { withDatabaseTransaction } = await import("../src/db/transaction");
    const { Decimal } = await import("../src/db/decimal");
    const { databaseTimestamp } = await import("../src/db/temporal");
    const { healthAdministrativeReportDefinition: definition, healthReportFilename } = await import("../src/lib/saude/health-report-service");
    const { healthAdministrativeReportOptions } = await import("../src/lib/saude/health-report-catalog");
    const { createExtendedRows } = await import("../src/lib/saude/health-report-extra");
    const { executeHealthAdministrativeMerge } = await import("../src/lib/saude/health-merge-service");
    const vigilance = await import("../src/lib/saude/vigilance-service");
    const tables = await import("../src/db/schema/health-management-operations");
    const { patients, healthPatientRegistrations, healthPatientDocuments } = await import("../src/db/schema/health-registration");
    const { addresses } = await import("../src/db/schema/registry");
    const { healthProfessionals, healthProfessionalAssignments } = await import("../src/db/schema/health-workforce");
    const { medicalRecords } = await import("../src/db/schema/health-care");
    const { planningAppropriations } = await import("../src/db/schema/planning-budget");
    const report = (reportType: Parameters<typeof definition.createDataset>[1]["reportType"], input: Omit<Parameters<typeof definition.createDataset>[1], "reportType"> = {}) => definition.createDataset(context, { reportType, ...input });
    const rows = async (type: Parameters<typeof report>[0], input: Parameters<typeof report>[1] = {}) => (await report(type, input)).report.sections[0].rows;
    const hasCause = (error: unknown, pattern: RegExp): boolean => error instanceof Error && (pattern.test(error.message) || hasCause(error.cause, pattern));
    const rollback = new Error("HMO_ROLLBACK_TEST");
    const actor = { actorUsuarioId: context.user.id };

    await t.test("156 SQLs, temporais UTC, numeric exato, Float e despesa sentinela", async () => {
      assert.equal(fixture.migrationCount, 156);
      const { getTableConfig } = await import("drizzle-orm/pg-core");
      const normalizeType = (value: string) => value.replace(/timestamp\s*\((\d+)\)(?: without time zone)?/g, "timestamp($1)").replace(/numeric\((\d+),\s*(\d+)\)/g, "numeric($1,$2)");
      // The installed history is the CI oracle: no private/worktree metadata.
      for (const table of Object.values(tables)) {
        const config = getTableConfig(table);
        const physical = await db.execute<{ name: string; type: string; notNull: boolean }>(sql`select a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as "notNull" from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=current_schema() and c.relname=${config.name} and a.attnum>0 and not a.attisdropped order by a.attnum`);
        for (const column of config.columns) {
          const installed = physical.rows.find(c => c.name === column.name);
          assert.ok(installed, `${config.name}.${column.name}`);
          assert.equal(normalizeType(installed.type), normalizeType(column.getSQLType()), `${config.name}.${column.name}`);
          assert.equal(installed.notNull, column.notNull, `${config.name}.${column.name}`);
        }
      }
      const [record] = await db.select().from(medicalRecords).where(eq(medicalRecords.id, "hmo-record"));
      assert.equal(record.date.toISOString(), "2026-05-10T14:15:16.789Z");
      assert.deepEqual(record.careContextSnapshot, { clinical: { version: 1, private: true }, items: [1, null, "texto"] });
      const [expense] = await db.select().from(planningAppropriations).where(eq(planningAppropriations.id, "hmo-expense"));
      assert.equal(expense.initialValueDecimal?.toFixed(2), "123456789012345.67");
      assert.equal(expense.committedValue, 0.125);
      const raw = await db.execute<{ value: string; at: string | Date }>(sql`select "initialValueDecimal"::text as value, '2026-05-10 14:15:16.789'::timestamp as at from "BudgetAppropriation" where id='hmo-expense'`);
      assert.equal(new Decimal(raw.rows[0].value).toFixed(2), "123456789012345.67");
      assert.equal(databaseTimestamp(raw.rows[0].at).toISOString(), "2026-05-10T14:15:16.789Z");
    });

    let establishmentId: string, licenseId: string;
    await t.test("Vigilância: cadastro explícito, anonimato, constatações independentes, status e vigência", async () => {
      const establishment = await vigilance.saveEstablishment(context, { name: "Mercado Saúde", document: "HMO-DOC", cnae: "4711", riskLevel: "Alto" });
      establishmentId = establishment.id;
      const replay = await vigilance.saveEstablishment(context, { name: "Mercado Saúde atualizado", document: "HMO-DOC", cnae: "4711", riskLevel: "Alto" });
      assert.deepEqual(replay, establishment);
      assert.equal((await db.select().from(tables.managementVigilanceLicenses)).length, 0);
      await assert.rejects(vigilance.saveEstablishment(context, { name: "Inválido", companyId: "missing" }), /Empresa não encontrada/);
      await assert.rejects(vigilance.saveComplaint(context, { establishmentId, description: "Descrição detalhada", isAnonymous: true, reporterPersonId: "hmo-reporter" }), /anônima/);
      await assert.rejects(vigilance.saveComplaint(context, { establishmentId, description: "Descrição detalhada", isAnonymous: false }), /exige o denunciante/);
      const complaint = await vigilance.saveComplaint(context, { establishmentId, description: "Descrição detalhada anônima", isAnonymous: true });
      const identified = await vigilance.saveComplaint(context, { place: "Local identificado", description: "Descrição detalhada identificada", isAnonymous: false, reporterPersonId: "hmo-reporter" });
      assert.deepEqual(await vigilance.transitionComplaint(context, complaint.id, " Em apuração "), complaint);
      const inspection = await vigilance.saveInspection(context, { establishmentId, complaintId: identified.id, professionalId: "hmo-prof-source", inspectedAt: "2026-05-10T14:15:16.789Z", findings: "Achados originais", items: [{ description: "Higiene", result: "Conforme" }, { description: "Acondicionamento", result: "Não conforme" }] });
      await vigilance.transitionInspection(context, inspection.id, "Com pendências");
      const newInspection = await vigilance.saveInspection(context, { establishmentId, inspectedAt: "2026-05-11T14:15:16.789Z" });
      const [fresh] = await db.select().from(tables.managementVigilanceInspections).where(eq(tables.managementVigilanceInspections.id, newInspection.id));
      assert.equal(fresh.findings, null);
      assert.equal(fresh.status, "Realizada");
      const license = await vigilance.issueLicense(context, { establishmentId, licenseNumber: " hmo-alv-01 ", validFrom: "2026-01-01", validUntil: "2026-12-31" });
      licenseId = license.id;
      const [issued] = await db.select().from(tables.managementVigilanceLicenses).where(eq(tables.managementVigilanceLicenses.id, licenseId));
      assert.equal(issued.licenseNumber, "HMO-ALV-01");
      assert.equal(issued.validFrom.toISOString(), "2026-01-01T00:00:00.000Z");
      assert.equal(issued.validUntil.toISOString(), "2026-12-31T00:00:00.000Z");
      await assert.rejects(vigilance.issueLicense(context, { establishmentId, licenseNumber: "HMO-ALV-01", validFrom: "2026-01-01", validUntil: "2026-12-31" }), /já utilizado/);
      await vigilance.transitionLicense(context, licenseId, "Suspenso");
      for (const operation of [() => vigilance.transitionComplaint(context, complaint.id, "inválido"), () => vigilance.transitionInspection(context, inspection.id, "inválido"), () => vigilance.transitionLicense(context, licenseId, "inválido")]) await assert.rejects(operation, /Situação inválida/);
      assert.equal((await rows("VIGREP_INSPECTIONS")).find(r => r.Achados === "Achados originais")?.NãoConformidades, 1);
      const complaints = await report("VIGREP_COMPLAINTS");
      assert.equal(complaints.report.sections[0].rows.length, 2);
      assert.doesNotMatch(JSON.stringify(complaints), /hmo-reporter|Identidade sigilosa/);
    });

    await t.test("todos os relatórios e comprovantes públicos preservam estrutura e leitura sem efeitos", async () => {
      const before = await fixture.snapshot([...managementChangedTables, ...managementProtectedTables]);
      const recordIds: Record<string, string> = { DOC_DISPENSATION: "hmo-disp", DOC_TRANSFER_RECEIPT: "HMO-PEDIDO", DOC_APPOINTMENT: "hmo-appointment", DOC_LAB_COLLECTION: "HMO-AMOSTRA", DOC_REGULATION_GUIDE: "HMO-GUIA", DOC_REGULATION_SCHEDULE: "hmo-regulation", DOC_TFD_LIST: "hmo-trip", DOC_TFD_PUBLIC: "hmo-trip", DOC_TFD_AUTH: "hmo-tfd-request", DOC_PA_BAU: "hmo-record", DOC_PA_DISCHARGE: "hmo-record", DOC_PATIENT_CARD: "543210987654321", DOC_LICENSE: "HMO-ALV-01" };
      for (const option of healthAdministrativeReportOptions) {
        const result = await report(option.type, { recordId: recordIds[option.type] });
        assert.equal(result.reportType, option.type);
        assert.equal(result.requirement, option.requirement);
        assert.equal(result.report.title, option.label);
        assert.equal(result.report.metadata.publicSnapshotEligible, false);
        assert.equal(result.report.sections.length, 1);
        for (const row of result.report.sections[0].rows) for (const value of Object.values(row)) assert.ok(typeof value === "string" || typeof value === "number", option.type);
        assert.deepEqual(definition.auditTarget(result), { targetType: "HEALTH_ADMINISTRATIVE_REPORT", targetId: option.requirement });
        assert.equal(healthReportFilename(option.type, "CSV"), `saude-${option.type.toLowerCase().replace(/_/g, "-")}.csv`);
      }
      assert.deepEqual(await fixture.snapshot([...managementChangedTables, ...managementProtectedTables]), before);
    });

    await t.test("escopo vazio/seleção proibida, filtros de período, vínculo e recortes clínicos", async () => {
      await assert.rejects(report("UNIT_LIST", { unitId: "hmo-u2" }), /fora do seu escopo/);
      await assert.rejects(report("UNIT_LIST", { from: "2026-06-01", to: "2026-05-01" }), /anterior ao final/);
      const empty = { ...context, user: { ...context.user, allowedHealthUnitIds: [] } };
      assert.deepEqual((await definition.createDataset(empty, { reportType: "UNIT_LIST" })).report.sections[0].rows, []);
      const appointmentRows = await rows("AGENDA_MISSED", { from: "2026-05-10", to: "2026-05-10", professionalId: "hmo-prof-source", specialtyId: "hmo-sp1", query: "ana" });
      assert.equal(appointmentRows.length, 1);
      assert.equal(appointmentRows[0].Data, "10/05/2026");
      assert.equal(appointmentRows[0].Paciente, "ANA SAUDE");
      assert.deepEqual(await rows("AGENDA_MISSED", { from: "2026-05-11", to: "2026-05-11" }), []);
      assert.equal((await rows("LABREP_QTY"))[0].Quantidade, 1); // collection unit grants access despite the other request unit.
      assert.equal((await rows("PROFESSIONALS_BY_SPECIALTY", { specialtyId: "hmo-sp2" })).length, 1);
      assert.equal((await rows("EXTERNAL_DEMAND_BY_SPECIALTY"))[0].Município, "Cascavel");
      assert.equal((await rows("ATTENDANCE_PERCENTAGE_BY_CITY"))[0].Atendimentos, 1);
      assert.equal((await rows("PAREP_PROC_DAY"))[0].Quantidade, 3);
      assert.equal((await rows("PRODSTAT_PROC_GENERAL", { from: "2099-01-01", cid: "a00", procedure: "CLÍNICA" }))[0].Quantidade, 3); // historical no-date statistics.
      assert.deepEqual(await rows("PRODSTAT_PROC_GENERAL", { cid: "missing" }), []);
      await assert.rejects(report("DOC_APPOINTMENT", { recordId: "hmo-appointment-hidden" }), /fora do seu escopo/);
      await assert.rejects(report("DOC_PA_BAU", { recordId: "missing" }), /Atendimento não encontrado/);
      await assert.rejects(report("DOC_PATIENT_CARD"), /Informe o registro/);
    });

    await t.test("2000/5000/100 limites anteriores ao filtro textual e reader no tx injetado", async () => {
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`insert into "HealthAppointment" (id,date,"patientId","unitId",status,"updatedAt") select 'hmo-limit-'||n, '2026-05-21 12:00:00'::timestamp+make_interval(secs=>n),'hmo-target','hmo-u1','Faltou',now() from generate_series(1,5001) n`);
        await tx.execute(sql`insert into "HealthAppointment" (id,date,"patientId","unitId",status,"updatedAt") values ('hmo-limit-match','2026-05-20 12:00:00','hmo-hidden','hmo-u1','Faltou',now())`);
        const same = { ...context, database: tx };
        const limited = await createExtendedRows(same, { reportType: "AGENDA_MISSED", from: "2026-05-20", to: "2026-05-22" });
        assert.equal(limited?.rows.length, 2000);
        assert.deepEqual((await createExtendedRows(same, { reportType: "AGENDA_MISSED", from: "2026-05-20", to: "2026-05-22", query: "Pessoa fora" }))?.rows, []);
        const maps = await createExtendedRows(same, { reportType: "AGENDA_MAPS", from: "2026-05-20", to: "2026-05-22" });
        assert.equal(maps?.rows.filter(r => r.Mapa === "Por situação").reduce((n, r) => n + Number(r.Quantidade), 0), 5000);
        await tx.execute(sql`insert into "HealthEsusBatch" (id,competence,"fileContent",hash,total,"createdByUsuarioId","createdAt") select 'hmo-batch-'||n,'2026-05','arquivo','hash-'||n,1,'hmo-actor','2026-05-10'::timestamp+make_interval(secs=>n) from generate_series(1,101) n`);
        assert.equal((await createExtendedRows(same, { reportType: "SISREP_EXPORT" }))?.rows.length, 100);
        throw rollback;
      }, { timeoutMs: 60_000 }), e => e === rollback);
    });

    await t.test("TFD: exclusões confirmadas fora da lista permanecem no universo de autorização", async () => {
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        const { readManagementTfdTrips } = await import("../src/db/repositories/health-management-operations/report-regulation");
        await tx.execute(sql`insert into "HealthTfdPassenger" (id,"tripId","patientId") values ('hmo-passenger-excluded','hmo-trip','hmo-hidden')`);
        await tx.execute(sql`insert into "HealthTfdPassengerRemoval" (id,"passengerId","requestedByUsuarioId","confirmedByUsuarioId",status) values ('hmo-removal','hmo-passenger-excluded','hmo-actor','hmo-actor','Confirmada')`);
        assert.equal((await readManagementTfdTrips(tx, context.user, undefined, "hmo-trip")).length, 0);
        const [unscoped] = await readManagementTfdTrips(tx, { ...context.user, hasHealthAccessScope: false }, undefined, "hmo-trip");
        assert.equal(unscoped.passengers.length, 1);
        assert.equal(unscoped.passengers[0].id, "hmo-passenger");
        await tx.execute(sql`delete from "HealthTfdPassengerRemoval" where id='hmo-removal'`);
        await tx.execute(sql`update "HealthTfdPassenger" set "patientId"='hmo-target' where id='hmo-passenger-excluded'`);
        assert.equal((await readManagementTfdTrips(tx, context.user, undefined, "hmo-trip"))[0].passengers.length, 2);
        throw rollback;
      }), e => e === rollback);
    });

    await t.test("Decimal e Float nas saídas e CSV/planilha/PDF sem conteúdo clínico extra", async () => {
      const { readManagementCovenants, readManagementProcedures } = await import("../src/db/repositories/health-management-operations/report-administration");
      const { readManagementLabOrders } = await import("../src/db/repositories/health-management-operations/report-assistential");
      assert.equal((await readManagementCovenants(db, undefined))[0].totalValueDecimal.toFixed(2), "123456789012345.67");
      assert.equal((await readManagementProcedures(db, {}))[0].unitValue?.toFixed(2), "1234.56");
      assert.equal((await readManagementLabOrders(db, { recordId: "hmo-lab" }))[0].referenceValue, 0.125);
      assert.equal((await rows("PHARMACY_UNMET_DEMAND"))[0].Pendente, 2.5);
      assert.equal((await rows("PHARMACY_STOCK_POSITION"))[0].Saldo, 7.125);
      assert.equal((await rows("REGREP_COST"))[0].Valor, new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(12.34));
      const dataset = await report("VIGREP_COMPLAINTS");
      const { renderTabularCsv, renderTabularXlsx, renderTabularPrintHtml } = await import("../src/lib/reports/tabular-renderers");
      const csv = renderTabularCsv(dataset.report, dataset.presentation);
      assert.match(csv, /Anônima/);
      assert.doesNotMatch(csv, /hmo-reporter|Identidade sigilosa|Queixa clínica/);
      assert.match(renderTabularPrintHtml(dataset.report, dataset.presentation), /Denúncia/);
      assert.equal(Buffer.from(await renderTabularXlsx(dataset.report, dataset.presentation)).subarray(0, 2).toString(), "PK");
      const { generateReportPdf } = await import("../src/lib/financeiro/report-export");
      const pdf = await generateReportPdf(dataset.report, dataset.presentation);
      assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");
    });

    await t.test("merge paciente: 39 vínculos, JSON histórico, documentos e perfil preservados no mesmo tx", async () => {
      const before = await fixture.snapshot([...managementChangedTables, ...managementProtectedTables]);
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        const id = await executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-source", ...actor }, tx);
        const [history] = await tx.select().from(tables.managementAdministrativeMerges).where(eq(tables.managementAdministrativeMerges.id, id));
        assert.deepEqual(history.criteria, { sameName: true, sameBirthDate: true, sameMother: true });
        assert.deepEqual(history.sourceIds, ["hmo-source"]);
        assert.equal(history.actorUsuarioId, "hmo-actor");
        const result = history.result;
        assert.ok(result && !Array.isArray(result) && typeof result === "object");
        const moved = result.moved;
        assert.ok(moved && !Array.isArray(moved) && typeof moved === "object");
        assert.equal(Object.keys(moved).length, 39);
        assert.ok(Object.values(moved).every(n => n === 1), JSON.stringify(moved));
        for (const table of managementPatientLinkTables) {
          const remaining = await tx.execute<{ count: number }>(sql`select count(*)::integer as count from ${sql.identifier(table)} where "patientId"='hmo-source'`);
          assert.equal(remaining.rows[0].count, 0, table);
        }
        assert.equal((await tx.select().from(patients).where(eq(patients.id, "hmo-source")))[0].status, "Unificado");
        assert.equal((await tx.select().from(healthPatientRegistrations).where(eq(healthPatientRegistrations.patientId, "hmo-target")))[0].workplace, "Perfil principal");
        assert.equal((await tx.select().from(healthPatientRegistrations).where(eq(healthPatientRegistrations.patientId, "hmo-source")))[0].workplace, "Perfil origem");
        assert.equal((await tx.select().from(healthPatientDocuments).where(eq(healthPatientDocuments.id, "hmo-doc-duplicate-link")))[0].patientId, "hmo-source");
        assert.equal((await tx.select().from(healthPatientDocuments).where(eq(healthPatientDocuments.id, "hmo-doc-source-link")))[0].patientId, "hmo-target");
        const sourceProfile = result.preservedSourceProfile;
        assert.ok(sourceProfile && !Array.isArray(sourceProfile) && typeof sourceProfile === "object");
        assert.equal(typeof sourceProfile.reviewedAt, "string");
        await assert.rejects(executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-source", ...actor }, tx), /Prontuário ativo/);
        const locks = await tx.execute<{ count: number }>(sql`select count(*)::integer as count from pg_locks where pid=pg_backend_pid() and relation='"Patient"'::regclass and granted and mode='RowShareLock'`);
        assert.ok(locks.rows[0].count > 0);
        throw rollback;
      }, { timeoutMs: 60_000 }), e => e === rollback);
      assert.deepEqual(await fixture.snapshot([...managementChangedTables, ...managementProtectedTables]), before);
    });

    await t.test("merge profissional: duplicados inclusive especialidade nula, únicos e seis vínculos diretos", async () => {
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        const id = await executeHealthAdministrativeMerge(connection, { kind: "PROFESSIONAL", targetId: "hmo-prof-target", sourceId: "hmo-prof-source", ...actor }, tx);
        const [source] = await tx.select().from(healthProfessionals).where(eq(healthProfessionals.id, "hmo-prof-source"));
        assert.equal(source.isActive, false);
        assert.equal(source.inactivationReason, "Unificado ao profissional hmo-prof-target");
        const links = await tx.select().from(healthProfessionalAssignments);
        for (const key of ["hmo-assignment-duplicate", "hmo-assignment-source-null"]) { assert.equal(links.find(l => l.id === key)?.isActive, false); assert.equal(links.find(l => l.id === key)?.professionalId, "hmo-prof-source"); }
        assert.equal(links.find(l => l.id === "hmo-assignment-unique")?.professionalId, "hmo-prof-target");
        const [history] = await tx.select().from(tables.managementAdministrativeMerges).where(eq(tables.managementAdministrativeMerges.id, id));
        assert.deepEqual(history.result, { moved: { healthAppointment: 1, medicalRecord: 1, healthPrescription: 1, vaccinationRecord: 1, healthExamRequest: 1, healthReferral: 1, assignments: 3, services: 2, habilitations: 2, statusHistory: 1 }, sourceStatus: "Inativo por unificação" });
        await assert.rejects(executeHealthAdministrativeMerge(connection, { kind: "PROFESSIONAL", targetId: "hmo-prof-target", sourceId: "hmo-prof-source", ...actor }, tx), /Profissional ativo/);
        throw rollback;
      }, { timeoutMs: 60_000 }), e => e === rollback);
    });

    await t.test("merge endereço e transferência do perfil quando o principal não possui cadastro", async () => {
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await executeHealthAdministrativeMerge(connection, { kind: "ADDRESS", targetId: "hmo-address-target", sourceId: "hmo-address-source", ...actor }, tx);
        const [address] = await tx.select().from(addresses).where(eq(addresses.id, "hmo-address-source"));
        assert.equal(address.canonicalAddressId, "hmo-address-target");
        assert.equal(address.personId, "hmo-person-source");
        await assert.rejects(executeHealthAdministrativeMerge(connection, { kind: "ADDRESS", targetId: "hmo-address-target", sourceId: "hmo-address-source", ...actor }, tx), /já foi unificado/);
        await tx.delete(healthPatientRegistrations).where(eq(healthPatientRegistrations.patientId, "hmo-target"));
        await executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-source", ...actor }, tx);
        assert.equal((await tx.select().from(healthPatientRegistrations).where(eq(healthPatientRegistrations.patientId, "hmo-target")))[0].workplace, "Perfil origem");
        assert.equal((await tx.select().from(healthPatientRegistrations).where(eq(healthPatientRegistrations.patientId, "hmo-source"))).length, 0);
        throw rollback;
      }, { timeoutMs: 60_000 }), e => e === rollback);
    });

    await t.test("falha tardia de histórico reverte todos os efeitos, e critérios/gestação/cota mantêm guardas", async () => {
      const before = await fixture.snapshot([...managementChangedTables, ...managementProtectedTables]);
      await fixture.database.exec(`create function hmo_reject_merge() returns trigger language plpgsql as $$ begin raise exception 'HMO histórico rejeitado'; end $$; create trigger hmo_reject_merge before insert on "HealthAdministrativeMerge" for each row execute function hmo_reject_merge();`);
      try { await assert.rejects(executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-source", ...actor }), e => hasCause(e, /HMO histórico rejeitado/)); }
      finally { await fixture.database.exec(`drop trigger hmo_reject_merge on "HealthAdministrativeMerge"; drop function hmo_reject_merge();`); }
      assert.deepEqual(await fixture.snapshot([...managementChangedTables, ...managementProtectedTables]), before);
      await assert.rejects(executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-target", ...actor }), /registros de origem/);
      await assert.rejects(executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-hidden", ...actor }), /nome, data de nascimento/);
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`insert into "HealthPregnancy" (id,"patientId","openedMedicalRecordId","unitId","estimatedDeliveryDate","calculationMethod","baselineWeight",height,"pregnancyType","previousPregnancies","createdByUsuarioId") values ('hmo-duplicate-pregnancy','hmo-target','hmo-record','hmo-u1','2026-12-31','DUM',60,1.65,'UNICA',0,'hmo-actor')`);
        await executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-source", ...actor }, tx);
      }), /gestação duplicada/);
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`insert into "SpecializedQuota" (id,"patientId","materialId",period,"allowedQuantity","updatedAt") values ('hmo-duplicate-quota','hmo-target','hmo-material','2026-05',5,now())`);
        await executeHealthAdministrativeMerge(connection, { kind: "PATIENT", targetId: "hmo-target", sourceId: "hmo-source", ...actor }, tx);
      }, { timeoutMs: 60_000 }), e => hasCause(e, /unique|duplicate/i));
      assert.deepEqual(await fixture.snapshot([...managementChangedTables, ...managementProtectedTables]), before);
    });

    await t.test("vigilância: inspeção e itens atômicos, tx reutilizável e origem obrigatória", async () => {
      const before = await fixture.snapshot();
      await fixture.database.exec(`create function hmo_reject_item() returns trigger language plpgsql as $$ begin raise exception 'HMO item rejeitado'; end $$; create trigger hmo_reject_item before insert on "HealthVigilanceInspectionItem" for each row execute function hmo_reject_item();`);
      try { await assert.rejects(vigilance.saveInspection(context, { establishmentId, inspectedAt: "2026-05-10T12:00:00Z", items: [{ description: "Item atômico" }] }), e => hasCause(e, /HMO item rejeitado/)); }
      finally { await fixture.database.exec(`drop trigger hmo_reject_item on "HealthVigilanceInspectionItem"; drop function hmo_reject_item();`); }
      assert.deepEqual(await fixture.snapshot(), before);
      await assert.rejects(vigilance.saveEstablishment({ ...context, connection: undefined }, { name: "Sem origem" }), /conexão de origem/);
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await assert.rejects(vigilance.saveEstablishment({ ...context, database: tx }, { name: "Tx sem repasse" }), /reutilize explicitamente a transação/);
        const created = await vigilance.saveEstablishment({ ...context, database: tx, connection: undefined }, { name: "Cadastro no tx" }, tx);
        assert.ok((await tx.select().from(tables.managementVigilanceEstablishments).where(eq(tables.managementVigilanceEstablishments.id, created.id)))[0]);
        throw rollback;
      }), e => e === rollback);
      assert.deepEqual(await fixture.snapshot(), before);
    });
  } finally { await fixture.close(); }
});
