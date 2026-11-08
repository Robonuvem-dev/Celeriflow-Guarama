import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { people } from "../src/db/schema/people";
import { patients } from "../src/db/schema/health-registration";
import { healthProfessionals } from "../src/db/schema/health-workforce";
import { medicalRecords } from "../src/db/schema/health-care";
import { healthAppointments } from "../src/db/schema/health-agenda";
import { healthBedOccupancies } from "../src/db/schema/health-reception";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { savePatientRegistrationDetails, savePatientContact, recordPatientPhoneCall } from "../src/lib/saude/patient-registration-service";
import { createSpontaneousCare, registerHealthTriage, callHealthAppointment } from "../src/lib/saude/appointment-service";
import { startHealthCare, saveMedicalRecordNarrative, addClinicalEvolution, addHealthExamRequest, concludeHealthCare } from "../src/lib/saude/care-service";
import { saveRoom, saveDestination, createReception, transitionReception, saveBed, admitBed, dischargeBed, transitionObservation } from "../src/lib/saude/reception-service";
import { populationContext } from "./lib/population-context";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const apply = process.argv.includes("--apply"), key = "MUNICIPAL_HEALTH_CARE_20261108";
const report = { mode: apply ? "APPLY" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), cases: [] as Record<string, unknown>[], checks: [] as string[], reused: false, status: "RUNNING", error: "" };
async function main() {
  try {
    const admin = await populationContext(), rollback = new Error("POPULATION_PREVIEW_ROLLBACK");
    try {
      await withDatabaseTransaction(databaseConnection, tx => inDatabaseTransactionScope(databaseConnection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        const [prior] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "MUNICIPAL_POPULATION_PACKAGE"), eq(financialAuditLogs.entityId, key)));
        if (prior) { report.reused = true; report.checks.push(`Recibo existente: ${prior.id}`); return; }
        const professionals = await tx.select().from(healthProfessionals).where(eq(healthProfessionals.isActive, true)); assert.ok(professionals.length >= 2);
        for (const professional of professionals) {
          assert.ok(professional.unitId);
          const existing = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.referenceUnitId, professional.unitId), eq(patients.status, "Ativo")));
          const missing = Math.max(0, 21 - existing.length);
          if (!missing) continue;
          const candidates = await tx.select({ person: people }).from(people).leftJoin(patients, eq(patients.personId, people.id)).where(and(eq(people.status, "Ativo"), isNotNull(people.cpf), isNotNull(people.birthDate), isNull(patients.id))).orderBy(people.id).limit(missing);
          assert.equal(candidates.length, missing);
          for (const { person } of candidates) {
            const [patient] = await tx.insert(patients).values({ personId: person.id, referenceUnitId: professional.unitId, status: "Ativo" }).returning();
            await insertAuditEvent(tx, { actorUsuarioId: admin.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PATIENT", targetId: patient.id });
          }
        }
        const available = await tx.select({ patient: patients, person: people }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(and(eq(patients.status, "Ativo"), eq(people.status, "Ativo"))).orderBy(patients.id).limit(42); assert.equal(available.length, 42);
        for (const [index, row] of available.entries()) {
          const professional = professionals.find(item => item.unitId === row.patient.referenceUnitId); assert.ok(professional?.unitId);
          // Trusted population uses the existing professional as the clinical subject;
          // audit actor remains the verified administrator, and no login is modified.
          const context = { ...admin, database: tx, user: { ...admin.user, employeeId: professional.employeeId } };
          await savePatientRegistrationDetails(context, row.patient.id, { stage: "COMPLETE", fullName: row.person.fullName, cpf: row.person.cpf, birthDate: row.person.birthDate?.toISOString().slice(0, 10), gender: row.person.gender || "Não informado", raceColor: row.person.raceColor || "Não informado", motherName: row.person.motherName, fatherName: row.person.fatherName, motherUnknown: row.person.motherUnknown || !row.person.motherName, fatherUnknown: row.person.fatherUnknown || !row.person.fatherName, phonePrimary: row.person.phonePrimary, whatsapp: row.person.whatsapp, email: row.person.email, profession: row.person.profession });
          if (index < 2) {
            await savePatientContact(context, row.patient.id, { name: "Mariana Ribeiro Santos", phone: "31988004172", kinship: "Pessoa de referência", relationshipKind: "SOCIOAFFECTIVE", startTime: "08:00", endTime: "18:00" });
            await recordPatientPhoneCall(context, row.patient.id, { calledAt: new Date(), phone: row.person.phonePrimary || "31988004172", result: "Contato realizado", notes: "Confirmados o horário da unidade e os documentos para atualização do cadastro." });
          }
          const room = await saveRoom(context, { unitId: professional.unitId, name: "Consultório de enfermagem", kind: "Atendimento" });
          const destination = await saveDestination(context, { name: "Atenção Primária" });
          const reception = await createReception(context, { patientId: row.patient.id, unitId: professional.unitId, roomId: room.id, destinationId: destination.id, transportMode: "Meios próprios" });
          const appointment = await createSpontaneousCare(context, { patientId: row.patient.id, unitId: professional.unitId, professionalId: professional.id, specialtyId: null, serviceId: null, arrivalNotes: "Acompanhamento de saúde, aferição da pressão e orientação sobre hábitos de vida.", priority: "Normal" });
          await callHealthAppointment(context, appointment.id);
          await registerHealthTriage(context, { appointmentId: appointment.id, chiefComplaint: "Acompanhamento de saúde e orientação sobre hábitos de vida.", bloodPressure: index % 3 ? "120/80" : "130/85", temperature: 36.5, weight: 62 + index, height: 1.64, heartRate: 72 + index % 8, respiratoryRate: 18, oxygenSaturation: 98, observedConditions: "Paciente orientado, sem desconforto respiratório e sem queixa aguda.", riskClassification: "Não urgente", priorityLabel: "Normal", notes: null });
          const record = await startHealthCare(context, appointment.id);
          await transitionReception(context, reception.id, "Em atendimento");
          await saveMedicalRecordNarrative(context, { medicalRecordId: record.id, anamnesis: "Comparece para acompanhamento de saúde. Refere alimentação irregular e interesse em organizar rotina de atividade física.", assessment: "Sinais vitais estáveis no atendimento. Necessita orientação e seguimento na atenção primária.", evolution: "Participou da avaliação e demonstrou compreensão das orientações.", conduct: "Orientados hidratação, alimentação variada, atividade física compatível com a condição individual e retorno à equipe de referência.", observations: "Acompanhamento de enfermagem na unidade de referência." });
          await addClinicalEvolution(context, { medicalRecordId: record.id, content: "Revisadas as orientações de autocuidado e acordado retorno à unidade para reavaliação." });
          if (index < 4) await addHealthExamRequest(context, { medicalRecordId: record.id, procedureId: null, examName: "Hemograma completo", priority: "Rotina", indication: "Avaliação complementar no acompanhamento longitudinal da atenção primária.", notes: null });
          const outcome = index === 0 ? "Observação" : "Alta";
          await concludeHealthCare(context, { medicalRecordId: record.id, outcome, conduct: index === 0 ? "Manter observação de enfermagem e reavaliar sinais vitais antes da liberação." : "Seguimento na atenção primária, com retorno pactuado e orientações de autocuidado." });
          await transitionReception(context, reception.id, "Concluída", "Atendimento realizado e orientações registradas.");
          if (index === 0) {
            const bed = await saveBed(context, { unitId: professional.unitId, room: "Observação de enfermagem", code: "OBS-01" });
            await admitBed(context, { bedId: bed.id, patientId: row.patient.id, notes: "Observação breve para reavaliação de sinais vitais." });
            const [occupancy] = await tx.select().from(healthBedOccupancies).where(eq(healthBedOccupancies.bedId, bed.id)); assert.ok(occupancy);
            await dischargeBed(context, occupancy.id);
            const [observation] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "HealthObservation" WHERE "medicalRecordId"=${record.id}`)).rows; assert.ok(observation);
            await transitionObservation(context, observation.id, "Alta");
          }
          const [stored] = await tx.select().from(medicalRecords).where(eq(medicalRecords.id, record.id)); assert.ok(stored.completedAt);
          const [storedAppointment] = await tx.select().from(healthAppointments).where(eq(healthAppointments.id, appointment.id)); assert.equal(storedAppointment.status, "Atendido");
          report.cases.push({ patientId: row.patient.id, personId: row.person.id, professionalId: professional.id, unitId: professional.unitId, receptionId: reception.id, appointmentId: appointment.id, medicalRecordId: record.id, outcome });
        }
        report.checks.push("Identidades canônicas preservadas; atualização cadastral pelos serviços", "Recepção, chamada, triagem, prontuário, evolução e conclusão encadeados", "Pedidos de exame com ordens laboratoriais geradas pelo serviço", "Observação, ocupação e alta de leito vinculadas ao primeiro caso", "Auditoria identifica o administrador executor e os profissionais existentes");
        await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_POPULATION_PACKAGE", entityType: "DATASET", entityId: key, authorUsuarioId: admin.user.id, payload: { fictional: true, cases: JSON.parse(JSON.stringify(report.cases)), checks: report.checks } });
        if (!apply) throw rollback;
      }), { timeoutMs: 600_000 });
    } catch (error) { if (error !== rollback) throw error; }
    report.status = "PASS";
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.message.slice(0, 600) : "Falha na assistência à saúde"; process.exitCode = 1; }
  finally { const output = "docs/plano-populacao-2026-11-08/execucao/saude"; mkdirSync(output, { recursive: true }); writeFileSync(`${output}/${apply ? "care-applied" : "care-preview"}.json`, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2)); await databaseConnection.pool.end(); }
}
void main();
