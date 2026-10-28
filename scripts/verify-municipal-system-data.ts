import assert from "node:assert/strict";
import { config } from "dotenv";
import { like, sql, type SQL } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { Decimal } from "../src/db/decimal";
import { people } from "../src/db/schema/people";
import { companies } from "../src/db/schema/registry";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { key } from "./municipal-system-dataset";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  assert.ok(url, "DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url), { db } = connection;
  const check = async (query: SQL, label: string) => {
    const result = await db.execute<{ invalid: number }>(query);
    assert.equal(result.rows[0].invalid, 0, label);
  };
  try {
    const persons = await db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf, birthDate: people.birthDate }).from(people).where(like(people.id, "aurora-system-v1:person:%"));
    assert.equal(persons.length, 60); assert.equal(new Set(persons.map(row => row.fullName)).size, 60); assert.equal(new Set(persons.map(row => row.cpf)).size, 60);
    await check(sql`SELECT count(*)::int AS invalid FROM "Employee" e LEFT JOIN "Person" p ON p.id=e."personId" LEFT JOIN "Department" d ON d.id=e."departmentId"
      WHERE e.id LIKE 'aurora-system-v1:employee:%' AND (p.id IS NULL OR d.id IS NULL OR e.name IS DISTINCT FROM p."fullName" OR e.cpf IS DISTINCT FROM p.cpf OR e."secretariatId" IS DISTINCT FROM d."secretariatId")`, "Identidade e lotação dos servidores");
    await check(sql`SELECT count(*)::int AS invalid FROM "Enrollment" e LEFT JOIN "SchoolClass" c ON c.id=e."classId" LEFT JOIN "Student" s ON s.id=e."studentId" LEFT JOIN "Person" p ON p.id=s."personId"
      LEFT JOIN LATERAL (SELECT gp."birthDate" FROM "EducationalGuardian" g JOIN "Person" gp ON gp.id=g."personId" WHERE g."studentId"=s.id LIMIT 1) guardian ON true
      WHERE e.id LIKE 'aurora-system-v1:enrollment:%' AND (c.id IS NULL OR e."schoolId" IS DISTINCT FROM c."schoolId" OR p."birthDate" IS NULL OR guardian."birthDate" IS NULL OR p."birthDate"<=guardian."birthDate")`, "Matrículas, escolas e responsáveis");
    await check(sql`SELECT count(*)::int AS invalid FROM "HealthAppointment" a LEFT JOIN "HealthProfessional" h ON h.id=a."professionalId" LEFT JOIN "Patient" p ON p.id=a."patientId"
      WHERE a.id LIKE 'aurora-system-v1:health-appointment:%' AND (h.id IS NULL OR p.id IS NULL OR a."unitId" IS DISTINCT FROM h."unitId" OR a."unitId" IS DISTINCT FROM p."referenceUnitId")`, "Agendamentos e unidades de referência");
    await check(sql`SELECT count(*)::int AS invalid FROM "SanMeterReading" r LEFT JOIN "SanWaterMeter" m ON m.id=r."meterId"
      WHERE r.id LIKE 'aurora-system-v1:water-reading:%' AND (m.id IS NULL OR r."currentValue"-r."previousValue" IS DISTINCT FROM r.consumption OR r."unitId" IS DISTINCT FROM m."unitId")`, "Consumo e vínculo de hidrômetros");
    await check(sql`SELECT count(*)::int AS invalid FROM "ObrasServicoEquipamento" e LEFT JOIN "Asset" a ON a.id=e."assetId" LEFT JOIN "ObrasServico" s ON s.id=e."obrasServicoId"
      WHERE e.id LIKE 'aurora-system-v1:works-equipment:%' AND (a.id IS NULL OR s.id IS NULL OR a."departmentId" IS DISTINCT FROM s."departmentId")`, "Escopo patrimonial das ordens de serviço");
    const cases = await db.select({ payload: financialAuditLogs.payload }).from(financialAuditLogs).where(sql`${financialAuditLogs.action}='MUNICIPAL_TAX_CASE_POPULATED' AND ${financialAuditLogs.entityId} LIKE 'aurora-system-v1:%'`);
    assert.equal(cases.length, 20);
    let principal = new Decimal(0), entries = 0;
    for (const row of cases) {
      const payload = row.payload as { assessmentId: string; guideId: string };
      const [assessment] = (await db.execute<{ id: string; taxpayerId: string; realEstateId: string | null; realEstateTaxpayerId: string | null; finalValue: string | null; originalValue: string | null }>(sql`SELECT a.id,a."taxpayerId",r.id AS "realEstateId",r."taxpayerId" AS "realEstateTaxpayerId",a."finalValueDecimal"::text AS "finalValue",a."originalValueDecimal"::text AS "originalValue"
        FROM "TaxAssessment" a LEFT JOIN "RealEstate" r ON r.id=a."realEstateId" WHERE a.id=${payload.assessmentId}`)).rows;
      const [guide] = (await db.execute<{ assessmentId: string; totalValue: string | null }>(sql`SELECT "assessmentId","totalValueDecimal"::text AS "totalValue" FROM "TaxGuide" WHERE id=${payload.guideId}`)).rows;
      assert.ok(assessment); assert.ok(guide); assert.ok(guide.totalValue !== null && assessment.finalValue !== null && assessment.originalValue !== null);
      assert.equal(guide.assessmentId, assessment.id); assert.ok(new Decimal(guide.totalValue).equals(assessment.finalValue));
      assert.ok(assessment.realEstateId); assert.equal(assessment.realEstateTaxpayerId, assessment.taxpayerId);
      const transactions = (await db.execute<{ id: string }>(sql`SELECT id FROM "AccountingTransaction" WHERE "sourceId"=${assessment.id}`)).rows;
      assert.equal(transactions.length, 1, "Constituição tributária reconhecida uma vez");
      const postings = (await db.execute<{ type: string; value: string | null }>(sql`SELECT type,"valueDecimal"::text AS value FROM "AccountingEntry" WHERE "transactionId"=${transactions[0].id}`)).rows;
      const sum = (type: string) => postings.filter(entry => entry.type === type).reduce((total, entry) => { assert.ok(entry.value !== null); return total.plus(entry.value); }, new Decimal(0));
      const debit = sum("Débito"), credit = sum("Crédito");
      assert.ok(debit.equals(credit)); assert.ok(debit.equals(assessment.finalValue)); entries += postings.length; principal = principal.plus(assessment.originalValue);
    }
    assert.equal(principal.toFixed(2), "11325.00");
    await check(sql`SELECT count(*)::int AS invalid FROM "TaxPayment" p JOIN "TaxGuide" g ON g.id=p."guideId" JOIN "TaxAssessment" a ON a.id=g."assessmentId" WHERE a."taxpayerId" LIKE 'aurora-system-v1:%'`, "Nenhum pagamento externo na carga");
    const [companyCount] = await db.select({ value: sql<number>`count(*)::int` }).from(companies).where(like(companies.id, "aurora-system-v1:company:%"));
    assert.equal(companyCount.value, 20);
    assert.ok((await db.execute<{ id: string }>(sql`SELECT id FROM "Student" WHERE id=${key("student")}`)).rows[0]);
    console.log(JSON.stringify({ mode: "READ_ONLY", people: persons.length, companies: 20, identityAndScopeLinks: "PASS", educationAndHealthLinks: "PASS", readingsAndAssetScope: "PASS", taxCases: cases.length, principal: principal.toFixed(2), balancedAccountingEntries: entries, externalPayments: 0 }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
