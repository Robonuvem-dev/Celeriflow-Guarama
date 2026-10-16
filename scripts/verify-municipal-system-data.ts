import assert from "node:assert/strict";
import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { key } from "./municipal-system-dataset";

config({ path: ".env.local", quiet: true }); config({ quiet: true }); neonConfig.webSocketConstructor = ws;
async function main() {
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }) });
  try {
    const people = await db.person.findMany({ where: { id: { startsWith: "aurora-system-v1:person:" } }, select: { id: true, fullName: true, cpf: true, birthDate: true } });
    assert.equal(people.length, 60); assert.equal(new Set(people.map(row => row.fullName)).size, 60); assert.equal(new Set(people.map(row => row.cpf)).size, 60);
    for (const employee of await db.employee.findMany({ where: { id: { startsWith: "aurora-system-v1:employee:" } }, include: { person: true, department: true } })) {
      assert.equal(employee.name, employee.person!.fullName); assert.equal(employee.cpf, employee.person!.cpf); assert.equal(employee.secretariatId, employee.department!.secretariatId);
    }
    for (const enrollment of await db.enrollment.findMany({ where: { id: { startsWith: "aurora-system-v1:enrollment:" } }, include: { schoolClass: true, student: { include: { person: true, guardians: { include: { person: true } } } } } })) {
      assert.equal(enrollment.schoolId, enrollment.schoolClass!.schoolId);
      assert.ok(enrollment.student.person.birthDate! > enrollment.student.guardians[0].person.birthDate!);
    }
    for (const appointment of await db.healthAppointment.findMany({ where: { id: { startsWith: "aurora-system-v1:health-appointment:" } }, include: { professional: true, patient: true } })) {
      assert.equal(appointment.unitId, appointment.professional!.unitId); assert.equal(appointment.unitId, appointment.patient.referenceUnitId);
    }
    for (const reading of await db.sanMeterReading.findMany({ where: { id: { startsWith: "aurora-system-v1:water-reading:" } }, include: { meter: true } })) {
      assert.equal(reading.currentValue - reading.previousValue, reading.consumption); assert.equal(reading.unitId, reading.meter!.unitId);
    }
    for (const assignment of await db.obrasServicoEquipamento.findMany({ where: { id: { startsWith: "aurora-system-v1:works-equipment:" } }, include: { asset: true, obrasServico: true } })) assert.equal(assignment.asset.departmentId, assignment.obrasServico.departmentId);
    const cases = await db.financialAuditLog.findMany({ where: { action: "MUNICIPAL_TAX_CASE_POPULATED", entityId: { startsWith: "aurora-system-v1:" } }, select: { payload: true } });
    assert.equal(cases.length, 20);
    let principal = new Prisma.Decimal(0), entries = 0;
    for (const row of cases) {
      const payload = row.payload as { assessmentId: string; guideId: string };
      const assessment = await db.taxAssessment.findUniqueOrThrow({ where: { id: payload.assessmentId }, include: { taxpayer: true, realEstate: true } });
      const guide = await db.taxGuide.findUniqueOrThrow({ where: { id: payload.guideId } });
      assert.equal(guide.assessmentId, assessment.id); assert.ok(guide.totalValueDecimal!.equals(assessment.finalValueDecimal!));
      assert.ok(assessment.realEstate); assert.equal(assessment.realEstate!.taxpayerId, assessment.taxpayerId);
      const transactions = await db.accountingTransaction.findMany({ where: { sourceId: assessment.id }, include: { entries: true } });
      assert.equal(transactions.length, 1, "Constituição tributária reconhecida uma vez");
      const debit = transactions[0].entries.filter(entry => entry.type === "Débito").reduce((sum, entry) => sum.plus(entry.valueDecimal!), new Prisma.Decimal(0));
      const credit = transactions[0].entries.filter(entry => entry.type === "Crédito").reduce((sum, entry) => sum.plus(entry.valueDecimal!), new Prisma.Decimal(0));
      assert.ok(debit.equals(credit)); assert.ok(debit.equals(assessment.finalValueDecimal!)); entries += transactions[0].entries.length; principal = principal.plus(assessment.originalValueDecimal!);
    }
    assert.equal(principal.toFixed(2), "11325.00");
    assert.equal(await db.taxPayment.count({ where: { guide: { assessment: { taxpayerId: { startsWith: "aurora-system-v1:" } } } } }), 0);
    assert.equal(await db.company.count({ where: { id: { startsWith: "aurora-system-v1:company:" } } }), 20);
    assert.ok(await db.student.findUnique({ where: { id: key("student") } }));
    console.log(JSON.stringify({ mode: "READ_ONLY", people: people.length, companies: 20, identityAndScopeLinks: "PASS", educationAndHealthLinks: "PASS", readingsAndAssetScope: "PASS", taxCases: cases.length, principal: principal.toFixed(2), balancedAccountingEntries: entries, externalPayments: 0 }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
