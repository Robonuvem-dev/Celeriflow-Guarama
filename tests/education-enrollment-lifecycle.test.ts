import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createEducationServiceFixture } from "./helpers/personnel-education-fixture";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { employees } from "../src/db/schema/administration";
import { classDiaries, enrollments, schools, schoolClasses, students, teachers } from "../src/db/schema/education-core";
import { educationAttendances } from "../src/db/schema/education-teaching";
import { moveEducationEnrollment } from "../src/lib/educacao/enrollment-service";
import { listTeachingWorkspaceClasses } from "../src/db/repositories/education/teaching";
import { canRecordAttendance } from "../src/lib/educacao/enrollment-lifecycle";
test("óbito e abandono mantêm histórico visível e aplicam critérios de faltas comprovadas", {timeout:60000}, async () => {
 const fixture = await createEducationServiceFixture(); const db = fixture.connection.db;
 try {
  await db.insert(people).values([{id:"p1",fullName:"Aluno A"},{id:"p2",fullName:"Aluno B"}]);
  await db.insert(students).values([{id:"s1",personId:"p1",studentCode:"A"},{id:"s2",personId:"p2",studentCode:"B"}]);
  await db.insert(schools).values({id:"school",name:"Escola"});
  await db.insert(employees).values({id:"employee",name:"Professor"}); await db.insert(teachers).values({id:"teacher",employeeId:"employee"});
  await db.insert(schoolClasses).values({id:"class",schoolId:"school",teacherId:"teacher",name:"A",year:2026,stage:"Fundamental",grade:"1",shift:"Manhã"});
  await db.insert(enrollments).values(["s1","s2"].map((studentId,i)=>({id:`e${i+1}`,studentId,schoolId:"school",classId:"class",year:2026,enrollmentDate:new Date("2026-02-01T12:00:00Z")})));
  const move = {enrollmentId:"e1",type:"Abandono",targetClassId:null,effectiveDate:new Date("2026-05-03T12:00:00Z"),reason:"Regulamento exige dois dias",destinationMunicipality:null,actorName:"Secretaria",minimumConsecutiveAbsences:2};
  await assert.rejects(withDatabaseTransaction(fixture.connection,tx=>moveEducationEnrollment(tx,move)),/insuficientes/);
  for (const day of ["02","03"]) {
   await db.insert(classDiaries).values({id:`d${day}`,classId:"class",teacherId:"teacher",date:new Date(`2026-05-${day}T12:00:00Z`),stage:"1º Bimestre"});
   await db.insert(educationAttendances).values({id:`a${day}`,diaryId:`d${day}`,studentId:"s1",isPresent:false});
  }
  await withDatabaseTransaction(fixture.connection,tx=>moveEducationEnrollment(tx,move));
  await withDatabaseTransaction(fixture.connection,tx=>moveEducationEnrollment(tx,{...move,enrollmentId:"e2",type:"Falecimento"}));
  const classes = await listTeachingWorkspaceClasses(db,"teacher");
  assert.deepEqual(classes[0].enrollments.map(e=>e.status).sort(),["Abandono","Falecido"]);
  for (const e of classes[0].enrollments) assert.equal(canRecordAttendance({enrollmentDate:e.enrollmentDate.toISOString(),endDate:e.endDate?.toISOString()},"2026-05-04"),false);
  assert.equal((await db.select().from(students).where(eq(students.id,"s2")))[0].status,"Falecido");
 } finally {await fixture.close();}
});
