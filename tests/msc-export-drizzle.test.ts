import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import JSZip from "jszip";
import { generateMunicipalMscArchive } from "../src/lib/financeiro/msc-export";
import { mscReference2026Hash } from "../src/lib/financeiro/msc-configuration";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";

const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const config = { entityIds: ["ente", "camara"], budgetUnitIds: ["ug", "ug-camara"], aggregation: "WITHOUT_RECIPROCAL_ELIMINATION", operational: true };
const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-camara"] };
const input = { reportingScopeEntryId: "perimetro", period: "2026-01" };

function memory(accountCode: string, po: string) {
  return { status: "DOCUMENTED", accountCode, referenceHash: mscReference2026Hash, referenceVersionId: "referencia", mappingEntryId: "de-para-congelado", mappingVersionId: "edicao-municipal",
    informationPairs: 6, omittedInformationTypes: ["CO", "DC"], pairs: [{ type: "PO", value: po }, { type: "FP", value: "1" }, { type: "FR", value: "1500" }] };
}

async function fixture() {
  const pg = new PGlite();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    await pg.exec(`
      CREATE TABLE "Usuario" (id text PRIMARY KEY);
      CREATE TABLE "GovernmentEntity" (id text PRIMARY KEY, type text NOT NULL, "parentId" text, status text NOT NULL DEFAULT 'ATIVA');
      CREATE TABLE "PlanningEntityUnit" ("budgetUnitId" text PRIMARY KEY, "governmentEntityId" text NOT NULL REFERENCES "GovernmentEntity");
      CREATE TABLE "FinancialYear" (id text PRIMARY KEY, year integer NOT NULL, "governmentEntityId" text NOT NULL REFERENCES "GovernmentEntity");
      CREATE TABLE "PlanningCatalogVersion" (id text PRIMARY KEY, year integer NOT NULL, label text NOT NULL, "normativeReference" text NOT NULL, "sourceHash" text NOT NULL, status text NOT NULL, "createdById" text NOT NULL REFERENCES "Usuario", "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "PlanningCatalogEntry" (id text PRIMARY KEY, "versionId" text NOT NULL REFERENCES "PlanningCatalogVersion", kind text NOT NULL, code text NOT NULL, name text NOT NULL, "parentCode" text, degree integer NOT NULL, "canonicalId" text NOT NULL, attributes jsonb NOT NULL);
      CREATE TABLE "AccountingTransaction" (id text PRIMARY KEY, "financialYearId" text NOT NULL REFERENCES "FinancialYear", "governmentEntityId" text, "budgetUnitId" text, date timestamp(3) NOT NULL, status text NOT NULL, "eventType" text NOT NULL);
      CREATE TABLE "AccountingEntry" (id text PRIMARY KEY, "transactionId" text REFERENCES "AccountingTransaction", type text NOT NULL, "valueDecimal" numeric(18,2), "classificationSnapshot" jsonb);
      CREATE TABLE "MonthlyAccountingClose" (id text PRIMARY KEY, "financialYearId" text NOT NULL REFERENCES "FinancialYear", competence timestamp(3) NOT NULL, status text NOT NULL);
      CREATE TABLE "AnnualAccountingClose" (id text PRIMARY KEY, "financialYearId" text NOT NULL UNIQUE REFERENCES "FinancialYear", status text NOT NULL);
      CREATE TABLE "FinancialAuditLog" (id text PRIMARY KEY, action text NOT NULL, "entityType" text NOT NULL, "entityId" text NOT NULL, "financialYearId" text, "budgetUnitId" text, payload jsonb, "authorUsuarioId" text NOT NULL REFERENCES "Usuario", "authorEmployeeId" text, "createdAt" timestamp(3) NOT NULL DEFAULT now(), CHECK (current_setting('transaction_isolation') = 'repeatable read'));
      INSERT INTO "Usuario" VALUES ('ana');
      INSERT INTO "GovernmentEntity" (id,type,"parentId") VALUES ('ente','PREFEITURA',NULL),('camara','CAMARA','ente'),('fora','AUTARQUIA',NULL);
      INSERT INTO "PlanningEntityUnit" VALUES ('ug','ente'),('ug-camara','camara'),('ug-fora','fora');
      INSERT INTO "FinancialYear" VALUES ('ano',2026,'ente'),('ano-camara',2026,'camara'),('ano-fora',2026,'fora');
      INSERT INTO "PlanningCatalogVersion" (id,year,label,"normativeReference","sourceHash",status,"createdById") VALUES ('municipal',2026,'Perímetro','Decisão municipal','perimetro-hash','PUBLISHED','ana');
      INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes) VALUES ('perimetro','municipal','MSC_REPORTING_SCOPE','4109756EX','Município',0,'ente','{}');
      INSERT INTO "MonthlyAccountingClose" VALUES ('executivo','ano','2026-01-01','FECHADO');
    `);
    await pg.query('UPDATE "PlanningCatalogEntry" SET attributes=$1::jsonb WHERE id=$2', [JSON.stringify(config), "perimetro"]);
    await pg.query('INSERT INTO "PlanningCatalogVersion" (id,year,label,"normativeReference","sourceHash",status,"createdById") VALUES ($1,2026,$2,$2,$3,$4,$5)', ["referencia", "Referência oficial", mscReference2026Hash, "PUBLISHED", "ana"]);
    for (const [id, kind, code, attributes] of [
      ["conta-d", "MSC_ACCOUNT", "111110100", { informationTypes: ["PO", "FP", "FR", "CO", "DC"] }],
      ["conta-c", "MSC_ACCOUNT", "211110101", { informationTypes: ["PO", "FP", "FR", "CO", "DC"] }],
      ["po-e", "MSC_PO", "10131", {}], ["po-l", "MSC_PO", "20231", {}], ["fp", "MSC_FP", "1", {}], ["fr", "MSC_FR", "1500", {}],
    ] as const) {
      await pg.query('INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes) VALUES ($1,$2,$3,$4,$1,0,$1,$5::jsonb)', [id, "referencia", kind, code, JSON.stringify(attributes)]);
    }
    for (const [entity, unit, year, po, amount] of [["ente", "ug", "ano", "10131", "0.10"], ["camara", "ug-camara", "ano-camara", "20231", "0.20"]]) {
      for (const [suffix, date, eventType, value] of [["abertura", "2026-01-01", "ACCOUNTING_YEAR_OPENING", "1.00"], ["movimento", "2026-01-20", "DOCUMENTED_EVENT", amount]]) {
        const transactionId = `${entity}:${suffix}`;
        await pg.query('INSERT INTO "AccountingTransaction" VALUES ($1,$2,$3,$4,$5,$6,$7)', [transactionId, year, entity, unit, date, "POSTADO", eventType]);
        for (const [code, type] of [["111110100", "Débito"], ["211110101", "Crédito"]]) {
          await pg.query('INSERT INTO "AccountingEntry" VALUES ($1,$2,$3,$4,$5::jsonb)', [`${transactionId}:${type}`, transactionId, type, value, JSON.stringify({ dimensions: { governmentEntityId: entity, budgetUnitId: unit, msc: memory(code, po) } })]);
        }
      }
    }
    // These otherwise matching rows are outside the perimeter/status/period and cannot enter the file.
    await pg.exec(`
      INSERT INTO "AccountingTransaction" VALUES ('externo','ano-fora','fora','ug-fora','2026-01-20','POSTADO','DOCUMENTED_EVENT'), ('rascunho','ano','ente','ug','2026-01-20','RASCUNHO','DOCUMENTED_EVENT'), ('posterior','ano','ente','ug','2026-02-01','POSTADO','DOCUMENTED_EVENT');
      INSERT INTO "AccountingEntry" VALUES ('externo','externo','Débito',999,NULL), ('rascunho','rascunho','Débito',999,NULL), ('posterior','posterior','Débito',999,NULL);
    `);
    transport = await connectFinanceDrizzleFixture(pg);
    const connected = transport;
    return { pg, connection: connected.connection, async close() { try { await connected.close(); } finally { await pg.close(); } } };
  } catch (error) { try { await transport?.close(); } finally { await pg.close(); } throw error; }
}

