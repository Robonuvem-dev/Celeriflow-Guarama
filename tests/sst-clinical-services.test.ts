import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { assertDisciplineAccess, disciplineUnitWhere } from "../src/lib/sst/clinical-access";
import { clinicalRecordInput, vaccinationInput } from "../src/lib/sst/clinical-policy";
import { registerClinicalRecord, registerOccupationalVaccination, registerProfessionalRole, registerDisciplineGrant, clinicalRecordDocument, listClinicalRecords, listOccupationalVaccinations } from "../src/lib/sst/clinical-service";
import { SstValidationError } from "../src/lib/sst/errors";

const key = "2d161f17-63ca-4d57-9c87-82c4f74e4d5a";
const otherKey = "4d161f17-63ca-4d57-9c87-82c4f74e4d5a";
const user = { id: "actor", name: "Registrador", profileCode: "SST_OPERATOR", modulePermissions: [], allowedBudgetUnitIds: ["ug"], permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true } } }) };
const visit = { budgetUnitId: "ug", personId: "worker", professionalRoleId: "role", discipline: "MEDICINE", attendedAt: "2026-10-01T03:00:00Z", occupationalContext: "Exposição ocupacional", narrative: "Atendimento clínico", opinion: "Parecer profissional", submissionKey: key };
const shot = { budgetUnitId: "ug", personId: "worker", professionalRoleId: "role", vaccineId: "vaccine", administeredAt: "2026-10-01", doseNumber: 1, lotNumber: "LOT-1", source: "EXTERNAL_PROOF", occupationalContext: "Comprovante externo conferido", submissionKey: key };

function fixture() {
  const clinical: Record<string, unknown>[] = [], vaccinations: Record<string, unknown>[] = [], audits: Record<string, unknown>[] = [], professionalWrites: Record<string, unknown>[] = [];
  const historyQueries: { sql: string; values: unknown[] }[] = [], roleDates: Date[] = [], locks: string[] = [];
  const role = { id: "role", budgetUnitId: "ug", discipline: "MEDICINE", usuarioId: "actor", council: "CRM PR 123", isActive: true, startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-01"), person: { fullName: "Profissional" } };
  const state = { history: [{ id: "period" }], worker: true, activeUser: true, medicine: true, vaccine: true, vaccineCreateError: null as unknown, disciplineGrant: { isActive: true, canRead: true, canWrite: true }, genericGrant: { isActive: true, canReadClinical: true, canAssess: true } };
  const questionnaire = { id: "q", budgetUnitId: "ug", discipline: "MEDICINE", title: "Anamnese", code: "MED", version: 1, questions: [{ key: "symptom", label: "Sintoma", kind: "TEXT", required: true }] };
  const tx = {
    $executeRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => { locks.push(String(values[0])); return 1; },
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      if (sql.join("").includes("HrEmployeeFunctionalPeriod")) { historyQueries.push({ sql: sql.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ""), ""), values }); return state.history; }
      assert.match(sql.join(""), /FOR SHARE/); return [{ id: role.id }];
    },
    person: { findUnique: async () => ({ id: "worker", fullName: "Servidor", employee: state.worker ? { id: "employee", secretariatId: "CURRENT_OTHER_SECRETARIAT" } : null }) },
    usuario: { findFirst: async () => state.activeUser ? { id: "actor" } : null },
    budgetUnit: { findUnique: async () => ({ id: "ug" }), findUniqueOrThrow: async () => ({ id: "ug", name: "UG histórica", secretariatId: "HISTORICAL_SECRETARIAT" }) },
    sstProfessionalRole: {
      findUnique: async () => ({ discipline: role.discipline }),
      findFirst: async ({ where }: { where: { id?: string; budgetUnitId: string; discipline: string; OR?: { personId?: string; usuarioId?: string }[]; startsAt: { lte: Date }; endsAt: { gte: Date } } }) => {
        if (!where.id) {
          const existing = professionalWrites.find((row) => row.budgetUnitId === where.budgetUnitId && row.discipline === where.discipline && (row.startsAt as Date) <= where.startsAt.lte && (row.endsAt as Date) >= where.endsAt.gte && where.OR?.some((link) => link.personId ? row.personId === link.personId : row.usuarioId === link.usuarioId));
          return existing ? { id: "new-role", ...existing } : null;
        }
        roleDates.push(where.startsAt.lte);
        return role.isActive && role.budgetUnitId === where.budgetUnitId && role.discipline === where.discipline && role.startsAt <= where.startsAt.lte && role.endsAt >= where.endsAt.gte ? role : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => { professionalWrites.push(data); return { id: "new-role", ...data }; },
    },
    sstDisciplineGrant: { upsert: async ({ create }: { create: Record<string, unknown> }) => { state.disciplineGrant = { isActive: Boolean(create.isActive), canRead: Boolean(create.canRead), canWrite: Boolean(create.canWrite) }; return { id: "grant" }; } },
    sstQuestionnaireVersion: { findUnique: async () => questionnaire },
    medicine: { findMany: async () => state.medicine ? [{ id: "medicine", name: "Nome canônico" }] : [] },
    vaccine: { findFirst: async () => state.vaccine ? { id: "vaccine", name: "Vacina canônica" } : null },
    sstClinicalRecord: {
      findUnique: async () => clinical[0] || null,
      findUniqueOrThrow: async () => clinical[0],
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "visit", createdAt: new Date("2026-10-01T04:00:00Z"), ...data }; clinical.push(row); return row; },
    },
    reportTemplate: { findUnique: async ({ where }: { where: { scope: string } }) => { assert.equal(where.scope, "GLOBAL"); return { version: 7, fingerprint: "configured-template", header: "Cabeçalho configurado", footer: "Rodapé configurado", orientation: "PORTRAIT", includeEmissionMetadata: true }; } },
    institution: { findFirst: async () => ({ name: "Instituição", legalName: "Instituição canônica", cnpj: null, address: null, city: null, state: null }) },
    sstVaccination: {
      findUnique: async ({ where }: { where: { budgetUnitId_submissionKey: { submissionKey: string } } }) => vaccinations.find((row) => row.submissionKey === where.budgetUnitId_submissionKey.submissionKey) || null,
      findFirst: async ({ where }: { where: { personId: string; vaccineId: string; doseNumber: number; administeredAt: Date } }) => vaccinations.find((row) => row.personId === where.personId && row.vaccineId === where.vaccineId && row.doseNumber === where.doseNumber && (row.administeredAt as Date).getTime() === where.administeredAt.getTime()) || null,
      create: async ({ data }: { data: Record<string, unknown> }) => { if (state.vaccineCreateError) throw state.vaccineCreateError; const row = { id: vaccinations.length ? `shot-${vaccinations.length + 1}` : "shot", ...data }; vaccinations.push(row); return row; },
    },
    auditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return {}; } },
  };
  const context = { user: { ...user }, prisma: { ...tx, sstAccessGrant: { findUnique: async () => state.genericGrant }, sstDisciplineGrant: { findUnique: async () => state.disciplineGrant }, $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } } as unknown as AppContext;
  return { context, role, state, questionnaire, clinical, vaccinations, audits, professionalWrites, historyQueries, roleDates, locks };
}

