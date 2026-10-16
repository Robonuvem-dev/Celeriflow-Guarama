import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { advanceCemeteryProcess, createCemeteryProcess, declarantDebtSnapshot, registerDeceased, registerMovement } from "../src/lib/tributacao/s9-service";

function fixtureTables() {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const names = ["Person", "Taxpayer", "TaxCemetery", "TaxGrave", "TaxDeceased", "TaxBurialMovement", "CemeteryProcess", "CemeteryChangeHistory", "CemeteryLot", "CemeteryOssuary", "CemeteryChapel", "TaxFuneralHome", "TaxDeathCause", "TaxAssessment", "TaxGuide", "TaxPayment", "ActiveDebt", "CemeteryFeeEvent", "CemeteryFeeRuleVersion"];
  return names.map(name => {
    const model = Prisma.dmmf.datamodel.models.find(model => model.name === name)!;
    const block = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))![1];
    const fields = model.fields.filter(field => field.kind !== "object").map(field => {
      const declaration = block.split("\n").find(line => new RegExp(`^\\s*${field.name}\\s`).test(line))!;
      const scalar = declaration.trim().split(/\s+/)[1];
      const type = scalar.endsWith("[]") ? "TEXT[]" : ({ Int: "INTEGER", Float: "DOUBLE PRECISION", Decimal: "NUMERIC", Boolean: "BOOLEAN", DateTime: "TIMESTAMP(3)", Json: "JSONB", BigInt: "BIGINT", Bytes: "BYTEA" } as Record<string, string>)[field.type] || "TEXT";
      let value = scalar.endsWith("?") ? "NULL" : scalar.endsWith("[]") ? "'{}'" : ["Int", "Float", "Decimal", "BigInt"].includes(field.type) ? "0" : field.type === "Boolean" ? "false" : field.type === "DateTime" ? "CURRENT_TIMESTAMP" : field.type === "Json" ? "'{}'" : "''";
      const defaultValue = declaration.match(/@default\((true|false|\d+|"[^"\n]*")\)/)?.[1];
      if (defaultValue) value = defaultValue.startsWith('"') ? `'${JSON.parse(defaultValue).replaceAll("'", "''")}'` : defaultValue;
      return `"${field.name}" ${type} DEFAULT ${value}${declaration.includes("@id") ? " PRIMARY KEY" : declaration.includes("@unique") ? " UNIQUE" : ""}`;
    });
    return `CREATE TABLE "${name}" (${fields.join(",")});`;
  }).join("\n");
}

