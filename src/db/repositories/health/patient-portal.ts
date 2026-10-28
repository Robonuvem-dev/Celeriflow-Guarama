import { sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { createId } from "../../ids";
import { nextYearlyCodeDrizzle } from "../platform/sequences";
import { healthTimestamp } from "./timestamp";
import { PatientPortalError } from "@/lib/contracts/patient-portal";
import type { PortalAppointment, PortalCampaign, PortalClinicalDocument, PortalDispensation, PortalLabReport, PortalManifestation, PortalPatientIdentity, PortalReferral, PortalRegulation, PortalSchedule, PortalVaccination } from "@/lib/contracts/patient-portal";

export async function findPortalPatient(database: DatabaseExecutor, userId: string, employeeId: string | null): Promise<PortalPatientIdentity | null> {
  const direct = await database.execute<PortalPatientIdentity & { status: string }>(sql`SELECT p.id,p."personId",p.status,person."fullName" FROM "Patient" p JOIN "Person" person ON person.id=p."personId" WHERE p."usuarioId"=${userId} LIMIT 1`);
  const patient = direct.rows[0];
  if (patient?.status === "Ativo") return { id: patient.id, personId: patient.personId, fullName: patient.fullName };
  if (!employeeId) return null;
  const result = await database.execute<PortalPatientIdentity>(sql`SELECT p.id,p."personId",person."fullName" FROM "Patient" p JOIN "Person" person ON person.id=p."personId" JOIN "Employee" e ON e."personId"=person.id WHERE p.status='Ativo' AND e.id=${employeeId} LIMIT 1`);
  return result.rows[0] ?? null;
}

export async function readPortalAppointments(database: DatabaseExecutor, patientId: string): Promise<PortalAppointment[]> {
  const result = await database.execute<Omit<PortalAppointment, "date"> & { date: string }>(sql`SELECT a.id,a.date,a.status,a.specialty,a.priority,json_build_object('name',u.name) AS unit,CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('specialty',p.specialty) END AS professional FROM "HealthAppointment" a JOIN "HealthUnit" u ON u.id=a."unitId" LEFT JOIN "HealthProfessional" p ON p.id=a."professionalId" WHERE a."patientId"=${patientId} ORDER BY a.date DESC LIMIT 100`);
  return result.rows.map(row => ({ ...row, date: healthTimestamp(row.date) }));
}

export async function findPortalAppointmentOwner(database: DatabaseExecutor, id: string): Promise<{ id: string; patientId: string } | null> {
  return (await database.execute<{ id: string; patientId: string }>(sql`SELECT id,"patientId" FROM "HealthAppointment" WHERE id=${id}`)).rows[0] ?? null;
}
export async function findPortalActiveUnit(database: DatabaseExecutor, id: string): Promise<{ id: string } | null> {
  return (await database.execute<{ id: string }>(sql`SELECT id FROM "HealthUnit" WHERE id=${id} AND "isActive"=true`)).rows[0] ?? null;
}
export async function readPortalUnits(database: DatabaseExecutor): Promise<{ id: string; name: string }[]> {
  return (await database.execute<{ id: string; name: string }>(sql`SELECT id,name FROM "HealthUnit" WHERE "isActive"=true ORDER BY name`)).rows;
}

export async function readPortalOpenSchedules(database: DatabaseExecutor): Promise<PortalSchedule[]> {
  const result = await database.execute<{ id: string; unitId: string; unit: string; specialty: string | null; professional: string | null; date: string | null; weekday: number | null; total: number; booked: number }>(sql`SELECT s.id,s."unitId",u.name AS unit,sp.name AS specialty,e.name AS professional,s.date,s.weekday,s."totalSlots" AS total,(SELECT count(*)::int FROM "HealthAppointment" a WHERE a."scheduleId"=s.id AND a.status IN ('Agendado','Confirmado','Aguardando','Em Atendimento')) AS booked FROM "HealthCareSchedule" s JOIN "HealthUnit" u ON u.id=s."unitId" LEFT JOIN "HealthSpecialty" sp ON sp.id=s."specialtyId" LEFT JOIN "HealthProfessional" p ON p.id=s."professionalId" LEFT JOIN "Employee" e ON e.id=p."employeeId" WHERE s.status='Ativo' ORDER BY s.date ASC,s.weekday ASC LIMIT 100`);
  return result.rows.map(s => ({ id: s.id, unitId: s.unitId, unit: s.unit, specialty: s.specialty || null, professional: s.professional || null, when: s.date ? healthTimestamp(s.date).toLocaleDateString("pt-BR") : s.weekday !== null ? ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][s.weekday] : "-", free: s.total - s.booked, total: s.total }));
}

