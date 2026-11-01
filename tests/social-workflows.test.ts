import "./helpers/fleet-test-environment";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createFleetTestDatabase } from "./fleet-fixture";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { employees, roles } from "../src/db/schema/administration";
import { accessProfiles, users } from "../src/db/schema/identity";
import * as s from "../src/db/schema/social";
import * as w from "../src/db/schema/social-workflows";
import { saveSocialWorkflow } from "../src/db/repositories/social/workflow-operations";
import { readSocialWorkflow } from "../src/db/repositories/social/workflow-queries";
import { buildSocialReport } from "../src/db/repositories/social/reports";
import { applySocialImport, previewSocialImport } from "../src/db/repositories/social/imports";
import { localCadunicoHeaders, parseLocalCadunico, readSocialCsv } from "../src/lib/social/cadunico-import";
import { validateSocialAnswers, type SocialWorkflowArea } from "../src/lib/social/workflow-contract";
import { renderSocialReport } from "../src/lib/social/report-renderer";
import { syntheticCpf } from "../src/lib/poc/fixture-catalog";
import { ageAt } from "../src/lib/social/report-contract";
import * as m from "../src/db/schema/social-operation-models";
import { defaultImportLayout, defaultMunicipalParameters } from "../src/lib/social/municipal-contract";
import { calculateSocialMonthly } from "../src/db/repositories/social/monthly-statements";
import { sendSocialMessage } from "../src/db/repositories/social/messages";

test("CSV local preserva aspas, rejeita composição incoerente e valida respostas tipadas", () => {
  assert.deepEqual(readSocialCsv('a;b\n"um;dois";"três"'), [["a", "b"], ["um;dois", "três"]]);
  assert.throws(() => readSocialCsv('a;b\n"incompleto'), /não encerrado/);
  const content = localCadunicoHeaders.join(";") + "\n" + [syntheticCpf(51000), "41000000001", "Pessoa exemplo", "F1", "FILHO", "2015-01-01", "1000.00", "31999999999", "Rua A", "Aurora", "MG"].join(";");
  assert.match(parseLocalCadunico(content)[0].errors.join(" "), /responsável/);
  assert.deepEqual(validateSocialAnswers([{ key: "a", label: "Confirmado", type: "CHECKBOX", required: true, options: [] }], { a: false }), { a: false });
  assert.throws(() => validateSocialAnswers([{ key: "a", label: "Opção", type: "SINGLE", required: true, options: ["A", "B"] }], { a: "C" }), /inválida/);
  assert.equal(ageAt("2000-11-02", "2026-11-01"), 25);
});

test("layout configurável interpreta colunas externas, constantes, data brasileira e NIS ausente", () => {
  const layout = { ...defaultImportLayout, delimiter: "|" as const, dateFormat: "BR" as const, mapping: { ...defaultImportLayout.mapping, cpf: "Documento", nis: "=", nome: "Pessoa", codigo_familiar: "Família", parentesco: "Relação", nascimento: "Nascimento", renda_familiar: "Renda", telefone: "=", endereco: "=", municipio: "=Aurora", uf: "=31" } };
  const [row] = parseLocalCadunico(`Documento|Pessoa|Família|Relação|Nascimento|Renda\n${syntheticCpf(51010)}|Pessoa importada|EXTERNA-1|1|31/01/1980|1.234,56`, layout);
  assert.deepEqual(row.errors, []);
  assert.equal(row.nis, "");
  assert.equal(row.kinship, "RESPONSAVEL");
  assert.equal(row.birthDate, "1980-01-31");
  assert.equal(row.income, "1234.56");
  assert.equal(row.uf, "MG");
});