test("generic clinical authorization cannot read psychology without its discipline grant; module and UG are enforced first", async () => {
  const f = fixture(); f.state.disciplineGrant.canRead = false;
  await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY"), /atuação profissional/);
  await assert.rejects(assertDisciplineAccess(f.context, "other", "PSYCHOLOGY"), /Unidade Gestora/);
  f.state.disciplineGrant.canRead = true; f.state.disciplineGrant.isActive = false;
  await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY"), /atuação profissional/);
  f.state.disciplineGrant.isActive = true; f.state.disciplineGrant.canWrite = false;
  await assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY");
  await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY", true));
  f.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: true } } });
  await assert.rejects(assertDisciplineAccess(f.context, "ug", "MEDICINE"), /módulo SST/);
  assert.deepEqual(disciplineUnitWhere(f.context, "MEDICINE"), { id: { in: [] } });
});

test("only the canonical role usuario may author a visit or proof; generic privilege cannot self-create a habilitation", async () => {
  const f = fixture(); f.role.usuarioId = "someone-else";
  await assert.rejects(registerClinicalRecord(f.context, visit), /usuário registrador/);
  await assert.rejects(registerOccupationalVaccination(f.context, shot), /usuário registrador/);
  await assert.rejects(registerProfessionalRole(f.context, {}), /administração técnica/);
  await assert.rejects(registerDisciplineGrant(f.context, {}), /administração técnica/);
  f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
  await assert.rejects(registerClinicalRecord(f.context, visit), /usuário registrador/);
  await assert.rejects(registerOccupationalVaccination(f.context, shot), /usuário registrador/);
  assert.equal(f.clinical.length + f.vaccinations.length, 0);
});

