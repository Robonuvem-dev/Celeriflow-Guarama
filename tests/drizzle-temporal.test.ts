import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { databaseTimestamp } from "../src/db/temporal";

test("raw PostgreSQL timestamp decoding preserves the UTC instant across host timezones", () => {
  const source = `const {databaseTimestamp}=require('./src/db/temporal.ts'); console.log(JSON.stringify([
    '2026-01-01 05:00:00.123','2026-01-01 05:00:00.123456','2026-01-01',
    '2026-01-01 05:00:00.123+00','2026-01-01 02:00:00.123-03',
    '2026-01-01 10:30:00.123+0530','2026-01-01T05:00:00.123Z',
    '2026-01-01T02:00:00.123-03:00'
  ].map(value=>databaseTimestamp(value).toISOString())));`;
  const expected = ["2026-01-01T05:00:00.123Z", "2026-01-01T05:00:00.123Z", "2026-01-01T00:00:00.000Z", ...Array<string>(5).fill("2026-01-01T05:00:00.123Z")];
  for (const timezone of ["UTC", "America/Sao_Paulo", "Pacific/Auckland"]) {
    const actual = JSON.parse(execFileSync(process.execPath, ["--max-old-space-size=128", "--import", "tsx", "-e", source], { cwd: process.cwd(), env: { ...process.env, TZ: timezone }, encoding: "utf8" }));
    assert.deepEqual(actual, expected, timezone);
  }
});

test("already mapped Date values retain their instant and nullable decisions stay with the caller", () => {
  const input = new Date("2026-10-28T00:00:00.001Z");
  const output = databaseTimestamp(input);
  assert.notEqual(output, input);
  assert.equal(output.getTime(), input.getTime());
  for (const invalid of ["not a timestamp", "infinity", "-infinity", new Date(Number.NaN)]) assert.throws(() => databaseTimestamp(invalid), /Timestamp inválido/);
});