test("Social: família canônica, visitas, acompanhamento, SCFV, questionários, importação e relatórios", { timeout: 180000 }, async t => {
  const fixture = await createFleetTestDatabase(), db = fixture.connection.db;
  try {
    await fixture.database.exec(readFileSync("db/migrations/20261101180000_social_poc_workflows/migration.sql", "utf8"));
    await fixture.database.exec(readFileSync("db/migrations/20261101190000_social_workflow_revisions/migration.sql", "utf8"));
    await fixture.database.exec(readFileSync("db/migrations/20261101200000_social_municipal_operation/migration.sql", "utf8"));
    const [profile] = await db.select().from(accessProfiles).limit(1);
    const [actor] = await db.insert(users).values({ nome: "Social fixture", email: "social-workflows@fixture.invalid", perfilId: profile.id }).returning();
    const [person] = await db.insert(people).values({ fullName: "Profissional fixture", cpf: syntheticCpf(51001) }).returning();
    const [role] = await db.insert(roles).values({ name: "Técnico social fixture" }).returning();
    const [employee] = await db.insert(employees).values({ name: person.fullName, personId: person.id, roleId: role.id }).returning();
    const [unit] = await db.insert(s.socialUnits).values({ name: "CRAS fixture", type: "CRAS" }).returning();
    const access = { administrator: true, userId: actor.id, employeeId: employee.id, links: [] };
    const save = (area: SocialWorkflowArea, values: Record<string, string>, id?: string) => withDatabaseTransaction(fixture.connection, tx => saveSocialWorkflow(tx, access, area, id, values));
    await t.test("parâmetros aceitam modalidades e rejeitam revisão obsoleta e perfil sem administração", async () => {
      const values = Object.fromEntries(Object.entries(defaultMunicipalParameters).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)]));
      await save("parametros", { ...values, revision: "0" }, "municipal");
      await assert.rejects(save("parametros", { ...values, revision: "0" }, "municipal"), /outra sessão/);
      await assert.rejects(save("parametros", { ...values, deliveryTypes: '["INVALID"]', revision: "1" }, "municipal"), /opção inválida/);
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => saveSocialWorkflow(tx, { ...access, administrator: false }, "parametros", "municipal", { ...values, revision: "1" })), /administração/);
      assert.equal((await db.select().from(m.socialMunicipalSettings))[0].revision, 1);
    });
    await save("profissionais", { employeeId: employee.id, unitId: unit.id, roleId: role.id, council: "CRESS", registration: "FIXTURE-01", startsAt: "2020-01-01", endsAt: "", individualScope: "UNIT", familyScope: "UNIT" });
    const beneficiary = (number: number, birthDate: string) => ({ unitId: unit.id, fullName: `Pessoa fixture ${number}`, cpf: syntheticCpf(number), birthDate, birthPlace: "Aurora", nationality: "Brasileira", raceColor: "Parda", maritalStatus: "Solteiro(a)", motherName: "Mãe fixture", fatherName: "Pai fixture", gender: "Feminino", registeredAt: "2026-01-01", streetName: "Rua fixture", number: "10", religion: "", birthCertificate: "CERT-fixture", nis: "", phonePrimary: "31999999999", email: "", rg: "", socialName: "", zipCode: "", complement: "" });
    const parentId = await save("beneficiarios", beneficiary(51002, "1980-01-01")), childId = await save("beneficiarios", beneficiary(51003, "2015-01-01"));
    const familyId = await save("familias", { unitId: unit.id, representativeId: parentId, familyCode: "FIXTURE-SOCIAL-1", nis: "", income: "1500.00", vulnerabilities: "Cenário fixture" });
    await save("membros", { unitId: unit.id, familyId, personId: childId, kinship: "FILHO" });
    await t.test("família reconcilia composição e renda sem duplicar", async () => {
      const [family] = await db.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, familyId));
      assert.ok(family.masterFamilyId); assert.equal(family.perCapitaIncome, 750);
      assert.equal((await readSocialWorkflow(db, access, "membros")).rows.length, 1);
      assert.ok((await db.select().from(w.socialWorkflowRevisions).where(eq(w.socialWorkflowRevisions.recordId, familyId))).length);
      const denied = { ...access, administrator: false, links: [] };
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => saveSocialWorkflow(tx, denied, "familias", undefined, { unitId: unit.id, representativeId: parentId, familyCode: "OUTSIDE", income: "0", nis: "", vulnerabilities: "" })), /vínculo/);
      assert.equal((await readSocialWorkflow(db, denied, "beneficiarios")).rows.length, 0);
    });
    const followupId = await save("acompanhamentos", { unitId: unit.id, familyId, personId: "", professionalId: employee.id, service: "PAIF", startsAt: "2026-01-01", endsAt: "", diagnosis: "Diagnóstico fixture", objectives: "Objetivos fixture", actions: "Ações fixture", reviewAt: "2026-12-01", status: "ACTIVE" });
    await save("evolucoes", { followupId, occurredAt: "2026-10-01", description: "Evolução registrada", nextReviewAt: "2026-12-01" });
    await save("visitas", { unitId: unit.id, familyId, professionalId: employee.id, scheduledDate: "2026-10-01T09:00", realizedDate: "2026-10-01T09:15", status: "Realizada", objective: "Visita fixture", report: "Visita concluída" });
    await t.test("evoluções e visita têm histórico e dados efetivos", async () => {
      assert.equal((await readSocialWorkflow(db, access, "evolucoes")).rows[0].immutable, true);
      assert.equal((await readSocialWorkflow(db, access, "visitas")).rows[0].values.realizedDate, "2026-10-01T09:15");
      const [link] = await db.select().from(m.socialVisitAttendances);
      const [attendance] = await db.select().from(s.socialAttendances).where(eq(s.socialAttendances.id, link.attendanceId));
      assert.equal(attendance.description, "Visita concluída");
      assert.equal(attendance.date.toISOString(), "2026-10-01T12:15:00.000Z");
    });
    await t.test("prontuário restrito protege conteúdo e relatório de outro profissional", async () => {
      const caseId = await save("prontuarios", { unitId: unit.id, familyId, personId: "", professionalId: employee.id, receivedAt: "2026-01-01", enteredVia: "Demanda espontânea", initialDemand: "Avaliação familiar", secrecyLevel: "Restrito", status: "ACTIVE", diagnosis: "Conteúdo reservado fixture" });
      const other = { administrator: false, userId: actor.id, employeeId: "other", links: [{ unitId: unit.id, individualScope: "UNIT" as const, familyScope: "UNIT" as const }] };
      assert.equal((await readSocialWorkflow(db, other, "prontuarios")).rows.length, 0);
      await assert.rejects(buildSocialReport(db, other, { kind: "prontuario", caseId, from: "2026-01-01", to: "2026-12-31" }), /escopo/);
      assert.ok((await buildSocialReport(db, access, { kind: "prontuario", caseId, from: "2026-01-01", to: "2026-12-31" })).sections.some(section => section.rows.some(row => row.includes("Conteúdo reservado fixture"))));
    });
    await t.test("fechamento mensal separa calculado, declarado e desconhecido e exige conferência", async () => {
      const snapshot = await calculateSocialMonthly(db, unit.id, "2026-10", {});
      assert.equal(snapshot.indicators.find(i => i.code === "C6")?.value, 1);
      assert.equal(snapshot.indicators.find(i => i.code === "B1")?.value, null);
      const values = { unitId: unit.id, professionalId: employee.id, competence: "2026-10", declaredValues: "{}", observations: "", status: "FINAL" };
      await assert.rejects(save("mensal", values), /Informe os indicadores/);
      const id = await save("mensal", { ...values, status: "DRAFT" });
      const declaredValues = JSON.stringify(Object.fromEntries(snapshot.indicators.filter(i => i.value === null).map(i => [i.code, 0])));
      await save("mensal", { ...values, declaredValues }, id);
      const [saved] = await db.select().from(m.socialMonthlyStatements).where(eq(m.socialMonthlyStatements.id, id));
      assert.equal(saved.version, 2);
      assert.equal(saved.snapshot.indicators.find(i => i.code === "B1")?.source, "DECLARED");
    });
    await t.test("canal de fila não transmite nem inventa entrega", async () => {
      const programId = await save("programas", { name: "Programa fixture", sphere: "Municipal", description: "Programa municipal fixture" });
      const programEnrollmentId = await save("participacoes", { unitId: unit.id, personId: parentId, familyId: "", programId, registeredAt: "2026-01-01", includedAt: "2026-01-01", excludedAt: "", benefitValue: "0", benefitNumber: "" });
      const [message] = await db.insert(w.socialMessages).values({ unitId: unit.id, personId: parentId, programEnrollmentId, phone: "31999999999", body: "Aviso de atualização cadastral", dueAt: "2026-12-01", dedupeKey: "queue-fixture", createdBy: actor.id }).returning();
      assert.match((await sendSocialMessage(fixture.connection, access, message.id)).info, /Configure/);
      assert.equal((await db.select().from(m.socialMessageDispatches)).length, 0);
      const [current] = await db.select().from(w.socialMessages).where(eq(w.socialMessages.id, message.id));
      assert.equal(current.deliveredAt, null);
      assert.equal(current.sentAt, null);
    });
    const groupId = await save("scfv", { unitId: unit.id, realizationUnitId: unit.id, name: "Infância fixture", serviceType: "Convivência", ageMin: "6", ageMax: "14", registeredAt: "2026-01-01", startsAt: "2026-01-01", endsAt: "2026-12-31", professionalId: employee.id, referenceProfessionalId: employee.id, advisorId: employee.id, facilitatorId: employee.id, weekdays: "[1,3]", startTime: "14:00", endTime: "16:00" });
    const enrollmentId = await save("matriculas", { groupId, personId: childId, enrolledAt: "2026-02-01", leftAt: "", exitReason: "" });
    const eventId = await save("eventos", { groupId, title: "Oficina fixture", occursAt: "2026-10-01", planning: "Planejamento fixture", status: "REALIZED", report: "Relatório fixture" });
    await t.test("SCFV bloqueia idade e registra presença sem duplicidade", async () => {
      await assert.rejects(save("matriculas", { groupId, personId: parentId, enrolledAt: "2026-02-01", leftAt: "", exitReason: "" }), /faixa etária/);
      const values = { eventId, enrollmentId, present: "false", justification: "Ausência justificada" };
      const id = await save("presencas", values); assert.equal(await save("presencas", { ...values, present: "true" }), id);
      assert.equal((await db.select().from(w.socialScfvAttendance)).length, 1);
    });
    await t.test("formulários versionados preservam respostas e tipos", async () => {
      const questions = JSON.stringify([{ key: "q1", label: "Demanda", type: "SHORT", required: true, options: [] }]);
      const questionnaireId = await save("formularios", { unitId: unit.id, title: "Ficha fixture", questions });
      await save("respostas", { questionnaireId, familyId, personId: "", answeredAt: "2026-10-01", answers: '{"q1":"Orientação"}' });
      const versionId = await save("formularios", { unitId: unit.id, title: "Ficha fixture", questions }, questionnaireId);
      assert.notEqual(versionId, questionnaireId); assert.equal((await db.select().from(w.socialQuestionnaires).where(eq(w.socialQuestionnaires.id, versionId)))[0].version, 2);
      assert.equal((await readSocialWorkflow(db, access, "respostas")).rows[0].detail, "Demanda: Orientação");
    });
    await t.test("importação tem prévia sem cadastros, aplicação atômica e repetição idempotente", async () => {
      const content = localCadunicoHeaders.join(";") + "\n" + [syntheticCpf(51004), "41000000004", "Pessoa importada", "IMPORT-F1", "RESPONSAVEL", "1985-01-01", "1100.00", "31999999999", "Rua importada", "Aurora", "MG"].join(";");
      const preview = () => withDatabaseTransaction(fixture.connection, tx => previewSocialImport(tx, { unitId: unit.id, filename: "fixture.csv", content, actorId: actor.id }));
      const batchId = await preview(); assert.equal(await preview(), batchId);
      assert.equal((await db.select().from(s.cadUnicoRecords)).length, 0);
      await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => { await applySocialImport(tx, batchId, actor.id); throw new Error("rollback fixture"); }), /rollback/);
      assert.equal((await db.select().from(s.cadUnicoRecords)).length, 0);
      await withDatabaseTransaction(fixture.connection, tx => applySocialImport(tx, batchId, actor.id));
      await withDatabaseTransaction(fixture.connection, tx => applySocialImport(tx, batchId, actor.id));
      assert.equal((await db.select().from(s.cadUnicoRecords)).length, 1);
    });
    await t.test("relatórios conciliam frequência e exportam PDF/XLSX/CSV integral", async () => {
      const filters = { kind: "frequencia", from: "2026-10-01", to: "2026-10-31" };
      const report = await buildSocialReport(db, access, filters);
      assert.equal(report.sections[0].rows.length, 1); assert.equal(report.sections[0].rows[0][3], "Presente");
      assert.equal((await buildSocialReport(db, access, { ...filters, kind: "acompanhadas" })).sections[0].rows.length, 1);
      for (const format of ["pdf", "xlsx", "csv"] as const) assert.ok((await renderSocialReport(report, format)).bytes.length > 100);
      const blocked = await buildSocialReport(db, { ...access, administrator: false, links: [] }, filters);
      assert.equal(blocked.sections[0].rows.length, 0);
    });
  } finally { await fixture.close(); }
});