test("discipline authorization is sysadmin-only, rejects inactive users and reflects audited revocation", async () => {
  const f = fixture(); f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
  const grant = { usuarioId: "actor", budgetUnitId: "ug", discipline: "PSYCHOLOGY", canRead: true, canWrite: true, isActive: true };
  await assert.rejects(registerDisciplineGrant(f.context, { ...grant, canRead: false }), /leitura/);
  f.state.activeUser = false;
  await assert.rejects(registerDisciplineGrant(f.context, grant), /inativo/);
  f.state.activeUser = true;
  assert.equal(await registerDisciplineGrant(f.context, grant), "grant");
  assert.equal(f.audits[0].targetType, "SST_DISCIPLINE_GRANT");
  await registerDisciplineGrant(f.context, { ...grant, isActive: false });
  f.context.user.profileCode = "SST_OPERATOR";
  await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY"), /atuação profissional/);
  assert.equal(f.audits.length, 2);
});

test("civil day validity is inclusive and vaccines DATE never shift to the preceding day", async () => {
  const f = fixture();
  await registerClinicalRecord(f.context, visit);
  assert.equal(f.roleDates[0].toISOString(), "2026-10-01T00:00:00.000Z");
  const before = fixture();
  await assert.rejects(registerClinicalRecord(before.context, { ...visit, attendedAt: "2026-10-01T02:59:59Z" }), /vigência/);
  await assert.rejects(registerClinicalRecord(before.context, { ...visit, attendedAt: "2026-10-02T03:00:00Z" }), /vigência/);
  await registerOccupationalVaccination(f.context, shot);
  assert.equal(f.roleDates.at(-1)!.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal((f.vaccinations[0].administeredAt as Date).toISOString(), "2026-10-01T00:00:00.000Z");
  f.role.isActive = false;
  await assert.rejects(registerClinicalRecord(f.context, { ...visit, submissionKey: otherKey }), /outros dados/);
  const inactive = fixture(); inactive.role.isActive = false;
  await assert.rejects(registerClinicalRecord(inactive.context, visit), /vigência/);
  await assert.rejects(registerOccupationalVaccination(inactive.context, shot), /vigência/);
  await assert.rejects(registerClinicalRecord(fixture().context, { ...visit, attendedAt: "2999-01-01T03:00:00Z" }), /futura/);
  for (const value of ["not-a-date", "2026-02-30T03:00:00Z", Infinity]) assert.equal(clinicalRecordInput.safeParse({ ...visit, attendedAt: value }).success, false);
  for (const value of ["2026-02-30", "2026-10-01T00:00:00Z", Infinity]) assert.equal(vaccinationInput.safeParse({ ...shot, administeredAt: value }).success, false);
});

test("professional registration preserves canonical council/dates and rejects inactive account bindings", async () => {
  const f = fixture(); f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
  const input = { budgetUnitId: "ug", personId: "doctor", usuarioId: "actor", discipline: "MEDICINE", council: "CRM PR 123", startsAt: "2026-10-01", endsAt: "2026-10-01" };
  f.state.activeUser = false;
  await assert.rejects(registerProfessionalRole(f.context, input), /inativo/);
  f.state.activeUser = true;
  assert.equal(await registerProfessionalRole(f.context, input), "new-role");
  assert.equal(f.professionalWrites[0].council, "CRM PR 123");
  assert.equal(f.professionalWrites[0].usuarioId, "actor");
  assert.equal(f.professionalWrites[0].createdById, "actor");
  assert.equal((f.professionalWrites[0].startsAt as Date).toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(f.audits[0].targetType, "SST_PROFESSIONAL");
  assert.ok(f.locks.includes("SST_PROFESSIONAL:ug:MEDICINE"));
  await assert.rejects(registerProfessionalRole(f.context, { ...input, endsAt: "2026-09-30" }));
});

test("identical professional creation retries return the original id without a second write/audit; conflicting metadata or creator blocks", async () => {
  const f = fixture(); f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
  const input = { budgetUnitId: "ug", personId: "doctor", usuarioId: "actor", discipline: "MEDICINE", council: "CRM PR 123", startsAt: "2026-10-01", endsAt: "2026-10-01" };
  assert.equal(await registerProfessionalRole(f.context, input), "new-role");
  assert.equal(await registerProfessionalRole(f.context, input), "new-role");
  for (const changes of [{ council: "CRM PR 999" }, { usuarioId: "other-user" }, { personId: "other-professional" }, { startsAt: "2026-09-30" }, { endsAt: "2026-10-02" }]) {
    await assert.rejects(registerProfessionalRole(f.context, { ...input, ...changes }), /sobreposta/);
  }
  f.context.user.id = "other-admin";
  await assert.rejects(registerProfessionalRole(f.context, input), /sobreposta/);
  assert.equal(f.professionalWrites.length, 1); assert.equal(f.audits.length, 1);
  const unlinked = fixture(); unlinked.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
  assert.equal(await registerProfessionalRole(unlinked.context, { ...input, usuarioId: "" }), "new-role");
  assert.equal(await registerProfessionalRole(unlinked.context, { ...input, usuarioId: "" }), "new-role");
  assert.equal(unlinked.professionalWrites[0].usuarioId, null);
  assert.equal(unlinked.professionalWrites.length, 1);
});

test("a medical clinic user with an own canonical role and clinical write grants cannot edit their own authorization", async () => {
  const f = fixture(); f.context.user.profileCode = "MEDICAL_CLINIC";
  f.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: false, create: true, update: true } } });
  await registerClinicalRecord(f.context, visit);
  const before = { ...f.state.disciplineGrant };
  for (const changes of [{ isActive: false }, { canWrite: false }, { discipline: "PSYCHOLOGY" }]) {
    await assert.rejects(registerDisciplineGrant(f.context, { usuarioId: "actor", budgetUnitId: "ug", discipline: "MEDICINE", ...before, ...changes }), /administração técnica/);
  }
  assert.deepEqual(f.state.disciplineGrant, before);
  assert.equal(f.audits.length, 1);
});