export async function readPortalVaccinations(database: DatabaseExecutor, patientId: string): Promise<PortalVaccination[]> {
  const result = await database.execute<Omit<PortalVaccination, "date"> & { date: string }>(sql`SELECT r.id,r.date,r."doseNumber",r."lotNumber",json_build_object('name',v.name) AS vaccine,json_build_object('name',u.name) AS unit FROM "VaccinationRecord" r JOIN "Vaccine" v ON v.id=r."vaccineId" JOIN "HealthUnit" u ON u.id=r."unitId" WHERE r."patientId"=${patientId} ORDER BY r.date DESC LIMIT 200`);
  return result.rows.map(row => ({ ...row, date: healthTimestamp(row.date) }));
}
export async function readPortalDispensations(database: DatabaseExecutor, patientId: string): Promise<PortalDispensation[]> {
  const result = await database.execute<Omit<PortalDispensation, "date" | "nextWithdrawalAt"> & { date: string; nextWithdrawalAt: string | null }>(sql`SELECT d.id,d.date,d.quantity,d."dosageSnapshot",d.observation,d."nextWithdrawalAt",json_build_object('name',m.name) AS medicine,CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('name',u.name) END AS unit FROM "MedicineDispensation" d JOIN "Medicine" m ON m.id=d."medicineId" LEFT JOIN "HealthUnit" u ON u.id=d."unitId" WHERE d."patientId"=${patientId} AND d.status='ACTIVE' ORDER BY d.date DESC LIMIT 200`);
  return result.rows.map(row => ({ ...row, date: healthTimestamp(row.date), nextWithdrawalAt: row.nextWithdrawalAt ? healthTimestamp(row.nextWithdrawalAt) : null }));
}
export async function readPortalLabReports(database: DatabaseExecutor, patientId: string): Promise<PortalLabReport[]> {
  const result = await database.execute<Omit<PortalLabReport, "createdAt" | "releasedAt"> & { createdAt: string; releasedAt: string | null }>(sql`SELECT r.id,r."createdAt",r."releasedAt",json_build_object('id',d.id,'title',d.title,'fileUrl',d."fileUrl") AS document FROM "HealthLabReport" r JOIN "HealthLabOrder" o ON o.id=r."orderId" JOIN "Document" d ON d.id=r."documentId" WHERE o."patientId"=${patientId} AND r.status='RELEASED' AND r."publishedAt" IS NOT NULL ORDER BY r."createdAt" DESC LIMIT 100`);
  return result.rows.map(row => ({ ...row, createdAt: healthTimestamp(row.createdAt), releasedAt: row.releasedAt ? healthTimestamp(row.releasedAt) : null }));
}
export async function readPortalReferralsRegulation(database: DatabaseExecutor, patientId: string): Promise<{ referrals: PortalReferral[]; regulations: PortalRegulation[] }> {
  const [referrals, regulations] = await Promise.all([
    database.execute<Omit<PortalReferral, "date"> & { date: string }>(sql`SELECT id,date,specialty,status,priority FROM "HealthReferral" WHERE "patientId"=${patientId} ORDER BY date DESC LIMIT 100`),
    database.execute<Omit<PortalRegulation, "createdAt"> & { createdAt: string }>(sql`SELECT r.id,r."createdAt",r.status,r."guideNumber",r.priority,CASE WHEN sp.id IS NULL THEN NULL ELSE json_build_object('name',sp.name) END AS specialty,CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('name',s.name) END AS service FROM "HealthRegulationRequest" r LEFT JOIN "HealthSpecialty" sp ON sp.id=r."specialtyId" LEFT JOIN "HealthService" s ON s.id=r."serviceId" WHERE r."patientId"=${patientId} ORDER BY r."createdAt" DESC LIMIT 100`),
  ]);
  return { referrals: referrals.rows.map(row => ({ ...row, date: healthTimestamp(row.date) })), regulations: regulations.rows.map(row => ({ ...row, createdAt: healthTimestamp(row.createdAt) })) };
}
export async function readPortalDocuments(database: DatabaseExecutor, patientId: string): Promise<PortalClinicalDocument[]> {
  const result = await database.execute<Omit<PortalClinicalDocument, "createdAt"> & { createdAt: string }>(sql`SELECT c.id,c.kind,c."createdAt",json_build_object('id',d.id,'title',d.title,'fileUrl',d."fileUrl") AS document FROM "HealthClinicalDocument" c JOIN "MedicalRecord" m ON m.id=c."medicalRecordId" JOIN "Document" d ON d.id=c."documentId" WHERE m."patientId"=${patientId} ORDER BY c."createdAt" DESC LIMIT 100`);
  return result.rows.map(row => ({ ...row, createdAt: healthTimestamp(row.createdAt) }));
}
export async function readPortalCampaigns(database: DatabaseExecutor): Promise<PortalCampaign[]> {
  const startsAt = new Date(), endsAt = new Date();
  const result = await database.execute<Omit<PortalCampaign, "startsAt" | "endsAt" | "createdAt"> & { startsAt: string; endsAt: string; createdAt: string }>(sql`SELECT id,name,"startsAt","endsAt","publicInformation","actorUsuarioId","createdAt" FROM "HealthVaccinationCampaign" WHERE "startsAt"<=${startsAt.toISOString()}::timestamp AND "endsAt">=${endsAt.toISOString()}::timestamp ORDER BY "startsAt"`);
  return result.rows.map(row => ({ ...row, startsAt: healthTimestamp(row.startsAt), endsAt: healthTimestamp(row.endsAt), createdAt: healthTimestamp(row.createdAt) }));
}

