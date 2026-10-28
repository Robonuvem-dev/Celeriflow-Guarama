import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { db, databaseConnection } from "../src/db/client";
import { schools, students } from "../src/db/schema/education-core";
import { preEnrollmentProcesses, preEnrollments } from "../src/db/schema/education-admissions";

async function main() {
  const schoolRows = await db.select({ id: schools.id }).from(schools).where(eq(schools.isActive, true)).orderBy(asc(schools.name));
  for (const school of schoolRows) {
    let [process] = await db.select().from(preEnrollmentProcesses).where(and(eq(preEnrollmentProcesses.schoolId, school.id), eq(preEnrollmentProcesses.year, 2027), eq(preEnrollmentProcesses.name, "Pré-matrícula 2027"))).limit(1);
    if (!process) [process] = await db.insert(preEnrollmentProcesses).values({ schoolId: school.id, name: "Pré-matrícula 2027", year: 2027, stage: "Ensino Fundamental", shift: "Manhã", capacity: 30, startDate: new Date("2026-09-01T12:00:00Z"), endDate: new Date("2026-11-30T12:00:00Z"), status: "Aberto", criteria: { priority: "Pontuação e data da solicitação" } }).returning();
    const candidates = await db.select({ id: students.id }).from(students).where(eq(students.status, "Ativo")).orderBy(asc(students.studentCode)).limit(3);
    for (const [index, student] of candidates.entries()) {
      const [existing] = await db.select({ id: preEnrollments.id }).from(preEnrollments).where(and(eq(preEnrollments.processId, process.id), eq(preEnrollments.studentId, student.id))).limit(1);
      if (!existing) await db.insert(preEnrollments).values({ processId: process.id, studentId: student.id, schoolId: school.id, year: 2027, stage: process.stage, grade: "Ano seguinte", shift: process.shift || "Manhã", protocol: `PM-2027-${school.id.slice(-3).toUpperCase()}${String(index + 1).padStart(3, "0")}`, rankingScore: 100 - index * 10, status: index < 2 ? "Classificado" : "Lista de espera", position: index + 1, history: [{ date: new Date().toISOString(), status: index < 2 ? "Classificado" : "Lista de espera" }] });
    }
  }
  console.log(`Pré-matrícula preparada para ${schoolRows.length} escola(s).`);
}
main().finally(() => databaseConnection.pool.end());
