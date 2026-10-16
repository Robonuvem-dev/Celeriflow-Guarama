import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { recordProcessJudicialCase, judicialCaseWhere, judicialCaseFilters } from "../src/lib/protocols/judicial-cases";
import type { ProtocolContext } from "../src/lib/protocols/access";

test("P6: consulta jurídica usa registro documentado, ente/UG e ACL de processos, com andamentos aditivos", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture();
  try {
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261014140000_process_judicial_cases/migration.sql", "utf8"));
    await f.db.department.create({ data: { id: "judicial-department", name: "Setor responsável", secretariatId: "secretaria" } });
    await f.db.processType.create({ data: { id: "judicial-type", name: "Acompanhamento judicial" } });
    await f.db.subject.create({ data: { id: "judicial-subject", name: "Ação contra entidade", processTypeId: "judicial-type" } });
    await f.db.process.create({ data: { id: "judicial-process", protocolNumber: "JUDICIAL-2026-1", processTypeId: "judicial-type", subjectId: "judicial-subject", currentDepartmentId: "judicial-department" } });
    await f.db.documentVersion.create({ data: { id: "judicial-document-v1", documentId: "documento-fiscal", versionNumber: 1, fileUrl: "/judicial-evidence", hashSha256: "b".repeat(64), status: "FINAL" } });
    await f.db.processDocument.create({ data: { processId: "judicial-process", documentId: "documento-fiscal", employeeId: "servidora-ana" } });
    const context = { ...f.context, prisma: f.db, user: { ...f.context.user, id: "ana", departmentId: "judicial-department", allowedBudgetUnitIds: ["ug"] }, protocolAccess: { isAdmin: false, canView: true, canEdit: true, canCreate: true, canUpdate: true } } as ProtocolContext;
    const input = { processId: "judicial-process", budgetUnitId: "ug", caseNumber: "AÇÃO-DOCUMENTADA-FIXTURE", court: "Órgão judicial documentado", openedAt: "2026-01-01", status: "OPEN" as const, effectiveAt: "2026-01-01", expectedVersion: 0, reason: "Documento identifica a entidade como demandada", documentVersionId: "judicial-document-v1", idempotencyKey: "judicial-open", municipalDefendantConfirmed: true as const };
    const simultaneous = await Promise.all([recordProcessJudicialCase(context, input), recordProcessJudicialCase(context, input)]);
    assert.equal(simultaneous[0].id, simultaneous[1].id);
    assert.equal(await f.db.processJudicialCase.count(), 1);
    assert.equal(await f.db.processJudicialCaseEvent.count(), 1);
    await assert.rejects(recordProcessJudicialCase(context, { ...input, reason: "Outra classificação judicial" }), /outros dados/);
    await assert.rejects(recordProcessJudicialCase({ ...context, user: { ...context.user, departmentId: "other-department" } }, input), /setor atual/);
    const filter = judicialCaseFilters.parse({});
    assert.equal(await f.db.processJudicialCase.count({ where: judicialCaseWhere(context, "ente", filter) }), 1);
    assert.equal(await f.db.processJudicialCase.count({ where: judicialCaseWhere({ ...context, user: { ...context.user, departmentId: "other-department" } }, "ente", filter) }), 0);
    assert.equal(await f.db.processJudicialCase.count({ where: judicialCaseWhere(context, "outro-ente", filter) }), 0);
    const closed = await recordProcessJudicialCase(context, { ...input, expectedVersion: 1, status: "CLOSED", effectiveAt: "2026-02-01", reason: "Decisão documentada encerrou o acompanhamento", idempotencyKey: "judicial-close" });
    assert.equal(closed.version, 2);
    assert.equal(await f.db.processJudicialCase.count({ where: judicialCaseWhere(context, "ente", filter) }), 0);
    assert.equal(await f.db.processJudicialCase.count({ where: judicialCaseWhere(context, "ente", judicialCaseFilters.parse({ status: "CLOSED" })) }), 1);
    await assert.rejects(f.pg.query('UPDATE "ProcessJudicialCaseEvent" SET reason=$1 WHERE id=$2', ["Sobrescrever decisão", closed.id]), /imutável/);
    await assert.rejects(f.pg.query('UPDATE "ProcessJudicialCase" SET status=$1, version=version+1 WHERE id=$2', ["OPEN", closed.caseId]), /mesma transação/);
    assert.equal((await f.db.processJudicialCase.findUniqueOrThrow({ where: { id: closed.caseId } })).status, "CLOSED");
    assert.equal(await f.db.processJudicialCaseEvent.count(), 2);
  } finally {
    await f.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});
