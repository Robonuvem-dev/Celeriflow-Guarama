import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { postAccountingTransaction, postAccountingTransactionInTransaction, requestAccountingMonthClose, authorizeAccountingMonthClose, prepareAnnualAccountingClose, finalizeAnnualAccountingClose } from "../src/lib/financeiro";

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) test(`P1/P3 PostgreSQL ${jurisdiction}: fechamento aguarda postagem em andamento e bloqueia nova postagem`, { skip: !process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL }, async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  let writer: Promise<unknown> | undefined;
  let closing: Promise<unknown> | undefined;
  try {
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    const actor = { ...f.actor, allowedBudgetUnitIds: undefined };
    const baselineTransactions = await f.db.accountingTransaction.count();
    const input = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-03-01"), history: "Fato em concorrência com fechamento", sourceModule: "TEST", sourceType: "PERIOD_RACE", idempotencyKey: "period-race", lines: [{ accountId: "debito", type: "Débito" as const, value: "2.00" }, { accountId: "credito", type: "Crédito" as const, value: "2.00" }] };
    writer = f.db.$transaction(async (tx) => {
      await postAccountingTransactionInTransaction(tx, actor, input);
      started();
      await hold;
    }, { timeout: 30000 });
    await Promise.race([ready, writer.then(() => { throw new Error("A postagem não chegou ao ponto de disputa."); })]);
    closing = requestAccountingMonthClose(f.db, actor, "ano", input.date);
    let lockObserved = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const result = await f.pg.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%'`);
      if (Number(result.rows[0].waiting) > 0) { lockObserved = true; break; }
      await delay(10);
    }
    assert.equal(lockObserved, true, "Fechamento deve aguardar o lock da postagem em outra sessão.");
    assert.equal(await f.db.monthlyAccountingClose.count(), 0);
    release();
    await Promise.all([writer, closing]);
    assert.equal(await f.db.accountingTransaction.count({ where: { idempotencyKey: input.idempotencyKey } }), 1);
    await assert.rejects(postAccountingTransaction(f.db, actor, { ...input, idempotencyKey: "late-period-race" }), /competencia contabil nao esta aberta/i);
    await authorizeAccountingMonthClose(f.db, { ...actor, usuarioId: "beatriz" }, "ano", input.date);
    assert.equal((await f.db.monthlyAccountingClose.findFirstOrThrow()).status, "FECHADO");
    assert.equal((await postAccountingTransaction(f.db, actor, input)).idempotencyKey, input.idempotencyKey);
    assert.equal(await f.db.accountingTransaction.count(), baselineTransactions + 1);
  } finally {
    release();
    await Promise.allSettled([writer, closing].filter((promise): promise is Promise<unknown> => !!promise));
    await f.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});

for (const jurisdiction of ["EXECUTIVE", "LEGISLATIVE"] as const) test(`P3 PostgreSQL ${jurisdiction}: encerramento anual aguarda competência e revalida reabertura concorrente`, { skip: !process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL }, async () => {
  const prior = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture(2026, 2, jurisdiction);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  let reopening: Promise<unknown> | undefined;
  let closing: Promise<unknown> | undefined;
  try {
    const actor = { ...f.actor, allowedBudgetUnitIds: undefined };
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    for (let month = 0; month < 12; month++) {
      const date = new Date(Date.UTC(2026, month, 1));
      await requestAccountingMonthClose(f.db, actor, "ano", date);
      await authorizeAccountingMonthClose(f.db, { ...actor, usuarioId: "beatriz" }, "ano", date);
    }
    await prepareAnnualAccountingClose(f.db, actor, "ano");
    reopening = f.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"ACCOUNTING_PERIOD:ano:2026-12-01T00:00:00.000Z"}, 0))::text`;
      await tx.monthlyAccountingClose.update({ where: { financialYearId_competence: { financialYearId: "ano", competence: new Date("2026-12-01") } }, data: { status: "ABERTO" } });
      ready();
      await hold;
    }, { timeout: 30000 });
    await Promise.race([started, reopening.then(() => { throw new Error("Reabertura não chegou à disputa."); })]);
    closing = finalizeAnnualAccountingClose(f.db, { ...actor, usuarioId: "beatriz" }, "ano");
    // Attach the rejection handler immediately while the other connection is held.
    const rejected = assert.rejects(closing, /doze competencias/i);
    let observed = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await f.pg.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%'`);
      if (Number(result.rows[0].waiting) > 0) { observed = true; break; }
      await delay(10);
    }
    assert.equal(observed, true, "Encerramento anual deve aguardar a competência em disputa.");
    release();
    await reopening;
    await rejected;
    assert.equal((await f.db.financialYear.findUniqueOrThrow({ where: { id: "ano" } })).status, "Em Encerramento");
    assert.equal((await f.db.annualAccountingClose.findUniqueOrThrow({ where: { financialYearId: "ano" } })).status, "PRONTO_PARA_VALIDACAO");
  } finally {
    release();
    await Promise.allSettled([reopening, closing].filter((value): value is Promise<unknown> => !!value));
    await f.close();
    if (prior === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = prior;
  }
});
