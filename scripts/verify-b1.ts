import { config } from "dotenv";
import { and, eq, gte, lt, inArray, isNotNull, ne } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { healthUnits, healthProfessionals } from "../src/db/schema/health-workforce";
import { healthSpecialties } from "../src/db/schema/health-administration";
import { patients } from "../src/db/schema/health-registration";
import { people } from "../src/db/schema/people";
import { calendarEvents } from "../src/db/schema/administration";
import { healthAppointments, healthAppointmentEvents, healthCareSchedules, healthWaitlists } from "../src/db/schema/health-agenda";
import type { AppContext } from "../src/lib/platform/tenant-context";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { db, databaseConnection } = await import("../src/db/client");
  const schedule = await import("../src/lib/saude/schedule-service");
  const { createHealthAppointment } = await import("../src/lib/saude/appointment-service");
  try {
    const [admin] = await db.select().from(users).where(isNotNull(users.employeeId)).limit(1);
    const ctx: AppContext = { database: db, user: { id: admin!.id, firebaseUid: admin!.firebaseUid || "", email: admin!.email, name: admin!.nome, role: "admin", profileCode: "ADMIN", modulePermissions: [], allowedBudgetUnitIds: [], allowedHealthUnitIds: [], hasHealthAccessScope: false, employeeId: admin!.employeeId, departmentId: null, secretariatId: null } };
    const [unit] = await db.select({ id: healthUnits.id }).from(healthUnits).where(eq(healthUnits.isActive,true)).limit(1);
    const [professional] = await db.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.isActive,true),eq(healthProfessionals.unitId,unit!.id))).limit(1);
    const [specialty] = await db.select({ id: healthSpecialties.id }).from(healthSpecialties).where(eq(healthSpecialties.isActive,true)).limit(1);

    const candidates = await db.select({id:patients.id,person:{cpf:people.cpf}}).from(patients).innerJoin(people,eq(people.id,patients.personId)).where(and(eq(patients.status,"Ativo"),ne(patients.cns,""))).limit(50);
    const patient = candidates.find(c => c.person.cpf);
    const testPatientIds = candidates.filter(c => c.person.cpf).slice(0, 3).map(c => c.id);
    const stale = await db.select({id:healthAppointments.id}).from(healthAppointments).where(and(inArray(healthAppointments.patientId,testPatientIds),gte(healthAppointments.date,new Date("2026-10-20T00:00:00")),lt(healthAppointments.date,new Date("2026-10-21T00:00:00"))));
    await db.delete(healthAppointmentEvents).where(inArray(healthAppointmentEvents.appointmentId,stale.map(s=>s.id)));
    await db.delete(healthAppointments).where(inArray(healthAppointments.id,stale.map(s=>s.id)));
    await db.delete(healthCareSchedules).where(and(eq(healthCareSchedules.kind,"DIARIO"),eq(healthCareSchedules.date,new Date("2026-10-20T12:00:00")),eq(healthCareSchedules.totalSlots,2),eq(healthCareSchedules.startTime,"08:00")));
    const sched = await schedule.saveSchedule(ctx, { kind: "DIARIO", unitId: unit!.id, specialtyId: specialty?.id || null, professionalId: professional?.id || null, date: "2026-10-20", startTime: "08:00", endTime: "12:00", totalSlots: 2 });
    console.log("cronograma", sched.id);
    const a1 = await createHealthAppointment(ctx, { patientId: patient!.id, unitId: unit!.id, professionalId: professional?.id || null, date: "2026-10-20T08:00", specialtyId: specialty?.id || null, priority: "Normal", specialty: null, schedulingGroupId: null, serviceId: null, scheduleId: sched.id, visitType: "Primeira" });
    const patient2 = candidates.find(c => c.id !== patient!.id && c.person.cpf);
    const a2 = await createHealthAppointment(ctx, { patientId: patient2!.id, unitId: unit!.id, professionalId: professional?.id || null, date: "2026-10-20T08:30", specialtyId: specialty?.id || null, priority: "Normal", specialty: null, schedulingGroupId: null, serviceId: null, scheduleId: sched.id, visitType: "Retorno" });
    console.log("2 vagas ocupadas");
    try {
      const p3 = candidates.find(c => c.id !== patient!.id && c.id !== patient2!.id && c.person.cpf);
      await createHealthAppointment(ctx, { patientId: p3!.id, unitId: unit!.id, professionalId: null, specialtyId: null, visitType: null, date: "2026-10-20T09:00", priority: "Normal", specialty: null, schedulingGroupId: null, serviceId: null, scheduleId: sched.id });
      throw new Error("Overbooking aceito");
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.includes("vagas")) throw e;
      console.log("overbooking bloqueado ok");
    }
    try {
      await createHealthAppointment(ctx, { patientId: patient!.id, unitId: unit!.id, professionalId: null, visitType: null, scheduleId: null, date: "2026-10-21T08:00", specialtyId: specialty?.id || null, priority: "Normal", specialty: null, schedulingGroupId: null, serviceId: null });
      throw new Error("Duplicidade aceita");
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.includes("já possui agendamento")) throw e;
      console.log("limite por paciente ok");
    }
    await db.insert(calendarEvents).values({title:"Feriado B1",date:new Date("2026-11-02T12:00:00"),type:"Nacional",isHoliday:true});
    try {
      await createHealthAppointment(ctx, { patientId: patient2!.id, unitId: unit!.id, professionalId: null, specialtyId: null, visitType: null, scheduleId: null, date: "2026-11-02T08:00", priority: "Normal", specialty: null, schedulingGroupId: null, serviceId: null });
      throw new Error("Feriado aceito");
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.includes("bloqueado")) throw e;
      console.log("feriado bloqueado ok");
    }
    await db.delete(calendarEvents).where(eq(calendarEvents.title,"Feriado B1"));

    const moved = await schedule.remanejarAppointment(ctx, { appointmentId: a1.id, date: "2026-10-20T10:00", reason: "Remanejo B1" });
    console.log("remanejado", moved.id);
    const wait = await schedule.addWaitlist(ctx, { patientId: patient2!.id, specialtyId: specialty?.id || null, priority: "Prioridade" });
    await schedule.transitionWaitlist(ctx, wait.id, "Chamado");
    console.log("espera chamada ok");

    await schedule.transitionSchedule(ctx, sched.id, "Bloqueado", "Bloqueio B1");
    const avail = await db.transaction(async tx => schedule.scheduleAvailability(tx, sched.id));
    console.log("bloqueio ok", avail.status);
    await schedule.transitionSchedule(ctx, sched.id, "Ativo");

    // Limpeza
    await db.delete(healthAppointmentEvents).where(inArray(healthAppointmentEvents.appointmentId,[a1.id,a2.id]));
    await db.delete(healthAppointments).where(inArray(healthAppointments.id,[a1.id,a2.id]));
    await db.delete(healthWaitlists).where(eq(healthWaitlists.id,wait.id));
    await db.delete(healthCareSchedules).where(eq(healthCareSchedules.id,sched.id));
    console.log(JSON.stringify({ status: "B1 READY" }));
  } finally {
    await databaseConnection.pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