export async function createPortalManifestation(tx: DatabaseTransaction, actorId: string, personId: string, input: { type: string; subject: string; description: string; isAnonymous: boolean }): Promise<{ id: string; protocolNumber: string }> {
  const channel = (await tx.execute<{ id: string }>(sql`SELECT id FROM "SupportChannel" WHERE "isActive"=true ORDER BY name LIMIT 1`)).rows[0];
  if (!channel) throw new PatientPortalError("Nenhum canal de ouvidoria ativo.");
  const existingCodes = (await tx.execute<{ code: string }>(sql`SELECT "protocolNumber" AS code FROM "Ombudsman"`)).rows;
  const protocolNumber = await nextYearlyCodeDrizzle({ db: tx, key: "OUV", prefix: "OUV", padding: 6, existingCodes });
  const id = createId(), now = new Date().toISOString();
  await tx.execute(sql`INSERT INTO "Ombudsman" (id,"protocolNumber",type,subject,description,"channelId","personId","isAnonymous","isConfidential","updatedAt") VALUES (${id},${protocolNumber},${input.type},${input.subject},${input.description},${channel.id},NULL,${input.isAnonymous},false,${now})`);
  if (!input.isAnonymous) await tx.execute(sql`INSERT INTO "OmbudsmanIdentity" (id,"ombudsmanId","personId") VALUES (${createId()},${id},${personId})`);
  await tx.execute(sql`INSERT INTO "OmbudsmanAuditLog" (id,"ombudsmanId","userId",action,details) VALUES (${createId()},${id},${actorId},'CREATED_VIA_PORTAL',${JSON.stringify({ type: input.type, isAnonymous: input.isAnonymous })}::jsonb)`);
  return { id, protocolNumber };
}

export async function readPortalManifestations(database: DatabaseExecutor, personId: string): Promise<PortalManifestation[]> {
  const rows = (await database.execute<Omit<PortalManifestation, "movements" | "interactions" | "respondedAt" | "createdAt"> & { respondedAt: string | null; createdAt: string }>(sql`SELECT o.id,o."protocolNumber",o.type,o.subject,o.status,o.response,o."respondedAt",o."createdAt" FROM "Ombudsman" o WHERE EXISTS (SELECT 1 FROM "OmbudsmanIdentity" i WHERE i."ombudsmanId"=o.id AND i."personId"=${personId}) ORDER BY o."createdAt" DESC`)).rows;
  if (!rows.length) return [];
  const ids = sql.join(rows.map(row => sql`${row.id}`), sql`, `);
  const [movements, interactions] = await Promise.all([
    database.execute<{ ombudsmanId: string; toDepartmentId: string; reason: string; createdAt: string }>(sql`SELECT "ombudsmanId","toDepartmentId",reason,"createdAt" FROM (SELECT *,row_number() OVER (PARTITION BY "ombudsmanId" ORDER BY "createdAt" DESC) AS rn FROM "OmbudsmanMovement" WHERE "ombudsmanId" IN (${ids})) m WHERE rn<=20 ORDER BY "createdAt" DESC`),
    database.execute<{ ombudsmanId: string; type: string; message: string; createdAt: string }>(sql`SELECT "ombudsmanId",type,message,"createdAt" FROM (SELECT *,row_number() OVER (PARTITION BY "ombudsmanId" ORDER BY "createdAt" DESC) AS rn FROM "OmbudsmanInteraction" WHERE "isInternal"=false AND "ombudsmanId" IN (${ids})) i WHERE rn<=20 ORDER BY "createdAt" DESC`),
  ]);
  return rows.map(row => ({ ...row, createdAt: healthTimestamp(row.createdAt), respondedAt: row.respondedAt ? healthTimestamp(row.respondedAt) : null, movements: movements.rows.filter(m => m.ombudsmanId === row.id).map(({ toDepartmentId, reason, createdAt }) => ({ toDepartmentId, reason, createdAt: healthTimestamp(createdAt) })), interactions: interactions.rows.filter(i => i.ombudsmanId === row.id).map(({ type, message, createdAt }) => ({ type, message, createdAt: healthTimestamp(createdAt) })) }));
}
