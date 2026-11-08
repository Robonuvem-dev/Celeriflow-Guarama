import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as core from "../src/db/schema/education-core";
import * as teaching from "../src/db/schema/education-teaching";
import * as operations from "../src/db/schema/education-operations";
import * as interactive from "../src/db/schema/education-interactive";
import { academicDocumentIssues } from "../src/db/schema/education-admissions";
import { people } from "../src/db/schema/people";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { createEducationLibraryLoan, reserveEducationLibraryTitle, returnEducationLibraryLoan } from "../src/lib/educacao/library-service";
import { completeEducationPedagogicalAttempt } from "../src/lib/educacao/interactive-service";
import { populationContext } from "./lib/population-context";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const apply = process.argv.includes("--apply"), packageId = "MUNICIPAL_EDUCATION_OPERATIONS_20261108";
const date = (value: string) => new Date(`${value}T12:00:00Z`);
const id = (kind: string, index = 0) => `${packageId}:${kind}:${index}`;
const report = { mode: apply ? "APPLY" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), references: {} as Record<string, unknown>, checks: [] as string[], reused: false, status: "RUNNING", error: "" };
async function main() {
  try {
    const context = await populationContext(), rollback = new Error("POPULATION_PREVIEW_ROLLBACK");
    try {
      await withDatabaseTransaction(databaseConnection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        const [prior] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "MUNICIPAL_POPULATION_PACKAGE"), eq(financialAuditLogs.entityId, packageId))).limit(1);
        if (prior) { report.reused = true; report.references = { receiptId: prior.id }; return; }
        const [school] = await tx.select().from(core.schools).where(eq(core.schools.id, "aurora-system-v1:school:000"));
        assert.ok(school, "Escola da base municipal não encontrada.");
        const [schoolClass] = await tx.select().from(core.schoolClasses).where(and(eq(core.schoolClasses.schoolId, school.id), eq(core.schoolClasses.year, 2026))).orderBy(core.schoolClasses.id).limit(1);
        assert.ok(schoolClass?.periodId && schoolClass.teacherId && schoolClass.matrixId, "Execute o núcleo acadêmico antes da operação escolar.");
        const [component] = await tx.select().from(core.curriculumMatrixSubjects).where(eq(core.curriculumMatrixSubjects.matrixId, schoolClass.matrixId)).limit(1);
        assert.ok(component);
        const students = await tx.select({ enrollment: core.enrollments, student: core.students, person: people }).from(core.enrollments).innerJoin(core.students, eq(core.students.id, core.enrollments.studentId)).innerJoin(people, eq(people.id, core.students.personId)).where(and(eq(core.enrollments.classId, schoolClass.id), eq(core.enrollments.status, "Matriculado"))).orderBy(core.students.studentCode);
        assert.ok(students.length >= 2);
        const student = students[0], nextStudent = students[1];
        report.references = { schoolId: school.id, classId: schoolClass.id, periodId: schoolClass.periodId, teacherId: schoolClass.teacherId, subjectId: component.subjectId, students: students.map(row => row.student.id) };
        await tx.insert(core.classScheduleBoards).values({ id: id("board"), name: "Horário regular do quarto bimestre", classId: schoolClass.id, periodId: schoolClass.periodId, startDate: date("2026-10-05"), endDate: date("2026-12-18"), status: "Publicado" });
        for (const weekday of [1, 2, 3, 4, 5]) await tx.insert(core.classScheduleEntries).values({ id: id("schedule", weekday), boardId: id("board"), weekday, lessonOrder: 1, startTime: "07:30", endTime: "08:20", subjectId: component.subjectId, teacherId: schoolClass.teacherId });
        await tx.insert(core.classDiaries).values({ id: id("diary"), date: date("2026-11-06"), classId: schoolClass.id, subjectId: component.subjectId, teacherId: schoolClass.teacherId, stage: "4º Bimestre", status: "Publicado", publishedAt: date("2026-11-06"), contentTaught: "Leitura e interpretação de narrativas sobre a comunidade e os espaços públicos.", lessonCount: 1 });
        for (const [index, row] of students.entries()) await tx.insert(teaching.educationAttendances).values({ diaryId: id("diary"), studentId: row.student.id, isPresent: index !== 2, justification: index === 2 ? "Ausência comunicada pela família" : null });
        await tx.insert(teaching.teacherAcademicRecords).values({ id: id("academic-record"), type: "Plano de aula", title: "Leitura e participação na comunidade", stage: "4º Bimestre", startDate: date("2026-11-03"), endDate: date("2026-11-06"), classId: schoolClass.id, subjectId: component.subjectId, teacherId: schoolClass.teacherId, status: "Publicado", publishedAt: date("2026-11-03"), content: { objectives: "Identificar ideias principais e relacionar o texto com o cotidiano.", resources: ["Livro de leitura", "Caderno", "Mapa do bairro"], evaluation: "Participação oral e registro individual" } });
        const document = `DECLARAÇÃO DE MATRÍCULA\n\nDeclaramos que ${student.person.fullName}, matrícula ${student.student.studentCode}, encontra-se regularmente matriculado(a) na turma ${schoolClass.name}, da ${school.name}, no ano letivo de 2026.\n\nSecretaria escolar, 9 de novembro de 2026.`;
        await tx.insert(academicDocumentIssues).values({ id: id("document"), type: "Declaração de matrícula", fileName: `declaracao-matricula-${student.student.studentCode}.txt`, generatedContent: document, filters: { schoolId: school.id, classId: schoolClass.id, year: 2026 }, actorName: context.user.name, studentId: student.student.id });
        await tx.insert(operations.educationLibraryTitles).values({ id: id("book"), schoolId: school.id, title: "A bolsa amarela", author: "Lygia Bojunga", category: "Literatura infantojuvenil" });
        for (let index = 0; index < 2; index++) await tx.insert(operations.educationLibraryCopies).values({ id: id("copy", index), titleId: id("book"), assetCode: `BIB-2026-${9101 + index}` });
        await createEducationLibraryLoan(tx, { copyId: id("copy", 0), studentId: student.student.id, dueAt: date("2026-11-23") });
        await createEducationLibraryLoan(tx, { copyId: id("copy", 1), studentId: nextStudent.student.id, dueAt: date("2026-11-23") });
        const [returned] = await tx.select().from(operations.educationLibraryLoans).where(eq(operations.educationLibraryLoans.copyId, id("copy", 1)));
        await returnEducationLibraryLoan(tx, { loanId: returned.id, copyId: id("copy", 1) });
        await reserveEducationLibraryTitle(tx, id("book"), nextStudent.student.id);
        await tx.insert(operations.educationSchoolMenus).values({ id: id("menu"), schoolId: school.id, name: "Cardápio da semana de 9 de novembro", weekStart: date("2026-11-09"), shift: "Manhã", status: "Publicado", servingsPlanned: 120, items: { monday: "Arroz, feijão, frango, abóbora e banana", tuesday: "Macarrão com carne e salada de cenoura", wednesday: "Arroz, lentilha, omelete e laranja", thursday: "Sopa de legumes com frango", friday: "Arroz, feijão, carne moída e couve" } });
        // Keep food movements tied to food: never choose the first generic material.
        const [food] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "Material" WHERE "isActive" AND lower(name) LIKE '%arroz%' ORDER BY id LIMIT 1`)).rows;
        assert.ok(food, "Arroz não encontrado no catálogo de materiais.");
        await tx.insert(operations.educationFoodMovements).values([{ schoolId: school.id, materialId: food.id, type: "Entrada", quantity: 50, unitCost: "6.40", occurredAt: date("2026-11-05"), notes: "Recebimento de arroz para o preparo da alimentação escolar" }, { schoolId: school.id, materialId: food.id, type: "Saída", quantity: 8, unitCost: "6.40", occurredAt: date("2026-11-06"), notes: "Preparo da alimentação do turno da manhã" }]);
        await tx.insert(operations.educationFinancialAccounts).values({ id: id("school-account"), schoolId: school.id, name: "Recursos da unidade executora escolar" });
        await tx.insert(operations.educationFinancialMovements).values([{ accountId: id("school-account"), type: "Repasse", value: "12000.00", occurredAt: date("2026-10-01"), description: "Repasse para materiais pedagógicos e conservação da escola" }, { accountId: id("school-account"), type: "Despesa", value: "1800.00", occurredAt: date("2026-10-15"), description: "Aquisição de materiais de leitura e apoio pedagógico" }]);
        await tx.insert(operations.educationApplicationPlans).values({ id: id("application-plan"), schoolId: school.id, accountId: id("school-account"), title: "Plano de aplicação do quarto bimestre", total: "12000.00", status: "Rascunho", items: [{ description: "Materiais pedagógicos", quantity: 1, value: "6000.00" }, { description: "Conservação dos ambientes escolares", quantity: 1, value: "6000.00" }] });
        const [vehicle] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "FleetUnit" WHERE status='ATIVO' AND (lower(name) LIKE '%ônibus%' OR lower(name) LIKE '%micro%') ORDER BY id LIMIT 1`)).rows;
        assert.ok(vehicle, "Veículo de transporte coletivo não encontrado.");
        await tx.insert(operations.educationTransportRoutes).values({ id: id("route"), code: "ESC-2026-091", name: "Jardim das Acácias — escola municipal", schoolId: school.id, fleetUnitId: vehicle.id });
        await tx.insert(operations.educationTransportStops).values([{ routeId: id("route"), sequence: 1, name: "Praça das Acácias", address: "Praça das Acácias, 20, Jardim das Acácias", latitude: -19.92, longitude: -43.94 }, { routeId: id("route"), sequence: 2, name: school.name, address: "Portaria principal da escola", latitude: -19.921, longitude: -43.942 }]);
        for (const row of students.slice(0, 2)) await tx.insert(operations.educationTransportStudents).values({ routeId: id("route"), studentId: row.student.id, boardingStop: "Praça das Acácias" });
        await tx.insert(operations.educationTransportJourneys).values({ id: id("journey"), routeId: id("route"), fleetUnitId: vehicle.id, status: "Concluída", startedAt: new Date("2026-11-06T09:30:00Z"), endedAt: new Date("2026-11-06T10:10:00Z"), notes: "Percurso de entrada do turno da manhã" });
        await tx.insert(operations.educationTransportEvents).values([{ journeyId: id("journey"), type: "Embarque", occurredAt: new Date("2026-11-06T09:35:00Z"), notes: "Embarque dos estudantes na Praça das Acácias" }, { journeyId: id("journey"), type: "Chegada", occurredAt: new Date("2026-11-06T10:10:00Z"), notes: "Desembarque acompanhado na portaria da escola" }]);
        const [release] = await tx.select().from(interactive.pedagogicalReleases).where(eq(interactive.pedagogicalReleases.studentId, student.student.id)).limit(1);
        if (release) assert.equal(await completeEducationPedagogicalAttempt(tx, { releaseId: release.id, studentId: student.student.id, answers: { "1": "42", "2": "Brasília" } }), 100);
        const exported = `ESCOLA;${school.id};${school.name}\nTURMA;${schoolClass.id};${schoolClass.name}\n` + students.map(row => `ESTUDANTE;${row.student.studentCode};${row.person.fullName}`).join("\n");
        await tx.insert(core.educacensoOperations).values({ operationType: "Exportação", competence: "2026", layoutVersion: "CELERIFLOW-CSV-1", fileName: "cadastros-escolares-2026.csv", checksum: createHash("sha256").update(exported).digest("hex"), status: "Gerado", recordsRead: students.length + 2, validRecords: students.length + 2, generatedContent: exported, actorName: context.user.name, issues: [] });
        const [balance] = (await tx.execute<{ value: string }>(sql`SELECT sum(CASE WHEN type='Repasse' THEN value ELSE -value END)::text AS value FROM "EducationFinancialMovement" WHERE "accountId"=${id("school-account")}`)).rows;
        assert.equal(Number(balance.value), 10200);
        report.checks.push("Saldo escolar: 12.000,00 - 1.800,00 = 10.200,00", "Estoque alimentar: entrada 50 kg - consumo 8 kg = 42 kg", "Biblioteca: um empréstimo aberto, outro devolvido e reserva vinculada", "Declaração usa aluno, matrícula, turma e escola existentes", "Horário, diário, frequência e plano pedagógico da mesma turma");
        await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_POPULATION_PACKAGE", entityType: "DATASET", entityId: packageId, authorUsuarioId: context.user.id, payload: { fictional: true, references: JSON.parse(JSON.stringify(report.references)), checks: report.checks } });
        if (!apply) throw rollback;
      }, { timeoutMs: 240_000 });
    } catch (error) { if (error !== rollback) throw error; }
    report.status = "PASS";
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.message.slice(0, 500) : "Falha na operação escolar"; process.exitCode = 1; }
  finally {
    const output = "docs/plano-populacao-2026-11-08/execucao/educacao";
    mkdirSync(output, { recursive: true }); writeFileSync(`${output}/${apply ? "applied" : "preview"}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2)); await databaseConnection.pool.end();
  }
}
void main();
