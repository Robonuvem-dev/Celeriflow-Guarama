import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { academicPeriods, curriculumMatrices, curriculumMatrixSubjects, enrollments, enrollmentMovements, schoolClasses, schools as schoolTable, schoolShifts, schoolSubjects } from "../src/db/schema/education-core";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não configurada.");
const connection = createDatabaseConnection(connectionString);
const db = connection.db;

async function main() {
  const schools = await db.select().from(schoolTable).orderBy(asc(schoolTable.name));
  if (!schools.length) throw new Error("Cadastre ou importe as escolas antes de preparar o núcleo acadêmico.");
  const subjects = await Promise.all([
    ["LP", "Língua Portuguesa"], ["MAT", "Matemática"], ["CIE", "Ciências"], ["HIS", "História"], ["GEO", "Geografia"],
  ].map(async ([code, name]) => {
    const [subject] = await db.insert(schoolSubjects).values({ code, name }).onConflictDoUpdate({ target: schoolSubjects.code, set: { name, isActive: true, updatedAt: new Date() } }).returning();
    return subject;
  }));
  for (const school of schools) {
    const [period] = await db.insert(academicPeriods).values({ schoolId: school.id, code: "2026-REG", name: "Ano letivo 2026", year: 2026, modality: "Regular", startDate: new Date("2026-02-05T12:00:00Z"), endDate: new Date("2026-12-18T12:00:00Z"), status: "Em andamento" }).onConflictDoUpdate({ target: [academicPeriods.schoolId, academicPeriods.code], set: { status: "Em andamento", updatedAt: new Date() } }).returning();
    await db.insert(schoolShifts).values({ schoolId: school.id, name: "Manhã", type: "Parcial", startTime: "07:30", endTime: "12:00", weekdays: [1, 2, 3, 4, 5] }).onConflictDoUpdate({ target: [schoolShifts.schoolId, schoolShifts.name], set: { isActive: true, updatedAt: new Date() } });
    const [matrix] = await db.insert(curriculumMatrices).values({ schoolId: school.id, periodId: period.id, name: "Ensino Fundamental - Anos Iniciais", stage: "Ensino Fundamental", grade: "1º ao 5º Ano", annualWorkload: 800 }).onConflictDoUpdate({ target: [curriculumMatrices.schoolId, curriculumMatrices.periodId, curriculumMatrices.name, curriculumMatrices.version], set: { status: "Ativa", updatedAt: new Date() } }).returning();
    for (const subject of subjects) await db.insert(curriculumMatrixSubjects).values({ matrixId: matrix.id, subjectId: subject.id, workload: 160, weeklyLessons: 4 }).onConflictDoUpdate({ target: [curriculumMatrixSubjects.matrixId, curriculumMatrixSubjects.subjectId], set: { workload: 160, weeklyLessons: 4, updatedAt: new Date() } });
    const classes = await db.select().from(schoolClasses).where(and(eq(schoolClasses.schoolId, school.id), eq(schoolClasses.year, 2026)));
    for (const schoolClass of classes) {
      await db.update(schoolClasses).set({ periodId: period.id, matrixId: schoolClass.matrixId || matrix.id }).where(eq(schoolClasses.id, schoolClass.id));
      const classEnrollments = await db.select().from(enrollments).where(eq(enrollments.classId, schoolClass.id));
      for (const enrollment of classEnrollments) {
        await db.update(enrollments).set({ periodId: period.id, supportCode: enrollment.supportCode || `MAT-${enrollment.year}-${enrollment.id.slice(-8).toUpperCase()}` }).where(eq(enrollments.id, enrollment.id));
        const [existing] = await db.select({ id: enrollmentMovements.id }).from(enrollmentMovements).where(and(eq(enrollmentMovements.enrollmentId, enrollment.id), eq(enrollmentMovements.type, "Matrícula"))).limit(1);
        if (!existing) await db.insert(enrollmentMovements).values({ enrollmentId: enrollment.id, type: "Matrícula", effectiveDate: enrollment.enrollmentDate, targetClassId: schoolClass.id, actorName: "Carga acadêmica" });
      }
    }
  }
  console.log(`Núcleo acadêmico preparado para ${schools.length} escola(s).`);
}

main().finally(() => connection.pool.end());