test("historical worker UG is explicit: current secretariat does not grant or deny coverage and missing/ambiguous history blocks", async () => {
  const f = fixture(); await registerClinicalRecord(f.context, visit);
  assert.equal(f.historyQueries.length, 1);
  assert.match(f.historyQueries[0].sql, /NOT p.voided/);
  assert.match(f.historyQueries[0].sql, /supersedesId/);
  assert.deepEqual(f.historyQueries[0].values.slice(0, 2), ["employee", "ug"]);
  assert.ok(f.locks.includes("HR_FUNCTIONAL:employee"));
  for (const history of [[], [{ id: "a" }, { id: "b" }]]) {
    const missing = fixture(); missing.state.history = history;
    await assert.rejects(registerClinicalRecord(missing.context, visit), /período funcional RH/);
    await assert.rejects(registerOccupationalVaccination(missing.context, shot), /período funcional RH/);
    assert.equal(missing.clinical.length + missing.vaccinations.length, 0);
  }
  const nonWorker = fixture(); nonWorker.state.worker = false;
  await assert.rejects(registerClinicalRecord(nonWorker.context, visit), /servidor canônico/);
});

test("questionnaire scope, canonical medicine and MEDICINE-only requests are enforced before writes", async () => {
  const input = { ...visit, questionnaireVersionId: "q", answers: { symptom: "Dor" } };
  for (const field of ["budgetUnitId", "discipline"] as const) {
    const f = fixture(); f.questionnaire[field] = "other";
    await assert.rejects(registerClinicalRecord(f.context, input), /Questionário incompatível/);
    assert.equal(f.clinical.length, 0);
  }
  const f = fixture();
  await assert.rejects(registerClinicalRecord(f.context, { ...input, answers: { unknown: "PHI" } }), /não pertencem/);
  const medication = { kind: "MEDICATION", description: "Nome adulterado", medicineId: "medicine", instructions: "Uma dose diária", quantity: 1, days: 1 };
  f.state.medicine = false;
  await assert.rejects(registerClinicalRecord(f.context, { ...visit, requests: [medication] }), /catálogo canônico/);
  f.state.medicine = true;
  await registerClinicalRecord(f.context, { ...visit, requests: [medication] });
  assert.equal((f.clinical[0].requests as { description: string }[])[0].description, "Nome canônico");
  assert.equal((f.clinical[0].snapshot as { council: string }).council, "CRM PR 123");
  for (const discipline of ["NURSING", "PSYCHOLOGY", "SOCIAL_WORK"]) {
    assert.equal(clinicalRecordInput.safeParse({ ...visit, discipline, requests: [medication] }).success, false);
    assert.equal(clinicalRecordInput.safeParse({ ...visit, discipline, requests: [{ kind: "EXAM", description: "Exame" }] }).success, false);
    assert.equal(clinicalRecordInput.safeParse({ ...visit, discipline, requests: [{ kind: "REFERRAL", description: "Encaminhamento" }] }).success, true);
  }
});

