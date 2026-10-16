import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { chargeCemeteryFeeEvent, listCemeteryFeeEvents, listCemeteryFeeRules, publishCemeteryFeeRule, recordCemeteryFeeEvent } from "../src/lib/cemeteries/fees-service";

function feeMigration() {
  const fragment = "prisma/cemetery-fees-migration-fragment.sql";
  if (existsSync(fragment)) return readFileSync(fragment, "utf8");
  for (const folder of readdirSync("prisma/migrations-ibema")) {
    const path = `prisma/migrations-ibema/${folder}/migration.sql`;
    if (!existsSync(path)) continue;
    const sql = readFileSync(path, "utf8");
    if (sql.includes('CREATE TABLE "CemeteryFeeRuleVersion"')) {
      // The parent may combine this fragment with other cemetery phase migrations.
      const start = sql.indexOf('CREATE TABLE "CemeteryFeeRuleVersion"');
      const endMarker = 'EXECUTE FUNCTION cemetery_fee_immutable_event();';
      return sql.slice(start, sql.indexOf(endMarker, start) + endMarker.length);
    }
  }
  throw new Error("Migração de taxas cemiteriais não encontrada.");
}

test("PostgreSQL: versões, fatos imutáveis, responsável real, replay, rollback financeiro e DAM central", async () => {
  const database = new PGlite();
  const server = new PGLiteSocketServer({ db: database, port: 0, host: "127.0.0.1" });
  let prisma: PrismaClient | undefined;
  try {
    const models = ["Tax", "Taxpayer", "TaxCemetery", "CemeteryLot", "CemeteryProcess", "TaxDeceased", "TaxBurialMovement", "TaxGrave", "TaxGraveConcession", "CemeteryFeeRule", "TaxAssessment", "TaxGuide", "TaxAuditLog", "TaxDocumentSequence", "FinancialYear", "Person", "Company"];
    // Full scalar columns from the generated client let real central taxation APIs run against PostgreSQL.
    for (const name of models) {
      const model = Prisma.dmmf.datamodel.models.find((row) => row.name === name)!;
      const columns = model.fields.filter((field) => field.kind !== "object").map((field) => {
        const types: Record<string, string> = { Int: "INTEGER", BigInt: "BIGINT", Float: "DOUBLE PRECISION", Decimal: "DECIMAL(18,4)", Boolean: "BOOLEAN", DateTime: "TIMESTAMP(3)", Json: "JSONB" };
        const type = (types[field.type] ?? "TEXT") + (field.isList ? "[]" : "");
        let fallback = "";
        if (typeof field.default === "string") fallback = ` DEFAULT '${field.default.replaceAll("'", "''")}'`;
        if (typeof field.default === "boolean" || typeof field.default === "number") fallback = ` DEFAULT ${field.default}`;
        if (field.type === "Boolean") fallback = " DEFAULT true";
        if (field.type === "DateTime") fallback = " DEFAULT CURRENT_TIMESTAMP";
        if (["Int", "Float", "Decimal", "BigInt"].includes(field.type)) fallback = " DEFAULT 0";
        if (field.type === "Json") fallback = " DEFAULT '{}'::jsonb";
        if (field.type === "String" && field.name !== "id" && !field.name.endsWith("Id")) fallback = " DEFAULT ''";
        if (name === "TaxAssessment" && field.name === "status") fallback = " DEFAULT 'Lançado'";
        return `"${field.name}" ${type}${field.name === "id" ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await database.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await database.exec('CREATE UNIQUE INDEX tax_sequence_unique ON "TaxDocumentSequence"("year","documentType")');
    await database.exec(feeMigration());
    await database.exec(`
      INSERT INTO "Tax" (id,name,"taxType","isActive") VALUES ('tax','Taxa cemiterial','Taxa',true);
      INSERT INTO "Taxpayer" (id,status) VALUES ('owner','Ativo'),('declarant','Ativo');
      INSERT INTO "TaxCemetery" (id,code,name,active) VALUES ('cemetery','C1','Cemitério',true);
      INSERT INTO "CemeteryLot" (id,"cemeteryId",identifier,"ownerTaxpayerId","graveLimit","createdAt") VALUES ('lot','cemetery','L1','owner',4,'2026-10-10T10:00:00');
      INSERT INTO "TaxDeceased" (id,"fullName","cemeteryId") VALUES ('deceased','Falecido','cemetery');
      INSERT INTO "CemeteryProcess" (id,"receiptCode","processType",status,"deceasedId","cemeteryId","declarantTaxpayerId","performedAt") VALUES ('burial','R1','SEPULTAMENTO','SEPULTADO','deceased','cemetery','declarant','2026-10-10T14:00:00');
      INSERT INTO "FinancialYear" (id,year,status,"startDate","endDate") VALUES ('year',2026,'Aberto','2026-01-01','2026-12-31');
    `);
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const client = prisma;
    const actor = { usuarioId: "operator" };
    const rule = { cemeteryId: "", eventType: "ACQUISICAO_LOTE", label: "Aquisição", formula: "BASE_X_QUANTIDADE", baseAmount: "10.10", dueDays: 30, taxId: "tax", validFrom: "2026-01-01", validUntil: "", legalBasis: "Lei municipal 123" };
    const first = await publishCemeteryFeeRule(client, actor, rule);
    const input = { eventType: "ACQUISICAO_LOTE", sourceType: "LOTE" as const, sourceId: "lot", quantity: "3" };
    const event = await client.$transaction((tx) => recordCemeteryFeeEvent(tx, input));
    assert.equal(event.taxpayerId, "owner");
    assert.equal(event.amount?.toString(), "30.3");
    assert.equal(event.ruleVersionId, first.id);
    await publishCemeteryFeeRule(client, actor, { ...rule, baseAmount: "90.00" });
    assert.equal((await client.$transaction((tx) => recordCemeteryFeeEvent(tx, input))).id, event.id);
    await assert.rejects(client.$transaction((tx) => recordCemeteryFeeEvent(tx, { ...input, quantity: "4" })), /quantidade diferente/);
    await assert.rejects(database.query('UPDATE "CemeteryFeeRuleVersion" SET "dueDays"=1 WHERE "id"=$1', [first.id]), /immutable/);
    await assert.rejects(database.query('UPDATE "CemeteryFeeEvent" SET "taxpayerId"=\'declarant\' WHERE "id"=$1', [event.id]), /immutable/);
    await client.tax.update({ where: { id: "tax" }, data: { isActive: false } });
    assert.equal((await chargeCemeteryFeeEvent(client, actor, event.eventKey)).status, "FALHA_EMISSAO");
    assert.equal(await client.taxAssessment.count(), 0, "falha não deixa lançamento órfão");
    await client.tax.update({ where: { id: "tax" }, data: { isActive: true } });
    const results = await Promise.all([chargeCemeteryFeeEvent(client, actor, event.eventKey), chargeCemeteryFeeEvent(client, actor, event.eventKey)]);
    assert.equal(results[0].assessmentId, results[1].assessmentId);
    assert.equal(await client.taxAssessment.count(), 1);
    assert.equal(await client.taxGuide.count(), 1);
    const assessment = await client.taxAssessment.findFirstOrThrow();
    assert.equal(assessment.finalValueDecimal?.toFixed(2), "30.30");
    assert.equal(assessment.taxpayerId, "owner");
    assert.match(assessment.assessmentNumber!, /^LAN-2026-/);
    const guide = await client.taxGuide.findFirstOrThrow();
    assert.match(guide.guideNumber!, /^DAM-2026-/);
    assert.equal(guide.dueDate.toISOString(), "2026-11-09T12:00:00.000Z");
    const missing = await client.$transaction((tx) => recordCemeteryFeeEvent(tx, { eventType: "SEPULTAMENTO", sourceType: "PROCESSO", sourceId: "burial" }));
    assert.equal(missing.status, "AGUARDANDO_CONFIGURACAO");
    assert.equal(missing.taxpayerId, "declarant");
    assert.equal((await chargeCemeteryFeeEvent(client, actor, missing.eventKey)).status, "AGUARDANDO_CONFIGURACAO");
    await publishCemeteryFeeRule(client, actor, { ...rule, eventType: "SEPULTAMENTO", formula: "VALOR_FIXO", baseAmount: "40.00" });
    await database.exec(`CREATE FUNCTION reject_test_guide() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Guide test failure'; END; $$; CREATE TRIGGER reject_guide BEFORE INSERT ON "TaxGuide" FOR EACH ROW EXECUTE FUNCTION reject_test_guide();`);
    assert.equal((await chargeCemeteryFeeEvent(client, actor, missing.eventKey)).status, "FALHA_EMISSAO");
    assert.equal(await client.taxAssessment.count(), 1, "falha de DAM reverte também o lançamento criado na mesma transação");
    assert.equal(await client.taxGuide.count(), 1);
    await database.exec('DROP TRIGGER reject_guide ON "TaxGuide"; DROP FUNCTION reject_test_guide()');
    assert.equal((await chargeCemeteryFeeEvent(client, actor, missing.eventKey)).status, "EMITIDA");
    const listed = await listCemeteryFeeEvents(client);
    assert.equal(listed.total, 2);
    assert.equal(listed.rows.filter((row) => row.guide?.status === "Emitida").length, 2);
    const filtered = await listCemeteryFeeEvents(client, 999, "EMITIDA", { q: "SEPULTAMENTO", cemeteryId: "cemetery" });
    assert.equal(filtered.total, 1); assert.equal(filtered.page, 1);
    assert.equal((await listCemeteryFeeEvents(client, 1, "", { q: "%" })).total, 0);
    assert.equal((await listCemeteryFeeEvents(client, 1, "", { cemeteryId: "another" })).total, 0);
    assert.equal((await listCemeteryFeeRules(client, 999, { q: "Aquisição", cemeteryId: "cemetery" })).page, 1);
    await client.$executeRaw`UPDATE "CemeteryProcess" SET "performedAt"=NULL,"status"='AGENDADO' WHERE "id"='burial'`;
    await assert.rejects(client.$transaction((tx) => recordCemeteryFeeEvent(tx, { eventType: "VELORIO", sourceType: "PROCESSO", sourceId: "burial" })), /efetivamente realizado/);
  } finally {
    await prisma?.$disconnect();
    await server.stop();
    await database.close();
  }
});
