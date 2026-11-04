import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { drainAutomaticRightsBatches } from "../src/lib/rh/automatic-rights-daily";

test("Vercel Hobby: todos os nove jobs executam no máximo uma vez por dia", async () => {
  const configuration = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(configuration.crons.length, 9);
  for (const cron of configuration.crons) {
    const fields = cron.schedule.split(/\s+/);
    assert.equal(fields.length, 5);
    assert.match(fields[0], /^\d+$/);
    assert.match(fields[1], /^\d+$/);
    assert.ok(Number(fields[0]) < 60 && Number(fields[1]) < 24);
    assert.deepEqual(fields.slice(2), ["*", "*", "*"], cron.path);
  }
});

test("RH diário percorre 198 vínculos em lotes sem repetir falhas na mesma execução", async () => {
  const holders = Array.from({ length: 198 }, (_, index) => `holder-${index}`);
  const attempts: string[] = [];
  const result = await drainAutomaticRightsBatches(async excluded => {
    const selected = holders.filter(id => !excluded.includes(id)).slice(0, 20);
    attempts.push(...selected);
    return { actorId: "rh", referenceDate: "2026-11-03", results: selected.map(contractId => ({ contractId, processed: contractId !== "holder-0" })) };
  }, 1000, () => 0);
  assert.equal(result.completed, true);
  assert.equal(result.results.length, 198);
  assert.equal(new Set(attempts).size, attempts.length);
  assert.equal(result.results.filter(row => !row.processed).length, 1);
});

test("RH diário sinaliza execução parcial ao atingir o orçamento de tempo", async () => {
  let now = 0;
  const result = await drainAutomaticRightsBatches(async () => {
    now = 1000;
    return { actorId: "rh", referenceDate: "2026-11-03", results: [{ contractId: "holder", processed: true }] };
  }, 1000, () => now);
  assert.equal(result.completed, false);
  assert.equal(result.results.length, 1);
});
