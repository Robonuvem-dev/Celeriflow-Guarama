import "./helpers/laboratory-test-environment";
import assert from "node:assert/strict";
import test from "node:test";
import { getHealthRaasSources } from "../src/lib/saude/raas-source-service";
import { createLaboratoryDrizzleFixture, laboratoryTestContext } from "./helpers/laboratory-drizzle-fixture";

test("RAAS · original home/CAPS origins, full DTO, period and confidential unit scope", async suite => {
  const f = await createLaboratoryDrizzleFixture(), { db, context, restricted } = f;
  try {
    await f.database.exec(`
      INSERT INTO "MedicalRecord" (id,date,"patientId","professionalId","unitId","completedAt","updatedAt") VALUES
        ('dx-caps-start','2026-10-01 03:00:00','dx-patient','dx-professional','dx-u2','2026-10-01 04:00:00',CURRENT_TIMESTAMP),
        ('dx-caps-before','2026-10-01 02:59:59.999','dx-patient','dx-professional','dx-u2','2026-10-01 04:00:00',CURRENT_TIMESTAMP),
        ('dx-caps-last','2026-11-01 02:59:59.999','dx-patient2','dx-other-professional','dx-u2','2026-11-01 04:00:00',CURRENT_TIMESTAMP),
        ('dx-caps-after','2026-11-01 03:00:00','dx-patient','dx-professional','dx-u2','2026-11-01 04:00:00',CURRENT_TIMESTAMP),
        ('dx-caps-open','2026-10-12','dx-patient','dx-professional','dx-u2',NULL,CURRENT_TIMESTAMP),
        ('dx-home-inconsistent','2026-10-12','dx-patient','dx-professional','dx-u1','2026-10-12 04:00:00',CURRENT_TIMESTAMP);
      INSERT INTO "HealthHomeCareRequest" (id,"patientId","unitId","requestedAt",reason,"createdByUsuarioId") VALUES
        ('dx-home-request','dx-patient','dx-u1','2026-09-30 22:00:00','Indicação domiciliar documentada','dx-user'),
        ('dx-home-inconsistent-request','dx-patient2','dx-u2','2026-10-01','Outra origem','dx-user');
      INSERT INTO "HealthHomeCareAssessment" (id,"requestId","assessedAt","professionalId",eligible,modality,character,evaluation,"actorUsuarioId") VALUES
        ('dx-home-assessment','dx-home-request','2026-10-03 01:02:03.004','dx-professional',true,'AD1','CONTINUADO','Elegibilidade confirmada','dx-user'),
        ('dx-home-inconsistent-assessment','dx-home-inconsistent-request','2026-10-04','dx-other-professional',false,'AD2','TEMPORARIO','Não elegível','dx-user');
      INSERT INTO "HealthHomeCareAttendance" (id,"requestId","assessmentId","medicalRecordId","performedAt","actorUsuarioId") VALUES
        ('dx-home-attendance','dx-home-request','dx-home-assessment','dx-record','2026-10-14 03:00:00','dx-user'),
        ('dx-home-missing','dx-home-request','dx-home-assessment','dx-wrong-record','2026-10-14 04:00:00','dx-user'),
        ('dx-home-mismatch','dx-home-inconsistent-request','dx-home-inconsistent-assessment','dx-home-inconsistent','2026-10-14 05:00:00','dx-user');
      INSERT INTO "HealthDiagnosis" (id,"medicalRecordId","cidReferenceId","isPrimary") VALUES ('dx-raas-diagnosis','dx-record','dx-cid',true);
      INSERT INTO "HealthPerformedProcedure" (id,"medicalRecordId","procedureId","professionalId",quantity,"performedAt") VALUES ('dx-raas-procedure','dx-record','dx-procedure','dx-professional',3,'2026-10-10 12:45:56.789');
    `);
    await suite.test("home origin keeps clinical dates, patient, provider, CID, full SUS procedure and eligibility evidence", async () => {
      const result = await getHealthRaasSources(restricted, { period: "2026-10", modality: "DOMICILIAR" }, db);
      assert.equal(result.contract, "CELERIFLOW_RAAS_ORIGINS"); assert.equal(result.version, "1.0.0"); assert.equal(result.period, "2026-10");
      assert.equal(result.origins.length, 1);
      assert.deepEqual(result.origins[0], {
        originType: "HOME_CARE_ATTENDANCE", originId: "dx-home-attendance", medicalRecordId: "dx-record", modality: "DOMICILIAR",
        occurredAt: "2026-10-10T12:34:56.789Z", completedAt: "2026-10-10T13:34:56.789Z", outcome: "Retorno",
        patient: { id: "dx-patient", name: "Paciente titular", cns: "123456789012345", birthDate: "1990-02-03T00:00:00.000Z", gender: "Feminino" },
        unit: { id: "dx-u1", name: "Unidade de diagnóstico", cnes: "1000001", type: "UBS" },
        professional: { id: "dx-professional", name: "Profissional titular", cns: "987654321012345", cbo: "225125" },
        diagnoses: [{ code: "Z00", description: "Exame geral", principal: true }],
        procedures: [{ id: "dx-raas-procedure", procedureId: "dx-procedure", code: "DX.1", description: "Procedimento realizado", quantity: 3, performedAt: "2026-10-10T12:45:56.789Z", professionalId: "dx-professional" }],
        homeCare: { requestId: "dx-home-request", assessmentId: "dx-home-assessment", assessmentDate: "2026-10-03T01:02:03.004Z", modality: "AD1", character: "CONTINUADO", requestedAt: "2026-09-30T22:00:00.000Z", indication: "Indicação domiciliar documentada" }, criticisms: [],
      });
      assert.deepEqual(result.missingOrigins, [{ originType: "HOME_CARE_ATTENDANCE", originId: "dx-home-missing", medicalRecordId: "dx-wrong-record", criticism: "PRONTUARIO_CONCLUIDO_NAO_LOCALIZADO_NO_ESCOPO" }]);
    });

    await suite.test("CAPS type is case insensitive and competence uses Brazil half-open month bounds", async () => {
      const result = await getHealthRaasSources(context, { period: "2026-10", modality: "PSICOSSOCIAL" }, db);
      assert.deepEqual(result.origins.map(item => item.medicalRecordId), ["dx-caps-start", "dx-caps-last"]);
      assert.ok(result.origins.every(item => item.originType === "CAPS_MEDICAL_RECORD" && item.homeCare === null));
      const incomplete = result.origins.find(item => item.medicalRecordId === "dx-caps-last");
      assert.deepEqual(incomplete?.criticisms, ["SEM_CNS_PACIENTE", "SEM_NASCIMENTO", "SEM_CNES_UNIDADE", "SEM_CNS_PROFISSIONAL", "SEM_CBO_PROFISSIONAL", "SEM_DIAGNOSTICO_CID", "SEM_PROCEDIMENTO_REALIZADO"]);
      assert.deepEqual(result.missingOrigins, []);
    });

    await suite.test("inconsistent home origin is retained with criticism and every record stays in authorized units", async () => {
      const result = await getHealthRaasSources(context, { period: "2026-10" }, db);
      assert.ok(result.origins.find(item => item.originId === "dx-home-mismatch")?.criticisms.includes("ORIGEM_DOMICILIAR_INCONSISTENTE"));
      const filtered = await getHealthRaasSources(restricted, { period: "2026-10" }, db);
      assert.ok(filtered.origins.every(item => item.unit.id === "dx-u1"));
      assert.ok(!filtered.origins.some(item => item.originId === "dx-home-mismatch"));
      await assert.rejects(getHealthRaasSources(restricted, { period: "2026-10", unitId: "dx-u2" }, db), /acesso/i);
      const noUnits = await getHealthRaasSources(laboratoryTestContext({ hasHealthAccessScope: true, allowedHealthUnitIds: [] }), { period: "2026-10" }, db);
      assert.deepEqual(noUnits.origins, []); assert.deepEqual(noUnits.missingOrigins, []);
      assert.deepEqual((await getHealthRaasSources(context, { period: "2025-01", modality: "DOMICILIAR" }, db)).origins, [], "an empty origin OR must be false, never an absent filter");
      await assert.rejects(getHealthRaasSources(context, { period: "2026-13" }, db));
    });
  } finally { await f.close(); }
});