function expectedJanuaryCsv() {
  const header = ["CONTA", ...Array.from({ length: 6 }, (_, index) => [`IC${index + 1}`, `TIPO${index + 1}`]).flat(), "Valor", "Tipo_valor", "Natureza_valor"];
  const rows: string[][] = [["4109756EX", "2026-01", ...Array(14).fill("")], header];
  for (const [account, nature] of [["111110100", "D"], ["211110101", "C"]]) {
    for (const [po, change, ending] of [["10131", "0.10", "1.10"], ["20231", "0.20", "1.20"]]) {
      const prefix = [account, po, "PO", "1", "FP", "1500", "FR", ...Array(6).fill("")];
      rows.push([...prefix, "1.00", "beginning_balance", nature], [...prefix, change, "period_change", nature], [...prefix, ending, "ending_balance", nature]);
    }
  }
  return rows.map(row => row.join(";")).join("\r\n") + "\r\n";
}

test("MSC Drizzle preserves closed-perimeter CSV/ZIP, frozen memories, pagination and audit", async t => {
  const f = await fixture();
  const auditCount = async () => (await f.pg.query<{ total: number }>('SELECT count(*)::int AS total FROM "FinancialAuditLog"')).rows[0].total;
  try {
    await t.test("requires every authorized UG and every closed month before writing audit", async () => {
      await assert.rejects(generateMunicipalMscArchive(f.connection, { ...actor, allowedBudgetUnitIds: [] }, input), /todas as UGs/);
      await assert.rejects(generateMunicipalMscArchive(f.connection, { ...actor, allowedBudgetUnitIds: ["ug"] }, input), /todas as UGs/);
      await assert.rejects(generateMunicipalMscArchive(f.connection, actor, input), /competência fechada/);
      assert.equal(await auditCount(), 0);
      await f.pg.exec(`INSERT INTO "MonthlyAccountingClose" VALUES ('legislativo','ano-camara','2026-01-01','FECHADO')`);
    });
    await t.test("CSV bytes, exact cents, deterministic ZIP and persisted hashes agree", async () => {
      const archive = await generateMunicipalMscArchive(f.connection, actor, input);
      assert.equal(archive.csv, expectedJanuaryCsv());
      assert.equal(archive.csvHash, digest(expectedJanuaryCsv()));
      assert.equal(archive.archiveHash, digest(archive.bytes));
      assert.equal(archive.filename, "MSC_4109756EX_2026-01.zip");
      assert.equal(archive.sourceEntryCount, 8);
      assert.equal(archive.outputRows, 12);
      const zip = await JSZip.loadAsync(archive.bytes);
      assert.equal(await zip.file("MSC_4109756EX_2026-01.csv")!.async("string"), archive.csv);
      const [audit] = (await f.pg.query<{ payload: { csvHash: string; evidenceHash: string; transmissionStatus: string; sourceEntryCount: number }; authorUsuarioId: string }>('SELECT payload,"authorUsuarioId" FROM "FinancialAuditLog"')).rows;
      assert.equal(audit.payload.csvHash, archive.csvHash);
      assert.equal(audit.payload.evidenceHash, archive.evidenceHash);
      assert.equal(audit.payload.sourceEntryCount, 8);
      assert.equal(audit.payload.transmissionStatus, "NOT_TRANSMITTED");
      assert.equal(audit.authorUsuarioId, "ana");
      const replay = await generateMunicipalMscArchive(f.connection, actor, input);
      assert.deepEqual(replay.bytes, archive.bytes);
      assert.equal(replay.evidenceHash, archive.evidenceHash);
    });
    await t.test("superseded perimeter, missing frozen memory and imbalance cannot create success audit", async () => {
      const before = await auditCount();
      await f.pg.query('INSERT INTO "PlanningCatalogEntry" SELECT $1,"versionId",kind,code,name,"parentCode",degree,"canonicalId",attributes || $2::jsonb FROM "PlanningCatalogEntry" WHERE id=$3', ["sucessor", JSON.stringify({ predecessorEntryId: "perimetro" }), "perimetro"]);
      await assert.rejects(generateMunicipalMscArchive(f.connection, actor, input), /edição vigente/);
      await f.pg.exec(`DELETE FROM "PlanningCatalogEntry" WHERE id='sucessor'`);
      const [entry] = (await f.pg.query<{ id: string; classificationSnapshot: unknown }>('SELECT id,"classificationSnapshot" FROM "AccountingEntry" WHERE id=$1', ["ente:movimento:Débito"])).rows;
      await f.pg.query('UPDATE "AccountingEntry" SET "classificationSnapshot"=$1::jsonb WHERE id=$2', [JSON.stringify({ dimensions: { governmentEntityId: "ente", budgetUnitId: "ug" } }), entry.id]);
      await assert.rejects(generateMunicipalMscArchive(f.connection, actor, input), /composição MSC documentada/);
      await f.pg.query('UPDATE "AccountingEntry" SET "classificationSnapshot"=$1::jsonb,"valueDecimal"=0.11 WHERE id=$2', [JSON.stringify(entry.classificationSnapshot), entry.id]);
      await assert.rejects(generateMunicipalMscArchive(f.connection, actor, input), /não balanceada/);
      await f.pg.query('UPDATE "AccountingEntry" SET "valueDecimal"=0.10 WHERE id=$1', [entry.id]);
      assert.equal(await auditCount(), before);
      // A failed audit FK must roll back the entire transaction and return no archive.
      await assert.rejects(generateMunicipalMscArchive(f.connection, { ...actor, usuarioId: "ausente" }, input), (error: unknown) => {
        assert.ok(error instanceof Error);
        const cause = error.cause;
        assert.ok(cause && typeof cause === "object" && "code" in cause);
        assert.equal(cause.code, "23503");
        return true;
      });
      assert.equal(await auditCount(), before);
    });
    await t.test("frozen FS requires both function and subfunction in its own official version", async () => {
      await f.pg.exec(`
        UPDATE "PlanningCatalogEntry" SET attributes=jsonb_set(attributes,'{informationTypes}',attributes->'informationTypes' || '["FS"]'::jsonb) WHERE id='conta-d';
        UPDATE "AccountingEntry" SET "classificationSnapshot"=jsonb_set("classificationSnapshot",'{dimensions,msc,pairs}',"classificationSnapshot"#>'{dimensions,msc,pairs}' || '[{"type":"FS","value":"10301"}]'::jsonb) WHERE type='Débito' AND id NOT IN ('externo','rascunho','posterior');
        INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes) VALUES ('funcao','referencia','MSC_FUNCTION','10','Saúde',0,'funcao','{}');
      `);
      const before = await auditCount();
      await assert.rejects(generateMunicipalMscArchive(f.connection, actor, input), /Código de IC FS/);
      assert.equal(await auditCount(), before);
      await f.pg.exec(`INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes) VALUES ('subfuncao','referencia','MSC_SUBFUNCTION','301','Atenção básica',0,'subfuncao','{}')`);
      const archive = await generateMunicipalMscArchive(f.connection, actor, input);
      assert.ok(archive.csv.includes("10301;FS"));
      await f.pg.exec(`
        UPDATE "PlanningCatalogEntry" SET attributes=jsonb_set(attributes,'{informationTypes}',(attributes->'informationTypes') - 'FS') WHERE id='conta-d';
        UPDATE "AccountingEntry" SET "classificationSnapshot"=jsonb_set("classificationSnapshot",'{dimensions,msc,pairs}',("classificationSnapshot"#>'{dimensions,msc,pairs}') - 3) WHERE type='Débito' AND id NOT IN ('externo','rascunho','posterior');
      `);
    });
    await t.test("stable pages include every line once and retain cents above JS safe integer precision", async () => {
      const templates = ["ente:movimento:Débito", "ente:movimento:Crédito"];
      for (const id of templates) {
        await f.pg.query('INSERT INTO "AccountingEntry" SELECT $1 || n::text,"transactionId",type,0.01,"classificationSnapshot" FROM "AccountingEntry" CROSS JOIN generate_series(1,501) AS n WHERE id=$2', [`pagina:${id}:`, id]);
        await f.pg.query('INSERT INTO "AccountingEntry" SELECT $1,"transactionId",type,90071992547409.93,"classificationSnapshot" FROM "AccountingEntry" WHERE id=$2', [`precisao:${id}`, id]);
      }
      const archive = await generateMunicipalMscArchive(f.connection, actor, input);
      assert.equal(archive.sourceEntryCount, 1012);
      assert.ok(archive.csv.includes("90071992547415.04;period_change;D"));
      assert.ok(archive.csv.includes("90071992547416.04;ending_balance;C"));
      assert.equal(archive.outputRows, 12);
    });
    await t.test("MSC 13 requires all annual closes and carries annual position as beginning balance", async () => {
      const closingInput = { ...input, period: "2026-13" };
      // The row at the February boundary now belongs to the annual export. Drop this invalid sentinel.
      await f.pg.exec(`DELETE FROM "AccountingEntry" WHERE id='posterior'; DELETE FROM "AccountingTransaction" WHERE id='posterior'`);
      await assert.rejects(generateMunicipalMscArchive(f.connection, actor, closingInput), /encerramento anual/);
      await f.pg.exec(`INSERT INTO "AnnualAccountingClose" VALUES ('anual-e','ano','ENCERRADO'),('anual-l','ano-camara','ENCERRADO')`);
      const archive = await generateMunicipalMscArchive(f.connection, actor, closingInput);
      assert.equal(archive.sourceEntryCount, 1012);
      assert.equal(archive.outputRows, 8);
      assert.ok(archive.csv.includes("90071992547416.04;beginning_balance;D"));
      assert.ok(!archive.csv.includes(";period_change;"));
    });
  } finally { await f.close(); }
});
