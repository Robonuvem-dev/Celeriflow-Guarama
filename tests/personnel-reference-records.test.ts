import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import type { DatabaseExecutor } from "../src/db/transaction";
import { fillEmployeeDocument, issueEmployeeDocument } from "../src/lib/rh/employee-document";
import { hrEmployeeDocuments } from "../src/db/schema/personnel-reference-records";
import { deleteReferenceRecord, listReferenceRecords, parseReferenceRecord, saveReferenceRecord } from "../src/lib/rh/reference-records";

test("cadastros de ponto validam datas, dias, intervalos e payloads específicos", () => {
  assert.throws(() => parseReferenceRecord({ kind: "LICENCA_EDUCACAO", code: "L", name: "Férias", details: { maximumDays: "0", legalReference: "Estatuto" } }));
  assert.throws(() => parseReferenceRecord({ kind: "FERIADO", code: "X", name: "Data inválida", details: { date: "2026-02-30", scope: "Municipal" } }));
  assert.throws(() => parseReferenceRecord({ kind: "FAIXA", code: "X", name: "Faixa inválida", details: { teamId: "X", start: "25:00", end: "17:00" } }));
  assert.throws(() => parseReferenceRecord({ kind: "ESCALA", code: "X", name: "Escala inválida", details: { employeeId: "X", rangeId: "X", weekdays: "1,1", from: "2026-01-01", until: "2026-12-31" } }));
});

test("PostgreSQL local persiste equipe/faixa/escala, impede referências inexistentes e exclusão em uso", async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE "Employee" ("id" text primary key, "name" text, "cpf" text, "registration" text); INSERT INTO "Employee" VALUES (\'e1\',\'Ana\',\'123\',\'001\');');
    await pg.exec(readFileSync("db/migrations/20261030120000_personnel_reference_records/migration.sql", "utf8"));
    await pg.exec('CREATE TABLE "BudgetAppropriation" (id text primary key,code text); INSERT INTO "BudgetAppropriation" VALUES (\'b1\',\'2026.001\');');
    const db = drizzle(pg) as unknown as DatabaseExecutor;
    await saveReferenceRecord(db, undefined, { kind: "LICENCA_EDUCACAO", code: "FERIAS", name: "Férias docentes", details: { maximumDays: "30", legalReference: "Estatuto municipal" } });
    assert.equal((await listReferenceRecords(db, "LICENCA_EDUCACAO"))[0].details.maximumDays,"30");
    await saveReferenceRecord(db, undefined, { kind: "PREVIDENCIA_OPTATIVA", code: "PV1", name: "Opção individual", details: { employeeId: "e1", rubricCode: "EXTRA", rate: "14", basis: "Verba extraordinária", choice: "Recolher", legalReference: "Lei municipal", effectiveFrom: "2026-01-01" } });
    assert.equal((await listReferenceRecords(db, "PREVIDENCIA_OPTATIVA"))[0].details.choice,"Recolher");
    const model = await saveReferenceRecord(db, undefined, {kind:"MODELO_DOCUMENTO",code:"CONTRATO",name:"Contrato funcional",details:{documentType:"Contrato",body:"Contrato de {{nome}}, CPF {{cpf}}, matrícula {{matricula}}."}});
    const issued = await issueEmployeeDocument(db,"e1",model.id);
    assert.equal(issued.body,"Contrato de Ana, CPF 123, matrícula 001.");
    await saveReferenceRecord(db,model.id,{kind:"MODELO_DOCUMENTO",code:"CONTRATO",name:"Contrato revisado",details:{documentType:"Contrato",body:"Novo modelo {{nome}}"}});
    assert.equal((await db.select().from(hrEmployeeDocuments))[0].body,issued.body,"alterar modelo não altera documento arquivado");
    assert.throws(()=>fillEmployeeDocument("{{chave_inexistente}}",{nome:"A",cpf:"1",matricula:"1",data:"1"}),/desconhecida/);
    await saveReferenceRecord(db,undefined,{kind:"LOTACAO_ORCAMENTARIA",code:"L1",name:"Dotação do servidor",details:{employeeId:"e1",appropriationId:"b1"}});
    await assert.rejects(saveReferenceRecord(db,undefined,{kind:"LOTACAO_ORCAMENTARIA",code:"L2",name:"Dotação inválida",details:{employeeId:"e1",appropriationId:"missing"}}),/Dotação orçamentária não encontrada/);
    const team = await saveReferenceRecord(db, undefined, { kind: "EQUIPE", code: "T1", name: "Educação", details: { description: "Equipe escolar" } });
    const range = await saveReferenceRecord(db, undefined, { kind: "FAIXA", code: "F1", name: "Diurno", details: { teamId: team.id, start: "08:00", end: "17:00" } });
    const scale = await saveReferenceRecord(db, undefined, { kind: "ESCALA", code: "E1", name: "Servidor", details: { employeeId: "e1", rangeId: range.id, weekdays: "1,2,3,4,5", from: "2026-01-01", until: "2026-12-31" } });
    assert.equal((await listReferenceRecords(db, "ESCALA"))[0].details.employeeId, "e1");
    await assert.rejects(deleteReferenceRecord(db, team.id, "EQUIPE"), /utilizado/);
    await assert.rejects(saveReferenceRecord(db, undefined, { kind: "FAIXA", code: "F2", name: "Erro", details: { teamId: "missing", start: "08:00", end: "17:00" } }), /não encontrada/);
    await saveReferenceRecord(db, team.id, { kind: "EQUIPE", code: "T1", name: "Educação atualizada", details: { description: "Revisão" } });
    assert.equal((await listReferenceRecords(db, "EQUIPE"))[0].name, "Educação atualizada");
    await deleteReferenceRecord(db, scale.id, "ESCALA"); await deleteReferenceRecord(db, range.id, "FAIXA"); await deleteReferenceRecord(db, team.id, "EQUIPE");
    assert.equal((await listReferenceRecords(db, "EQUIPE")).length, 0);
  } finally { await pg.close(); }
});
