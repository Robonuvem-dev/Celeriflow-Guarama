import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, count, eq, sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accountingTransactions, annualAccountingCloses, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
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
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(f.pg);
    const { connection } = transport;
    const db = connection.db;
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    const actor = { ...f.actor, allowedBudgetUnitIds: undefined };
    const baselineTransactions = (await db.select({ total: count() }).from(accountingTransactions))[0].total;
    const input = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-03-01"), history: "Fato em concorrência com fechamento", sourceModule: "TEST", sourceType: "PERIOD_RACE", idempotencyKey: "period-race", lines: [{ accountId: "debito", type: "Débito" as const, value: "2.00" }, { accountId: "credito", type: "Crédito" as const, value: "2.00" }] };
    writer = withDatabaseTransaction(connection, async (tx) => {
      await postAccountingTransactionInTransaction(tx, actor, input);
      started();
      await hold;
    }, { timeoutMs: 30_000, lockTimeoutMs: 30_000 });
    await Promise.race([ready, writer.then(() => { throw new Error("A postagem não chegou ao ponto de disputa."); })]);
    closing = requestAccountingMonthClose(connection, actor, "ano", input.date);
    let lockObserved = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const result = await f.pg.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%'`);
      if (Number(result.rows[0].waiting) > 0) { lockObserved = true; break; }
      await delay(10);
    }
    assert.equal(lockObserved, true, "Fechamento deve aguardar o lock da postagem em outra sessão.");
    assert.equal((await db.select({ total: count() }).from(monthlyAccountingCloses))[0].total, 0);
    release();
    await Promise.all([writer, closing]);
    assert.equal((await db.select({ total: count() }).from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, input.idempotencyKey)))[0].total, 1);
    await assert.rejects(postAccountingTransaction(connection, actor, { ...input, idempotencyKey: "late-period-race" }), /competencia contabil nao esta aberta/i);
    await authorizeAccountingMonthClose(connection, { ...actor, usuarioId: "beatriz" }, "ano", input.date);
    assert.equal((await db.select({ status: monthlyAccountingCloses.status }).from(monthlyAccountingCloses).limit(1))[0].status, "FECHADO");
    assert.equal((await postAccountingTransaction(connection, actor, input)).idempotencyKey, input.idempotencyKey);
    assert.equal((await db.select({ total: count() }).from(accountingTransactions))[0].total, baselineTransactions + 1);
  } finally {
    release();
    await Promise.allSettled([writer, closing].filter((promise): promise is Promise<unknown> => !!promise));
    try { await transport?.close(); } finally {
      try { await f.close(); } finally {
        if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
        else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
      }
    }
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
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(f.pg);
    const { connection } = transport;
    const db = connection.db;
    const actor = { ...f.actor, allowedBudgetUnitIds: undefined };
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    for (let month = 0; month < 12; month++) {
      const date = new Date(Date.UTC(2026, month, 1));
      await requestAccountingMonthClose(connection, actor, "ano", date);
      await authorizeAccountingMonthClose(connection, { ...actor, usuarioId: "beatriz" }, "ano", date);
    }
    await prepareAnnualAccountingClose(connection, actor, "ano");
    reopening = withDatabaseTransaction(connection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"ACCOUNTING_PERIOD:ano:2026-12-01T00:00:00.000Z"}, 0))::text`);
      await tx.update(monthlyAccountingCloses).set({ status: "ABERTO" }).where(and(eq(monthlyAccountingCloses.financialYearId, "ano"), eq(monthlyAccountingCloses.competence, new Date("2026-12-01"))));
      ready();
      await hold;
    }, { timeoutMs: 30_000, lockTimeoutMs: 30_000 });
    await Promise.race([started, reopening.then(() => { throw new Error("Reabertura não chegou à disputa."); })]);
    closing = finalizeAnnualAccountingClose(connection, { ...actor, usuarioId: "beatriz" }, "ano");
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
    assert.equal((await db.select({ status: financialYears.status }).from(financialYears).where(eq(financialYears.id, "ano")))[0].status, "Em Encerramento");
    assert.equal((await db.select({ status: annualAccountingCloses.status }).from(annualAccountingCloses).where(eq(annualAccountingCloses.financialYearId, "ano")))[0].status, "PRONTO_PARA_VALIDACAO");
  } finally {
    release();
    await Promise.allSettled([reopening, closing].filter((value): value is Promise<unknown> => !!value));
    try { await transport?.close(); } finally {
      try { await f.close(); } finally {
        if (prior === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = prior;
      }
    }
  }
});
