import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { getFleetExpenseIndicators } from "../src/lib/frotas/indicators";

test("BI de Frotas usa apenas a projeção canônica, recorte de setor e cobertura de valores", async () => {
  const calls: { where: unknown }[] = [];
  const context = { user: { id: "u", profileCode: "ANALISTA", departmentId: "saude", modulePermissions: [{ code: "FROTAS", canView: true, canEdit: false }] }, prisma: {
    $transaction: async (run: (tx: unknown) => Promise<unknown>, options: unknown) => { assert.deepEqual(options, { isolationLevel: "RepeatableRead" }); return run({ fleetExpense: {
      count: async (input: { where: unknown }) => { calls.push(input); return calls.length === 1 ? 3 : 1; },
      aggregate: async (input: { where: unknown }) => { calls.push(input); return { _sum: { amount: new Prisma.Decimal("123.45") } }; },
      groupBy: async (input: { where: unknown }) => { calls.push(input); return [{ nature: "COMBUSTIVEL", _sum: { amount: new Prisma.Decimal("123.45") }, _count: { _all: 3 } }]; },
    } }); },
  } } as unknown as AppContext;
  const from = new Date("2026-01-01"), to = new Date("2026-09-30");
  const result = await getFleetExpenseIndicators(context, from, to);
  assert.equal(result.knownAmount, "123.45"); assert.equal(result.missing, 1); assert.equal(result.complete, false);
  const where = { unit: { departmentId: "saude" }, occurredAt: { gte: from, lte: to } };
  assert.deepEqual(calls[0].where, where); assert.deepEqual(calls[1].where, where);
  assert.deepEqual(calls[2].where, { AND: [where, { amount: null }] }); assert.deepEqual(calls[3].where, where);
  await assert.rejects(getFleetExpenseIndicators({ ...context, user: { ...context.user, modulePermissions: [] } }, from, to), /perfil/);
  await assert.rejects(getFleetExpenseIndicators(context, to, from), /Período/);
});