test("cemetery workflow: transactional finalization, current location, destination validation, replay and debt totals", async t => {
  const memory = new PGlite(); const server = new PGLiteSocketServer({ db: memory, port: 0, host: "127.0.0.1" });
  let db: PrismaClient | undefined;
  try {
    await memory.exec(fixtureTables());
    await memory.exec(`
      INSERT INTO "TaxCemetery" (id,code,name) VALUES ('cem','C','Municipal'),('other','O','Outro');
      INSERT INTO "Person" (id,"fullName",cpf,status) VALUES ('p1','Pessoa 1','111','Ativo'),('p2','Pessoa 2','222','Ativo'),('p3','Pessoa 3','333','Ativo'),('p4','Pessoa 4','444','Ativo'),('p5','Pessoa 5','555','Ativo');
      INSERT INTO "Taxpayer" (id,"personId",status) VALUES ('t1','p1','Ativo'),('t2','p2','Ativo'),('t3','p3','Ativo'),('t4','p4','Ativo'),('t5','p5','Ativo'),('decl',NULL,'Ativo');
      INSERT INTO "CemeteryLot" (id,"cemeteryId",identifier,active,"graveLimit") VALUES ('l1','cem','L1',true,10),('l2','cem','L2',true,10),('l3','cem','L3',true,10);
      INSERT INTO "TaxGrave" (id,"cemeteryId","lotId",code,active,capacity,status) VALUES ('g1','cem','l1','G1',true,5,'LIVRE'),('g2','cem','l2','G2',true,5,'LIVRE'),('g3','cem','l3','G3',true,5,'LIVRE'),('g4','other',NULL,'G4',true,5,'LIVRE');
      INSERT INTO "TaxFuneralHome" (id,name,active) VALUES ('home','Funerária',true);
      INSERT INTO "TaxDeathCause" (id,code,description) VALUES ('cause','NAT','Natural');
      INSERT INTO "CemeteryChapel" (id,"cemeteryId",name,active) VALUES ('chapel','cem','Capela',true),('wrong','other','Capela outro',true);
      INSERT INTO "CemeteryOssuary" (id,"cemeteryId",code,active,capacity) VALUES ('oss','cem','OSS',true,1);
    `);
    await server.start();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const prisma = db;
    const actor = { usuarioId: "actor" };
    const base = { fullName: "Pessoa", deathDate: new Date("2026-10-01"), cemeteryId: "cem", graveId: "g1", funeralHomeId: "home", causeId: "cause", chapelId: "chapel", doctorName: "Médico", doctorCrm: "CRM1", declarantTaxpayerId: "decl", deceasedTaxpayerId: "t1", finalizeNow: false, scheduledAt: new Date("2026-10-02T12:00:00Z") };
    await t.test("identified PF and mandatory references; exception does not create fake person", async () => {
      await assert.rejects(registerDeceased(prisma, actor, { ...base, deceasedTaxpayerId: undefined }), /pessoa física/);
      await assert.rejects(registerDeceased(prisma, actor, { ...base, funeralHomeId: undefined }), /obrigatórias/);
      await assert.rejects(registerDeceased(prisma, actor, { ...base, chapelId: "wrong" }), /Capela/);
      await assert.rejects(registerDeceased(prisma, actor, { ...base, unidentified: true, burialType: "NAO_RECLAMADO", exceptionReason: "Não identificado" }), /fictício/);
      const unknown = await registerDeceased(prisma, actor, { ...base, fullName: "Registro administrativo 001", unidentified: true, burialType: "NAO_RECLAMADO", deceasedTaxpayerId: undefined, funeralHomeId: undefined, causeId: undefined, chapelId: undefined, exceptionReason: "Corpo não identificado, autorização registrada", finalizeNow: true });
      assert.equal(unknown.deceasedTaxpayerId, null); assert.equal(await prisma.person.count(), 5);
    });
    const normal = await registerDeceased(prisma, actor, { ...base, requestKey: "burial-1" });
    await t.test("wake and cremation open independently of burial; later burial reuses the same registry", async () => {
      const input = { processType: "VELORIO" as const, deceasedId: "", deceasedTaxpayerId: "t4", deathDate: base.deathDate, causeId: "cause", cemeteryId: "cem", funeralHomeId: "home", chapelId: "chapel", doctorName: "Médico", doctorCrm: "CRM1", declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt, requestKey: "independent-wake" };
      const wake = await createCemeteryProcess(prisma, actor, input);
      assert.equal((await createCemeteryProcess(prisma, actor, input)).id, wake.id);
      const record = await prisma.taxDeceased.findUniqueOrThrow({ where: { id: wake.deceasedId } });
      assert.equal(record.graveId, null); assert.equal(record.status, "REGISTRADO");
      const later = await registerDeceased(prisma, actor, { ...base, deceasedTaxpayerId: "t4", requestKey: "after-wake" });
      assert.equal(later.id, wake.deceasedId);
      const cremation = await createCemeteryProcess(prisma, actor, { ...input, processType: "CREMACAO", deceasedTaxpayerId: "t5", chapelId: undefined, requestKey: "independent-cremation" });
      const occupied = (await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g1" } })).occupantCount;
      await advanceCemeteryProcess(prisma, actor, { processId: cremation.id, status: "CREMADO" });
      assert.equal((await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g1" } })).occupantCount, occupied);
    });
    await t.test("schedule replay, finalization, PF estate and capacity", async () => {
      assert.equal((await registerDeceased(prisma, actor, { ...base, requestKey: "burial-1" })).id, normal.id);
      await assert.rejects(registerDeceased(prisma, actor, base), /Já existe registro/);
      await assert.rejects(registerDeceased(prisma, actor, { ...base, fullName: "Outro nome", requestKey: "burial-1" }), /outros dados/);
      assert.equal((await prisma.person.findUniqueOrThrow({ where: { id: "p1" } })).deathDate, null);
      const process = await prisma.cemeteryProcess.findFirstOrThrow({ where: { deceasedId: normal.id } });
      await advanceCemeteryProcess(prisma, actor, { processId: process.id, status: "SEPULTADO", requestKey: "finish-1" });
      await advanceCemeteryProcess(prisma, actor, { processId: process.id, status: "SEPULTADO", requestKey: "finish-1" });
      const person = await prisma.person.findUniqueOrThrow({ where: { id: "p1" } });
      assert.match(person.fullName, /ESPÓLIO/); assert.equal(person.estateApplied, true); assert.equal(person.deathDate?.toISOString(), base.deathDate.toISOString());
      assert.equal((await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g1" } })).occupantCount, 2);
    });
    await t.test("member owner remains living and wake ends without burial", async () => {
      const member = await registerDeceased(prisma, actor, { ...base, deceasedTaxpayerId: "t2", burialType: "MEMBRO", finalizeNow: true });
      const owner = await prisma.person.findUniqueOrThrow({ where: { id: "p2" } }); assert.equal(owner.deathDate, null); assert.equal(owner.estateApplied, false);
      await assert.rejects(createCemeteryProcess(prisma, actor, { processType: "VELORIO", deceasedId: member.id, chapelId: "chapel", declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt }), /não de membro/);
      const wake = await createCemeteryProcess(prisma, actor, { processType: "VELORIO", deceasedId: normal.id, chapelId: "chapel", declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt });
      await assert.rejects(advanceCemeteryProcess(prisma, actor, { processId: wake.id, status: "SEPULTADO" }), /sepultamento/);
      const count = (await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g1" } })).occupantCount;
      assert.equal((await advanceCemeteryProcess(prisma, actor, { processId: wake.id, status: "ENCERRADO" })).status, "ENCERRADO");
      assert.equal((await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g1" } })).occupantCount, count);
    });
    await t.test("internal transfer can be transferred again; replay does not move twice", async () => {
      const input = { deceasedId: normal.id, graveId: "g1", toGraveId: "g2", movementType: "OUTRO_LOTE" as const, requestKey: "move-1" };
      const first = await registerMovement(prisma, actor, input);
      assert.equal((await registerMovement(prisma, actor, input)).id, first.id);
      await registerMovement(prisma, actor, { deceasedId: normal.id, graveId: "g2", toGraveId: "g3", movementType: "OUTRO_LOTE" });
      const current = await prisma.taxDeceased.findUniqueOrThrow({ where: { id: normal.id } }); assert.equal(current.status, "SEPULTADO"); assert.equal(current.graveId, "g3");
      assert.equal((await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g2" } })).occupantCount, 0);
      await assert.rejects(registerMovement(prisma, actor, { deceasedId: normal.id, graveId: "g3", toGraveId: "g3", movementType: "OUTRO_LOTE" }), /lote distinto/);
      await assert.rejects(registerMovement(prisma, actor, { deceasedId: normal.id, graveId: "g3", toGraveId: "g4", movementType: "CREMACAO" }), /sem sepultura/);
      await registerMovement(prisma, actor, { deceasedId: normal.id, graveId: "g3", toGraveId: "g4", movementType: "MUDANCA_CEMITERIO" });
      await registerMovement(prisma, actor, { deceasedId: normal.id, graveId: "g4", movementType: "EXUMACAO", destinationDescription: "Restos entregues ao responsável" });
      await assert.rejects(registerMovement(prisma, actor, { deceasedId: normal.id, graveId: "g4", movementType: "OUTRO", destinationDescription: "Destino" }), /atualmente sepultado/);
    });
    await t.test("cremation of pending burial never frees another occupant", async () => {
      const pending = await registerDeceased(prisma, actor, { ...base, deceasedTaxpayerId: "t3" });
      await assert.rejects(registerMovement(prisma, actor, { deceasedId: pending.id, graveId: "g1", movementType: "CREMACAO", destinationDescription: "Crematório" }), /atualmente sepultado/);
      const count = (await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g1" } })).occupantCount;
      const cremation = await createCemeteryProcess(prisma, actor, { processType: "CREMACAO", deceasedId: pending.id, declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt });
      await advanceCemeteryProcess(prisma, actor, { processId: cremation.id, status: "CREMADO" });
      assert.equal((await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g1" } })).occupantCount, count);
      assert.equal((await prisma.cemeteryProcess.findFirstOrThrow({ where: { deceasedId: pending.id, processType: "SEPULTAMENTO" } })).status, "CANCELADO");
    });
    await t.test("all external destination pairs and ossuary capacity are enforced", async () => {
      const unknown = { ...base, graveId: "g2", deceasedTaxpayerId: undefined, unidentified: true, burialType: "NAO_RECLAMADO" as const, exceptionReason: "Autorização para registro não identificado", finalizeNow: true };
      for (const movementType of ["MUDANCA_CIDADE", "DESAPROPRIACAO", "CREMACAO", "OUTRO"] as const) {
        const deceased = await registerDeceased(prisma, actor, unknown);
        await assert.rejects(registerMovement(prisma, actor, { deceasedId: deceased.id, graveId: "g2", movementType }), /destino\/justificativa/);
        await registerMovement(prisma, actor, { deceasedId: deceased.id, graveId: "g2", movementType, destinationDescription: "Destino administrativo autorizado" });
        assert.equal((await prisma.taxDeceased.findUniqueOrThrow({ where: { id: deceased.id } })).graveId, null);
      }
      const deceased = await registerDeceased(prisma, actor, unknown);
      await registerMovement(prisma, actor, { deceasedId: deceased.id, graveId: "g2", movementType: "OSSUARIO", ossuaryId: "oss" });
      assert.equal((await prisma.cemeteryOssuary.findUniqueOrThrow({ where: { id: "oss" } })).occupantCount, 1);
      const blocked = await registerDeceased(prisma, actor, unknown);
      const count = (await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g2" } })).occupantCount;
      await assert.rejects(registerMovement(prisma, actor, { deceasedId: blocked.id, graveId: "g2", movementType: "OSSUARIO", ossuaryId: "oss" }), /ossuário ativo com vaga/);
      assert.equal((await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g2" } })).occupantCount, count);
    });
    await t.test("competing finalizations cannot overfill a grave", async () => {
      await prisma.taxGrave.update({ where: { id: "g3" }, data: { capacity: 1 } });
      const ids: string[] = [];
      for (let index = 0; index < 2; index++) {
        const deceased = await registerDeceased(prisma, actor, { ...base, graveId: "g3", deceasedTaxpayerId: undefined, unidentified: true, burialType: "NAO_RECLAMADO", exceptionReason: "Autorização administrativa", finalizeNow: false });
        ids.push((await prisma.cemeteryProcess.findFirstOrThrow({ where: { deceasedId: deceased.id } })).id);
      }
      const outcomes = await Promise.allSettled(ids.map(processId => advanceCemeteryProcess(prisma, actor, { processId, status: "SEPULTADO" })));
      assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
      assert.equal((await prisma.taxGrave.findUniqueOrThrow({ where: { id: "g3" } })).occupantCount, 1);
    });
    await t.test("debt totals are uncapped, exclude closed debts, paid assessments and duplicate active-debt origins", async () => {
      await prisma.taxAssessment.createMany({ data: Array.from({ length: 125 }, (_, index) => ({ id: `assessment-${index}`, year: 2026, originalValue: 10, taxId: "tax", taxpayerId: "decl", status: "Lançado" })) });
      await prisma.activeDebt.createMany({ data: [{ id: "debt", taxpayerId: "decl", assessmentId: "assessment-0", originDebtType: "tax", year: 2026, originalValue: 10, updatedValue: 15, status: "INSCRITA" }, { id: "closed", taxpayerId: "decl", originDebtType: "tax", year: 2026, originalValue: 999, updatedValue: 999, status: "CANCELADA" }] });
      await prisma.taxGuide.create({ data: { id: "guide", assessmentId: "assessment-1", totalValue: 10, dueDate: base.deathDate, status: "Paga" } });
      await prisma.taxPayment.create({ data: { id: "paid", guideId: "guide", amountPaid: 10, paymentDate: base.deathDate, paymentMethod: "PIX", status: "Confirmado" } });
      const debt = await declarantDebtSnapshot(prisma, "decl"); assert.equal(debt.assessmentCount, 123); assert.equal(debt.activeDebtCount, 1); assert.equal(debt.total, "1245.00");
    });
  } finally { await db?.$disconnect(); await server.stop(); await memory.close(); }
});