test("identical retries preserve council snapshots and audit count; changed payload/actor and duplicate vaccine doses block", async () => {
  const f = fixture();
  assert.equal(await registerClinicalRecord(f.context, visit), "visit");
  f.role.council = "CRM alterado";
  assert.equal(await registerClinicalRecord(f.context, visit), "visit");
  assert.equal((f.clinical[0].snapshot as { council: string }).council, "CRM PR 123");
  await assert.rejects(registerClinicalRecord(f.context, { ...visit, narrative: "Outro atendimento" }), /outros dados/);
  await registerOccupationalVaccination(f.context, shot);
  assert.equal(await registerOccupationalVaccination(f.context, shot), "shot");
  await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, lotNumber: "OTHER" }), /outros dados/);
  await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, submissionKey: otherKey }), /Dose.*já registrada/);
  f.context.user.id = "other-actor";
  await assert.rejects(registerClinicalRecord(f.context, visit), /outros dados/);
  await assert.rejects(registerOccupationalVaccination(f.context, shot), /outros dados/);
  assert.equal(f.clinical.length, 1); assert.equal(f.vaccinations.length, 1); assert.equal(f.audits.length, 2);
  assert.deepEqual(Object.keys(f.audits[0]).sort(), ["actorUsuarioId", "eventType", "targetId", "targetType"]);
});

test("same vaccine/person/dose/date blocks a new submission but annual cycles on another civil date are allowed in canonical scope", async () => {
  const f = fixture(); f.role.startsAt = new Date("2025-10-01");
  const previous = { ...shot, administeredAt: "2025-10-01" };
  assert.equal(await registerOccupationalVaccination(f.context, previous), "shot");
  await assert.rejects(registerOccupationalVaccination(f.context, { ...previous, submissionKey: otherKey }), /já registrada.*nesta data/);
  assert.equal(await registerOccupationalVaccination(f.context, { ...shot, submissionKey: otherKey }), "shot-2");
  assert.equal(await registerOccupationalVaccination(f.context, { ...shot, submissionKey: otherKey }), "shot-2");
  assert.equal(f.vaccinations.length, 2); assert.equal(f.audits.length, 2);
  assert.deepEqual(f.vaccinations.map((row) => [(row.administeredAt as Date).toISOString().slice(0, 10), row.doseNumber]), [["2025-10-01", 1], ["2026-10-01", 1]]);
  assert.deepEqual(f.historyQueries.map((query) => query.values), [["employee", "ug", "2025-10-01", "2025-10-01"], ["employee", "ug", "2026-10-01", "2026-10-01"]]);
  assert.ok(f.locks.includes("SST_VACCINE_DOSE:worker:vaccine:1:2025-10-01"));
  assert.ok(f.locks.includes("SST_VACCINE_DOSE:worker:vaccine:1:2026-10-01"));
  await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, budgetUnitId: "foreign", submissionKey: "5d161f17-63ca-4d57-9c87-82c4f74e4d5a", administeredAt: "2026-10-02" }), /Unidade Gestora/);
  const missingHistory = fixture(); missingHistory.role.endsAt = new Date("2026-10-02");
  await registerOccupationalVaccination(missingHistory.context, shot);
  missingHistory.state.history = [];
  await assert.rejects(registerOccupationalVaccination(missingHistory.context, { ...shot, administeredAt: "2026-10-02", submissionKey: otherKey }), /período funcional RH/);
  assert.equal(missingHistory.vaccinations.length, 1);
});

test("date-specific P2002 conflicts become domain errors; unrelated unique constraints/errors are preserved", async () => {
  for (const target of ["SstVaccination_person_vaccine_dose_date_key", ["personId", "vaccineId", "doseNumber", "administeredAt"]]) {
    const f = fixture();
    f.state.vaccineCreateError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.9.1", meta: { target } });
    await assert.rejects(registerOccupationalVaccination(f.context, shot), (error: unknown) => error instanceof SstValidationError && /nesta data/.test(error.message));
    assert.equal(f.vaccinations.length, 0); assert.equal(f.audits.length, 0);
  }
  for (const error of [new Prisma.PrismaClientKnownRequestError("Other unique constraint", { code: "P2002", clientVersion: "7.9.1", meta: { target: ["budgetUnitId", "submissionKey"] } }), new Error("Database unavailable")]) {
    const f = fixture(); f.state.vaccineCreateError = error;
    await assert.rejects(registerOccupationalVaccination(f.context, shot), (actual: unknown) => actual === error);
  }
});

