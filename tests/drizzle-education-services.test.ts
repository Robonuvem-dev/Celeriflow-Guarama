import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createEducationServiceFixture } from "./helpers/personnel-education-fixture";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPostgresError } from "../src/db/errors";
import { people } from "../src/db/schema/people";
import { employees } from "../src/db/schema/administration";
import { academicPeriods, classDiaries, curriculumMatrices, curriculumMatrixSubjects, educationalGuardians, enrollments, schoolClasses, schools, schoolSubjects, students, teacherClassAssignments, teachers } from "../src/db/schema/education-core";
import { academicDocumentIssues, preEnrollmentProcesses, preEnrollments } from "../src/db/schema/education-admissions";
import { educationAssessments, educationAttendances, educationGrades, learningActivities, learningQuestions, learningSubmissions, teacherAcademicRecords } from "../src/db/schema/education-teaching";
import { educationApplicationPlans, educationFinancialAccounts, educationFinancialMovements, educationFoodMovements, educationLibraryCopies, educationLibraryLoans, educationLibraryReservations, educationLibraryTitles, educationSchoolMenus, educationTransportEvents, educationTransportJourneys, educationTransportRoutes } from "../src/db/schema/education-operations";
import { pedagogicalAttempts, pedagogicalCatalogItems, pedagogicalReleases } from "../src/db/schema/education-interactive";
import { allocateEducationPreEnrollment, classifyEducationPreEnrollments, submitEducationPreEnrollment } from "../src/lib/educacao/pre-enrollment-service";
import { completeEducationPedagogicalAttempt } from "../src/lib/educacao/interactive-service";
import { createEducationLibraryLoan, renewEducationLibraryLoan, reserveEducationLibraryTitle, returnEducationLibraryLoan } from "../src/lib/educacao/library-service";
import { getAcademicDocumentSource, listAcademicDocumentIssues, listEducationPreEnrollments } from "../src/db/repositories/education/admissions";
import { findTeachingWorkspaceIdentity, listTeachingWorkspaceClasses, loadTeachingWorkspaceRecords } from "../src/db/repositories/education/teaching";
import { loadEducationFoodData, loadEducationLibraryData, loadEducationSchoolResourcesData, loadEducationTransportData } from "../src/db/repositories/education/operations";
import { loadEducationGuardianPortal, loadEducationInteractiveData } from "../src/db/repositories/education/portals";

