import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { db, databaseConnection } from "../src/db/client";
import { schoolClasses, schoolSubjects, students, teachers } from "../src/db/schema/education-core";
import { educationSupportRequests, pedagogicalCatalogItems, pedagogicalReleases } from "../src/db/schema/education-interactive";

async function main() {
  const [subject] = await db.select({ id: schoolSubjects.id }).from(schoolSubjects).where(eq(schoolSubjects.isActive, true)).orderBy(asc(schoolSubjects.name)).limit(1);
  const [teacher] = await db.select({ id: teachers.id }).from(teachers).limit(1);
  const [schoolClass] = await db.select({ id: schoolClasses.id, grade: schoolClasses.grade }).from(schoolClasses).where(eq(schoolClasses.status, "Aberta")).limit(1);
  const [student] = await db.select({ id: students.id }).from(students).where(eq(students.status, "Ativo")).limit(1);
  let [item] = await db.select({ id: pedagogicalCatalogItems.id }).from(pedagogicalCatalogItems).where(eq(pedagogicalCatalogItems.title, "Desafio do conhecimento")).limit(1);
  if (!item) [item] = await db.insert(pedagogicalCatalogItems).values({ title: "Desafio do conhecimento", description: "Atividade interativa de revisão", schoolYear: schoolClass?.grade || "Ensino Fundamental", type: "Jogo", status: "Ativo", instructions: "Leia cada questão e escolha uma resposta.", durationSeconds: 600, subjectId: subject?.id, content: { questions: [{ id: 1, statement: "Quanto é 6 × 7?", answer: "42", options: ["36", "42", "48"] }, { id: 2, statement: "Qual é a capital do Brasil?", answer: "Brasília", options: ["Brasília", "Salvador", "Rio de Janeiro"] }] } }).returning({ id: pedagogicalCatalogItems.id });
  if (teacher && student) {
    const [existing] = await db.select({ id: pedagogicalReleases.id }).from(pedagogicalReleases).where(and(eq(pedagogicalReleases.catalogItemId, item.id), eq(pedagogicalReleases.teacherId, teacher.id), eq(pedagogicalReleases.studentId, student.id))).limit(1);
    if (!existing) await db.insert(pedagogicalReleases).values({ catalogItemId: item.id, teacherId: teacher.id, classId: schoolClass?.id, studentId: student.id });
  }
  const [request] = await db.select({ id: educationSupportRequests.id }).from(educationSupportRequests).where(eq(educationSupportRequests.protocol, "EDU-2026-00001")).limit(1);
  if (!request) await db.insert(educationSupportRequests).values({ protocol: "EDU-2026-00001", requesterName: "Secretaria Escolar", requesterEmail: "educacao@municipio.gov.br", subject: "Acesso ao portal", description: "Orientação para acesso do responsável.", status: "Em atendimento" });
  console.log("EDU-S5 preparado.");
}
main().finally(() => databaseConnection.pool.end());