test("report authorization precedes private data, validates discipline/type and uses genuine timestamps and configured GLOBAL metadata", async () => {
  const f = fixture(); await registerClinicalRecord(f.context, visit);
  await assert.rejects(clinicalRecordDocument(f.context, { id: "visit", printing: true }), /emitir relatórios/);
  assert.equal(f.audits.length, 1);
  f.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: false, issueReports: true } } });
  const document = await clinicalRecordDocument(f.context, { id: "visit", printing: true, report: "opinion", issuedAt: "1900-01-01", issuedBy: "Fake" });
  assert.equal(document.title, "Laudo médico ocupacional");
  assert.equal(document.template!.header, "Cabeçalho configurado");
  assert.equal(document.template!.footer, "Rodapé configurado");
  assert.equal(document.template!.orientation, "PORTRAIT");
  assert.equal(document.institution!.legalName, "Instituição canônica");
  assert.equal(document.emission!.issuedBy, "Registrador");
  assert.ok(Math.abs(Date.now() - Date.parse(document.emission!.issuedAt)) < 5000);
  assert.equal(document.record.attendedAt.toISOString(), "2026-10-01T03:00:00.000Z");
  assert.equal(document.record.createdAt.toISOString(), "2026-10-01T04:00:00.000Z");
  assert.equal(f.audits.at(-1)!.eventType, "REPORT_ISSUED");
  assert.deepEqual(Object.keys(f.audits.at(-1)!).sort(), ["actorUsuarioId", "eventType", "targetId", "targetType"]);
  await assert.rejects(clinicalRecordDocument(f.context, { id: "visit", report: "invented" }));
  f.clinical[0].discipline = "PSYCHOLOGY";
  await assert.rejects(clinicalRecordDocument(f.context, { id: "visit", printing: true, report: "opinion" }), /Medicina/);
  f.state.disciplineGrant.canRead = false;
  await assert.rejects(clinicalRecordDocument(f.context, { id: "visit" }), /atuação profissional/);
});

test("clinical services use shared catalog only, never SUSPatient or assistential patient history", async () => {
  const f = fixture();
  for (const delegate of ["sUSPatient", "susPatient", "healthMedicalRecord", "healthVaccination", "healthPrescription"]) {
    Object.defineProperty(f.context.prisma, delegate, { get() { throw new Error(`Forbidden PHI lookup: ${delegate}`); } });
  }
  await registerClinicalRecord(f.context, { ...visit, requests: [{ kind: "MEDICATION", description: "Remédio", medicineId: "medicine", instructions: "Uma dose", quantity: 1, days: 1 }] });
  await registerOccupationalVaccination(f.context, shot);
  await clinicalRecordDocument(f.context, { id: "visit" });
  assert.equal(f.clinical.length, 1); assert.equal(f.vaccinations.length, 1);
});

test("private chart and vaccine lists are audited before reading, paginated by 20, and cannot replace a selected UG with an allowed-unit spread", async () => {
  const events: string[] = [], queries: { where: { budgetUnitId: { in: string[] }; discipline?: string }; take: number; skip: number; select: Record<string, boolean> }[] = [];
  const delegate = {
    count: async () => { events.push("count"); return 45; },
    findMany: async (query: typeof queries[number]) => { events.push("read"); queries.push(query); return []; },
  };
  const context = { user, prisma: {
    budgetUnit: { findMany: async ({ where }: { where: { sstDisciplineGrants: { some: { discipline: string } } } }) => { assert.equal(where.sstDisciplineGrants.some.discipline, "MEDICINE"); return [{ id: "ug", name: "UG" }, { id: "another-authorized", name: "Outra" }]; } },
    auditEvent: { create: async () => { events.push("audit"); } },
    sstClinicalRecord: delegate, sstVaccination: delegate,
  } } as unknown as AppContext;
  const result = await listClinicalRecords(context, { discipline: "MEDICINE", budgetUnitId: "ug", page: 2 });
  assert.deepEqual(events, ["audit", "count", "read"]);
  assert.equal(result.page, 2); assert.equal(queries[0].take, 20); assert.equal(queries[0].skip, 20);
  assert.deepEqual(queries[0].where.budgetUnitId, { in: ["ug"] });
  assert.deepEqual(queries[0].select, { id: true, attendedAt: true, snapshot: true });
  await listOccupationalVaccinations(context, { discipline: "MEDICINE", budgetUnitId: "foreign", page: 100 });
  assert.deepEqual(queries[1].where.budgetUnitId, { in: [] });
  assert.equal(queries[1].take, 20); assert.equal(queries[1].skip, 40);
  context.prisma.auditEvent.create = async () => { throw new Error("audit unavailable"); };
  const reads = queries.length;
  await assert.rejects(listClinicalRecords(context, { discipline: "MEDICINE", page: 1 }), /audit unavailable/);
  assert.equal(queries.length, reads);
  await assert.rejects(listClinicalRecords(context, { discipline: "MEDICINE", page: Infinity }));
});