test("Educação Drizzle/Neon isolado: pré-matrícula, biblioteca, atividades e documentos", { timeout: 60_000 }, async t => {
  const fixture = await createEducationServiceFixture(), { db } = fixture.connection;
  try {
    await db.insert(people).values([{ id: "student-person", fullName: "Aluno sintético" }, { id: "other-person", fullName: "Outro aluno" }]);
    await db.insert(students).values([{ id: "student", personId: "student-person", studentCode: "A001" }, { id: "other", personId: "other-person", studentCode: "A002" }]);
    await db.insert(schools).values({ id: "school", name: "Escola sintética" });
    await db.insert(employees).values({ id: "employee", name: "Docente sintético" });
    await db.insert(teachers).values({ id: "teacher", employeeId: "employee" });
    await db.insert(schoolSubjects).values({ id: "subject", name: "Língua Portuguesa" });
    await db.insert(schoolClasses).values({ id: "class", name: "Turma A", schoolId: "school", year: 2099, stage: "Fundamental", grade: "1º", shift: "Manhã" });

    await t.test("pré-matrícula preserva protocolo, duplicidade, prioridade, espera e alocação sem matrícula definitiva", async () => {
      await db.insert(preEnrollmentProcesses).values({ id: "process", name: "Ingresso", schoolId: "school", year: 2099, stage: "Fundamental", capacity: 1, shift: "Manhã", startDate: new Date("2099-01-01"), endDate: new Date("2099-12-31"), status: "Aberto" });
      const input = { processId: "process", studentId: "student", grade: "1º", shift: "Tarde", rankingScore: 4 };
      assert.equal(await submitEducationPreEnrollment(db, input), "PM-2099-00001");
      await assert.rejects(submitEducationPreEnrollment(db, input), /Já existe solicitação/);
      assert.equal(await submitEducationPreEnrollment(db, { ...input, studentId: "other", rankingScore: 8 }), "PM-2099-00002");
      const total = await withDatabaseTransaction(fixture.connection, tx => classifyEducationPreEnrollments(tx, "process"));
      assert.equal(total, 2);
      const rows = await listEducationPreEnrollments(db);
      assert.deepEqual(rows.map(row => [row.student.person.fullName, row.position, row.status]), [["Outro aluno", 1, "Classificado"], ["Aluno sintético", 2, "Lista de espera"]]);
      assert.equal(rows[0].shift, "Manhã", "o turno do processo prevalece sobre o pedido");
      await assert.rejects(allocateEducationPreEnrollment(db, rows[1].id), /Somente candidato classificado/);
      await allocateEducationPreEnrollment(db, rows[0].id);
      const [allocated] = await db.select().from(preEnrollments).where(eq(preEnrollments.id, rows[0].id));
      assert.equal(allocated.status, "Alocado");
      assert.ok(allocated.allocatedAt instanceof Date);
      assert.equal((await db.select().from(enrollments)).length, 0);
      await db.update(preEnrollmentProcesses).set({ endDate: new Date("2001-01-01") }).where(eq(preEnrollmentProcesses.id, "process"));
      await assert.rejects(submitEducationPreEnrollment(db, { ...input, studentId: "missing" }), /indisponível/);
    });

    await t.test("biblioteca mantém empréstimo/exemplar atômicos, renovação e reserva sem duplicar identidade", async () => {
      await db.insert(educationLibraryTitles).values({ id: "title", title: "Livro", author: "Autoria", category: "Literatura", schoolId: "school" });
      await db.insert(educationLibraryCopies).values({ id: "copy", titleId: "title", assetCode: "T001" });
      await withDatabaseTransaction(fixture.connection, tx => createEducationLibraryLoan(tx, { copyId: "copy", studentId: "student", dueAt: new Date("2099-02-01T12:00:00Z") }));
      const [loan] = await db.select().from(educationLibraryLoans);
      assert.equal((await db.select().from(educationLibraryCopies))[0].status, "Emprestado");
      await renewEducationLibraryLoan(db, loan.id, new Date("2099-02-10T12:00:00Z"));
      await renewEducationLibraryLoan(db, loan.id, new Date("2099-02-11T12:00:00Z"));
      assert.equal((await db.select().from(educationLibraryLoans))[0].renewals, 2);
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => returnEducationLibraryLoan(tx, { loanId: loan.id, copyId: "missing" })), /Exemplar não encontrado/);
      assert.equal((await db.select().from(educationLibraryLoans))[0].status, "Emprestado", "falha do exemplar reverte a devolução");
      await withDatabaseTransaction(fixture.connection, tx => returnEducationLibraryLoan(tx, { loanId: loan.id, copyId: "copy" }));
      assert.equal((await db.select().from(educationLibraryCopies))[0].status, "Disponível");
      assert.ok((await db.select().from(educationLibraryLoans))[0].returnedAt instanceof Date);
      await reserveEducationLibraryTitle(db, "title", "student");
      await reserveEducationLibraryTitle(db, "title", "student");
      assert.equal((await db.select().from(educationLibraryReservations)).length, 1);
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => createEducationLibraryLoan(tx, { copyId: "copy", studentId: "missing", dueAt: new Date() })), error => getPostgresError(error)?.code === "23503");
      assert.equal((await db.select().from(educationLibraryCopies))[0].status, "Disponível");
    });

    await t.test("atividade aplica escopo da turma/aluno e pontuação arredondada com comparação pt-BR", async () => {
      await db.insert(pedagogicalCatalogItems).values({ id: "catalog", title: "Questionário", description: "Sintético", schoolYear: "1º", type: "Jogo", instructions: "Responda", content: { questions: [{ id: 1, answer: "Árvore" }, { id: 2, answer: "Sol" }, { id: 3, answer: "Mar" }] } });
      await db.insert(pedagogicalReleases).values([{ id: "release", catalogItemId: "catalog", teacherId: "teacher", classId: "class" }, { id: "individual", catalogItemId: "catalog", teacherId: "teacher", studentId: "student" }]);
      const input = { releaseId: "release", studentId: "student", answers: { "1": "arvore", "2": "SOL", "3": "errada" } };
      await assert.rejects(completeEducationPedagogicalAttempt(db, input), /não pertence à turma/);
      await assert.rejects(completeEducationPedagogicalAttempt(db, { ...input, releaseId: "individual", studentId: "other" }), /não liberada/);
      await db.insert(enrollments).values({ studentId: "student", schoolId: "school", classId: "class", year: 2099 });
      assert.equal(await completeEducationPedagogicalAttempt(db, input), 67);
      const [attempt] = await db.select().from(pedagogicalAttempts);
      assert.deepEqual([attempt.correctAnswers, attempt.incorrectAnswers, attempt.score], [2, 1, 67]);
      assert.deepEqual(attempt.answers, input.answers);
      assert.ok(attempt.completedAt instanceof Date);
    });

    await t.test("documentos respeitam publicação, ordem por ano, relações opcionais e histórico físico do default", async () => {
      await db.insert(academicPeriods).values({ id: "period", schoolId: "school", code: "P2098", name: "Ano 2098", year: 2098, modality: "Regular", startDate: new Date("2098-01-01"), endDate: new Date("2098-12-31") });
      await db.insert(enrollments).values({ studentId: "student", schoolId: "school", periodId: "period", year: 2098, status: "Concluído" });
      await db.insert(educationGrades).values([{ studentId: "student", subjectId: "subject", teacherId: "teacher", period: "1º Bimestre", value: 8, publishedAt: new Date() }, { studentId: "student", subjectId: "subject", teacherId: "teacher", period: "2º Bimestre", value: 9 }]);
      const [diary] = await db.insert(classDiaries).values({ classId: "class", teacherId: "teacher", date: new Date() }).returning();
      await db.insert(educationAttendances).values({ studentId: "student", diaryId: diary.id, isPresent: false });
      const source = await withDatabaseTransaction(fixture.connection, tx => getAcademicDocumentSource(tx, "student"));
      assert.ok(source);
      assert.equal(source.person.cpf, null);
      assert.deepEqual(source.enrollments.map(row => row.year), [2099, 2098]);
      assert.equal(source.enrollments[0].period, null);
      assert.equal(source.enrollments[1].schoolClass, null);
      assert.equal(source.grades.length, 1);
      assert.equal(source.grades[0].value, 8);
      assert.deepEqual(source.attendances, [{ isPresent: false }]);
      assert.equal((await db.select().from(educationGrades))[0].type, "AvaliaÃ§Ã£o", "default mapeia os bytes do histórico instalado");
      await db.insert(academicDocumentIssues).values([{ type: "Boletim", fileName: "aluno.pdf", generatedContent: "Conteúdo", actorName: "Autoria", studentId: "student" }, { type: "Declaração", fileName: "geral.pdf", generatedContent: "Conteúdo", actorName: "Autoria" }]);
      const issues = await listAcademicDocumentIssues(db);
      assert.equal(issues.find(row => row.fileName === "aluno.pdf")?.student?.person.fullName, "Aluno sintético");
      assert.equal(issues.find(row => row.fileName === "geral.pdf")?.student, null);
    });

    await t.test("recursos escolares mantêm precisão NUMERIC(18,2), sem conversão monetária para Number", async () => {
      const [account] = await db.insert(educationFinancialAccounts).values({ schoolId: "school", name: "Conta sintética" }).returning();
      const [movement] = await db.insert(educationFinancialMovements).values({ accountId: account.id, type: "Repasse", description: "Precisão", value: "90071992547409.91" }).returning();
      const [plan] = await db.insert(educationApplicationPlans).values({ schoolId: "school", title: "Plano", total: "10.005", items: { description: "Itens" } }).returning();
      assert.equal(movement.value, "90071992547409.91");
      assert.equal(plan.total, "10.01");
    });

    await t.test("área docente mantém identidade, vínculo direto/ativo, matriz, chamada e resultados da própria autoria", async () => {
      assert.equal(await findTeachingWorkspaceIdentity(db, null, false), null);
      assert.equal(await findTeachingWorkspaceIdentity(db, "not-a-teacher", true), null, "administrador com identidade sem vínculo não assume outro professor");
      assert.equal((await findTeachingWorkspaceIdentity(db, null, true))?.id, "teacher");
      const [matrix] = await db.insert(curriculumMatrices).values({ schoolId: "school", periodId: "period", name: "Matriz", stage: "Fundamental", grade: "1º", annualWorkload: 800 }).returning();
      await db.insert(curriculumMatrixSubjects).values({ matrixId: matrix.id, subjectId: "subject", workload: 80 });
      await db.update(schoolClasses).set({ teacherId: "teacher", matrixId: matrix.id }).where(eq(schoolClasses.id, "class"));
      await db.insert(schoolClasses).values(["assigned", "inactive"].map(id => ({ id, name: id, schoolId: "school", year: 2099, stage: "Fundamental", grade: "1º", shift: "Manhã" })));
      await db.insert(teacherClassAssignments).values([{ classId: "assigned", teacherId: "teacher", subjectId: "subject", startDate: new Date(), isActive: true }, { classId: "inactive", teacherId: "teacher", subjectId: "subject", startDate: new Date(), isActive: false }]);
      const [assessment] = await db.insert(educationAssessments).values({ teacherId: "teacher", classId: "class", subjectId: "subject", title: "Prova", stage: "1º Bimestre", type: "Prova", date: new Date() }).returning();
      await db.insert(educationGrades).values({ teacherId: "teacher", studentId: "student", subjectId: "subject", period: "1º Bimestre", assessmentId: assessment.id, value: 7 });
      await db.insert(teacherAcademicRecords).values({ teacherId: "teacher", classId: "class", type: "Planejamento", title: "Plano", startDate: new Date(), content: {} });
      const [activity] = await db.insert(learningActivities).values({ teacherId: "teacher", classId: "class", subjectId: "subject", title: "Leitura", type: "Atividade", instructions: "Leia" }).returning();
      await db.insert(learningQuestions).values({ activityId: activity.id, statement: "Ideia principal?" });
      await db.insert(learningSubmissions).values({ activityId: activity.id, studentId: "student", answer: "Resposta", feedback: "Retorno" });
      await withDatabaseTransaction(fixture.connection, async tx => {
        const classes = await listTeachingWorkspaceClasses(tx, "teacher");
        assert.deepEqual(classes.map(row => row.id).sort(), ["assigned", "class"]);
        assert.equal(classes.find(row => row.id === "class")?.matrix?.subjects[0].subject.name, "Língua Portuguesa");
        assert.equal(classes.find(row => row.id === "assigned")?.teacherAssignments.length, 1);
        assert.equal(classes.find(row => row.id === "class")?.enrollments[0].student.person.fullName, "Aluno sintético");
        const workspace = await loadTeachingWorkspaceRecords(tx, "teacher");
        assert.equal(workspace.diaries[0]._count.attendances, 1);
        assert.equal(workspace.assessments[0].grades[0].value, 7);
        assert.equal(workspace.assessments[0].schoolClass.enrollments.length, 1);
        assert.equal(workspace.records[0].subject, null);
        assert.equal(workspace.activities[0].questions.length, 1);
        assert.equal(workspace.activities[0].submissions[0].student.person.fullName, "Aluno sintético");
      });
    });

    await t.test("leitores operacionais preservam relações opcionais, datas, filas e integrações somente de leitura", async () => {
      await fixture.database.exec(`
        INSERT INTO "MaterialCategory" (id, code, name, "updatedAt") VALUES ('category', 'C1', 'Alimentos', now());
        INSERT INTO "Material" (id, code, name, "categoryId", "unitOfMeasure", "updatedAt") VALUES ('material', 'M1', 'Arroz', 'category', 'KG', now());
        INSERT INTO "Warehouse" (id, name, "updatedAt") VALUES ('warehouse', 'Central', now());
        INSERT INTO "BankAccount" (id, "bankName", agency, "accountNumber", "updatedAt") VALUES ('bank', 'Banco', '0001', '00002', now());
        INSERT INTO "FleetRoute" (id, code, name, origin, destination, itinerary, "departmentId", "createdById", "updatedAt") VALUES ('fleet-route', 'R1', 'Rota de Frotas', 'Origem', 'Destino', 'Trajeto', 'department', 'actor', now());
        INSERT INTO "FleetUnit" (id, code, name, category, "createdById", "updatedAt") VALUES ('unit', 'V1', 'Ônibus', 'ONIBUS', 'actor', now());
      `);
      await db.update(students).set({ usesSchoolTransport: true }).where(eq(students.id, "student"));
      await db.insert(educationSchoolMenus).values({ schoolId: "school", name: "Semanal", weekStart: new Date(), shift: "Manhã", items: {} });
      await db.insert(educationFoodMovements).values([{ schoolId: "school", materialId: "material", warehouseId: "warehouse", type: "Entrada", quantity: 10 }, { schoolId: "school", materialId: "material", type: "Consumo", quantity: 2 }]);
      await db.insert(educationTransportRoutes).values({ id: "school-route", code: "E1", name: "Rota escolar", schoolId: "school", fleetRouteId: "fleet-route" });
      const journeys = await db.insert(educationTransportJourneys).values([{ routeId: "school-route", fleetUnitId: "unit" }, { routeId: "school-route" }]).returning();
      await db.insert(educationTransportEvents).values({ journeyId: journeys[0].id, type: "Embarque", notes: "Ponto" });
      await withDatabaseTransaction(fixture.connection, async tx => {
        const library = await loadEducationLibraryData(tx);
        assert.equal(library.loans[0].copy.title.title, "Livro");
        assert.equal(library.copies[0].assetCode, "T001");
        const food = await loadEducationFoodData(tx);
        assert.equal(food.menus.length, 1);
        assert.equal(food.movements.find(row => row.type === "Consumo")?.warehouse, null);
        assert.equal(food.movements.find(row => row.type === "Entrada")?.material.unitOfMeasure, "KG");
        const resources = await loadEducationSchoolResourcesData(tx);
        assert.equal(resources.banks[0].accountNumber, "00002");
        assert.equal(resources.plans[0].total, "10.01");
        assert.equal(resources.plans[0].account, null);
        const transport = await loadEducationTransportData(tx);
        assert.deepEqual(transport.students.map(row => row.id), ["student"]);
        assert.equal(transport.fleetRoutes[0].name, "Rota de Frotas");
        assert.equal(transport.journeys.find(row => row.id === journeys[0].id)?.fleetUnit?.name, "Ônibus");
        assert.equal(transport.journeys.find(row => row.id === journeys[1].id)?.fleetUnit, null);
        assert.equal(transport.journeys.find(row => row.id === journeys[0].id)?.events[0].notes, "Ponto");
        assert.ok(transport.journeys[0].startedAt instanceof Date);
      });
    });

    await t.test("portais mantêm recorte do responsável, publicações e resultados interativos", async () => {
      await db.insert(people).values({ id: "guardian", fullName: "Responsável", email: "guardian@example.invalid" });
      await db.insert(educationalGuardians).values([{ personId: "guardian", studentId: "student", kinship: "Responsável" }, { personId: "guardian", studentId: "student", kinship: "Outro vínculo" }]);
      const [activity] = await db.update(learningActivities).set({ status: "Publicada" }).returning();
      await db.insert(learningSubmissions).values({ activityId: activity.id, studentId: "other", answer: "Entrega de outro aluno" });
      await withDatabaseTransaction(fixture.connection, async tx => {
        assert.equal(await loadEducationGuardianPortal(tx, "intruder@example.invalid", false), null);
        const portal = await loadEducationGuardianPortal(tx, "guardian@example.invalid", false);
        assert.ok(portal);
        assert.deepEqual(portal.children.map(row => row.id), ["student"], "vínculos duplicados não duplicam o aluno");
        assert.equal(portal.children[0].grades.length, 1, "somente resultados publicados");
        assert.equal(portal.activities[0].submissions.length, 1, "entregas de alunos não vinculados não são retornadas");
        assert.equal(portal.activities[0].submissions[0].feedback, "Retorno");
        assert.equal((await loadEducationGuardianPortal(tx, "admin@example.invalid", true))?.guardian.fullName, "Responsável");
        const interactive = await loadEducationInteractiveData(tx);
        assert.equal(interactive.students[0].id, "student");
        assert.equal(interactive.students[0].enrollments[0].classId, "class");
        assert.equal(interactive.teachers[0].employee.person, null);
        assert.equal(interactive.attempts[0].score, 67);
        assert.equal(interactive.releases[0].catalogItem.title, "Questionário");
      });
    });
  } finally { await fixture.close(); }
});