async function migrationDb() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "Person" (id TEXT PRIMARY KEY); CREATE TABLE "Usuario" (id TEXT PRIMARY KEY); CREATE TABLE "Vaccine" (id TEXT PRIMARY KEY); CREATE TABLE "SstQuestionnaireVersion" (id TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL);
    INSERT INTO "BudgetUnit" VALUES ('ug'),('other'); INSERT INTO "Person" VALUES ('worker'),('doctor'); INSERT INTO "Usuario" VALUES ('actor'); INSERT INTO "Vaccine" VALUES ('vaccine');`);
  await db.exec(readFileSync(new URL("../prisma/migrations-ibema/20261011010000_add_sst_clinical_services/migration.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../prisma/migrations-ibema/20261011120000_harden_sst_clinical_integrity/migration.sql", import.meta.url), "utf8"));
  await db.exec(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES ('role','ug','doctor','actor','MEDICINE','CRM PR 123','2026-10-01','2026-10-01','actor');
    INSERT INTO "SstQuestionnaireVersion" VALUES ('q','ug','MEDICINE'),('otherq','other','MEDICINE'),('psychq','ug','PSYCHOLOGY');`);
  return db;
}
async function insertVisit(db: PGlite, id: string, at = "2026-10-01 03:00:00", q: string | null = null, discipline = "MEDICINE") {
  return db.query(`INSERT INTO "SstClinicalRecord" (id,"budgetUnitId","personId","professionalRoleId",discipline,"attendedAt","occupationalContext",narrative,opinion,diagnosis,requests,"questionnaireVersionId","questionnaireSnapshot",answers,snapshot,"submissionKey","requestHash","createdById") VALUES ($1,'ug','worker','role',$4,$2,'Contexto','Narrativa','Parecer','','[]',$3,'{}','{}','{"council":"CRM PR 123"}',$1,'hash','actor')`, [id, at, q, discipline]);
}
async function insertShot(db: PGlite, id: string, at = "2026-10-01", dose = 1, professionalRoleId = "role") {
  return db.query(`INSERT INTO "SstVaccination" (id,"budgetUnitId","personId","professionalRoleId","vaccineId","administeredAt","doseNumber","lotNumber",source,"occupationalContext",snapshot,"submissionKey","requestHash","createdById") VALUES ($1,'ug','worker',$4,'vaccine',$2,$3,'LOT','EXTERNAL_PROOF','Contexto','{}',$1,'hash','actor')`, [id, at, dose, professionalRoleId]);
}

test("deployed 0100 followed by additive 1200 enforces UTC civil validity independent of session timezone, DATE validity, scope and inactive roles", async () => {
  const db = await migrationDb();
  try {
    const definition = await db.query<{ definition: string }>(`SELECT pg_get_functiondef('sst_clinical_scope()'::regprocedure) AS definition`);
    assert.match(definition.rows[0].definition, /FOR SHARE/);
    for (const zone of ["UTC", "Pacific/Auckland"]) {
      await db.exec(`SET TIME ZONE '${zone}'`);
      await insertVisit(db, `valid-${zone}`, "2026-10-02 02:59:59", "q");
      await assert.rejects(insertVisit(db, "before", "2026-10-01 02:59:59"), /validity/);
      await assert.rejects(insertVisit(db, "after", "2026-10-02 03:00:00"), /validity/);
    }
    await insertShot(db, "shot");
    await assert.rejects(insertVisit(db, "infinite", "infinity"));
    await assert.rejects(insertShot(db, "infinite-shot", "infinity", 2));
    await assert.rejects(db.exec(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId",discipline,council,"startsAt","endsAt","createdById") VALUES ('infinite-role','ug','doctor','MEDICINE','CRM','2026-10-02','infinity','actor')`), /check constraint/);
    await assert.rejects(insertShot(db, "duplicate"), /SstVaccination_person_vaccine_dose_date_key/);
    await db.exec(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES ('prior-role','ug','doctor','actor','MEDICINE','CRM PR 123','2025-10-01','2025-10-01','actor')`);
    await insertShot(db, "annual-cycle", "2025-10-01", 1, "prior-role");
    await assert.rejects(insertShot(db, "annual-duplicate", "2025-10-01", 1, "prior-role"), /SstVaccination_person_vaccine_dose_date_key/);
    assert.equal((await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM "SstVaccination" WHERE "personId"='worker' AND "vaccineId"='vaccine' AND "doseNumber"=1`)).rows[0].total, 2);
    await assert.rejects(insertShot(db, "old", "2026-09-30", 2), /validity/);
    await assert.rejects(insertVisit(db, "wrong-q", undefined, "otherq"), /questionnaire scope/);
    await assert.rejects(insertVisit(db, "psych-q", undefined, "psychq"), /questionnaire scope/);
    await assert.rejects(insertVisit(db, "wrong-discipline", undefined, null, "PSYCHOLOGY"), /discipline mismatch/);
    await assert.rejects(db.exec(`INSERT INTO "SstDisciplineGrant" (id,"budgetUnitId","usuarioId",discipline,"canRead","canWrite") VALUES ('bad-grant','ug','actor','MEDICINE',false,true)`), /check constraint/);
    await db.exec(`UPDATE "SstProfessionalRole" SET "isActive"=false WHERE id='role'`);
    await assert.rejects(insertVisit(db, "inactive"), /must be active/);
    await assert.rejects(insertShot(db, "inactive-shot", undefined, 2), /must be active/);
  } finally { await db.close(); }
});

test("0100 history is immutable, council cannot change, and failed mutation rolls back the entire transaction", async () => {
  const db = await migrationDb();
  try {
    await insertVisit(db, "visit"); await insertShot(db, "shot");
    for (const table of ["SstClinicalRecord", "SstVaccination"]) {
      await assert.rejects(db.exec(`UPDATE "${table}" SET "requestHash"='changed'`), /immutable/);
      await assert.rejects(db.exec(`DELETE FROM "${table}"`), /immutable/);
    }
    await assert.rejects(db.exec(`UPDATE "SstProfessionalRole" SET council='CRM OTHER'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstProfessionalRole"`), /immutable/);
    await db.exec("BEGIN");
    await insertVisit(db, "rolled-back");
    await assert.rejects(db.exec(`UPDATE "SstClinicalRecord" SET diagnosis='changed' WHERE id='visit'`), /immutable/);
    await db.exec("ROLLBACK");
    assert.deepEqual((await db.query<{ id: string }>(`SELECT id FROM "SstClinicalRecord" ORDER BY id`)).rows, [{ id: "visit" }]);
    assert.equal((await db.query<{ council: string }>(`SELECT council FROM "SstProfessionalRole"`)).rows[0].council, "CRM PR 123");
  } finally { await db.close(); }
});

test("real historical query parameters enforce instant end-exclusive coverage and full Sao Paulo vaccination civil day", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT, "employeeId" TEXT, "budgetUnitId" TEXT, "startsAt" TIMESTAMP, "endsAt" TIMESTAMP, voided BOOLEAN DEFAULT false, "supersedesId" TEXT);
      INSERT INTO "HrEmployeeFunctionalPeriod" VALUES ('period','employee','ug','2026-10-01 03:00','2026-10-02 03:00',false,null);`);
    const f = fixture(); await registerClinicalRecord(f.context, visit); await registerOccupationalVaccination(f.context, shot);
    for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
      await db.exec(`SET TIME ZONE '${zone}'`);
      for (const query of f.historyQueries) assert.equal((await db.query(query.sql, query.values)).rows.length, 1);
    }
    const instant = f.historyQueries[0];
    assert.equal((await db.query(instant.sql, ["employee", "ug", "2026-10-02T03:00:00Z", "2026-10-02T03:00:00Z"])).rows.length, 0);
    assert.equal((await db.query(instant.sql, ["employee", "other", ...instant.values.slice(2)])).rows.length, 0);
    await db.exec(`UPDATE "HrEmployeeFunctionalPeriod" SET "startsAt"='2026-10-01 04:00'`);
    assert.equal((await db.query(f.historyQueries[1].sql, f.historyQueries[1].values)).rows.length, 0);
    await db.exec(`UPDATE "HrEmployeeFunctionalPeriod" SET "startsAt"='2026-10-01 03:00'; INSERT INTO "HrEmployeeFunctionalPeriod" VALUES ('correction','employee','ug','2026-10-01 03:00','2026-10-02 03:00',true,'period')`);
    assert.equal((await db.query(instant.sql, instant.values)).rows.length, 0);
  } finally { await db.close(); }
});
